import { supabase } from './supabase';
import { User } from '../store/useStore';
import { BlockService, withoutHiddenUsers } from './blockService';
import { appError } from '../utils/appError';

export interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderUsername: string;
  senderAvatar?: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'track';
  track?: {
    id: string; title: string; artist: string; cover: string;
    audioUrl: string; duration: number; genre: string;
  };
}

export interface GroupChat {
  id: string;
  name: string;
  avatar?: string;
  creatorId: string;
  members: User[];
  lastMessage?: GroupMessage;
}

export class GroupChatService {
  static readonly MAX_MEMBERS = 8;

  static async createGroupChat(creatorId: string, name: string, memberIds: string[]): Promise<GroupChat> {
    const allIds = [creatorId, ...memberIds.filter((id) => id !== creatorId)];
    if (allIds.length > this.MAX_MEMBERS) {
      throw appError('chat.groupCap', undefined, { max: this.MAX_MEMBERS });
    }
    const { data: group, error: ge } = await supabase
      .from('group_chats')
      .insert({ name: name.trim(), created_by: creatorId })
      .select()
      .single();
    if (ge || !group) throw appError('errors.generic.group', ge);

    const { error: me } = await supabase
      .from('group_chat_members')
      .insert(allIds.map((user_id) => ({ group_id: group.id, user_id })));
    if (me) throw new Error(me.message);

    const members = await this.getGroupMembers(group.id);
    return { id: group.id, name: group.name, creatorId, members };
  }

  static async getUserGroupChats(userId: string): Promise<GroupChat[]> {
    const { data: rows, error } = await supabase
      .from('group_chat_members')
      .select('group_id')
      .eq('user_id', userId);
    if (error || !rows?.length) return [];

    const groupIds = rows.map((r: any) => r.group_id);
    const { data: groups, error: ge } = await supabase
      .from('group_chats')
      .select('*')
      .in('id', groupIds)
      .order('created_at', { ascending: false });
    if (ge || !groups) return [];

    return Promise.all(
      groups.map(async (g: any) => {
        const members = await this.getGroupMembers(g.id);
        const lastMessage = await this.getLastMessage(g.id);
        return { id: g.id, name: g.name, avatar: g.avatar, creatorId: g.created_by, members, lastMessage };
      }),
    );
  }

  /** One page of group messages, oldest first; `before` loads the page before an ISO timestamp. */
  static async getGroupMessages(
    groupId: string,
    options: { limit?: number; before?: string } = {},
  ): Promise<{ messages: GroupMessage[]; hasMore: boolean }> {
    const limit = options.limit ?? 60;
    let query = supabase
      .from('group_messages')
      .select(`
        id, group_id, sender_id, content, type, created_at,
        sender:users!group_messages_sender_id_fkey(id, username, avatar),
        track:tracks(id, title, artist, cover, audio_url, duration, genre)
      `)
      .eq('group_id', groupId);
    if (options.before) query = query.lt('created_at', options.before);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return {
      messages: withoutHiddenUsers(data.reverse(), (m: any) => m.sender_id).map(this.transform),
      // Counted before hiding blocked users, so a blocked sender at the page
      // boundary can't make the history look complete.
      hasMore: data.length === limit,
    };
  }

  static async sendGroupMessage(
    groupId: string,
    senderId: string,
    content: string,
    type: 'text' | 'track' = 'text',
    trackId?: string,
  ): Promise<GroupMessage> {
    const insert: any = { group_id: groupId, sender_id: senderId, content, type };
    if (trackId) { insert.track_id = trackId; insert.content = ''; }

    const { data, error } = await supabase
      .from('group_messages')
      .insert(insert)
      .select(`
        id, group_id, sender_id, content, type, created_at,
        sender:users!group_messages_sender_id_fkey(id, username, avatar),
        track:tracks(id, title, artist, cover, audio_url, duration, genre)
      `)
      .single();
    if (error || !data) throw appError('errors.chat.send', error);
    return this.transform(data);
  }

  static async deleteGroupMessage(messageId: string, senderId: string): Promise<void> {
    const { error } = await supabase
      .from('group_messages')
      .delete()
      .eq('id', messageId)
      .eq('sender_id', senderId);
    if (error) throw new Error(error.message);
  }

  static async addMember(groupId: string, userId: string): Promise<void> {
    const members = await this.getGroupMembers(groupId);
    if (members.length >= this.MAX_MEMBERS) throw appError('errors.chat.groupFull', undefined, { max: this.MAX_MEMBERS });
    const { error } = await supabase
      .from('group_chat_members')
      .insert({ group_id: groupId, user_id: userId });
    if (error) throw new Error(error.message);
  }

  static async leaveGroup(groupId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('group_chat_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  static subscribeToGroupMessages(
    groupId: string,
    currentUserId: string,
    callback: (msg: GroupMessage) => void,
    /** Group members, so a sender's name/avatar can be filled in without a lookup. */
    members: Pick<User, 'id' | 'username' | 'avatar'>[] = [],
  ): () => void {
    const ch = supabase
      .channel(`gm_${groupId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'group_messages',
        filter: `group_id=eq.${groupId}`,
      }, async (payload) => {
        const row = payload.new as any;
        if (row.sender_id === currentUserId) return;
        if (BlockService.isHidden(row.sender_id)) return;
        // Fast path: known sender, no shared track — the realtime row is enough.
        const member = members.find((m) => m.id === row.sender_id);
        if (member && !row.track_id) {
          callback(GroupChatService.transform({ ...row, sender: member }));
          return;
        }
        const { data } = await supabase
          .from('group_messages')
          .select(`
            id, group_id, sender_id, content, type, created_at,
            sender:users!group_messages_sender_id_fkey(id, username, avatar),
            track:tracks(id, title, artist, cover, audio_url, duration, genre)
          `)
          .eq('id', row.id)
          .maybeSingle();
        if (data) callback(GroupChatService.transform(data));
      })
      .subscribe();
    return () => { ch.unsubscribe(); };
  }

  private static async getGroupMembers(groupId: string): Promise<User[]> {
    const { data, error } = await supabase
      .from('group_chat_members')
      .select('users(id, username, avatar, email, is_verified, is_verified_artist)')
      .eq('group_id', groupId);
    if (error || !data) return [];
    return data.map((r: any) => ({
      id: r.users.id,
      username: r.users.username,
      email: r.users.email ?? '',
      avatar: r.users.avatar ?? '',
      followers: 0, following: 0, role: 'consumer' as const,
      isVerified: r.users.is_verified ?? false,
      isPrivate: false,
      isVerifiedArtist: r.users.is_verified_artist ?? false,
      externalLinks: [],
    }));
  }

  private static async getLastMessage(groupId: string): Promise<GroupMessage | undefined> {
    const { data } = await supabase
      .from('group_messages')
      .select('id, group_id, sender_id, content, type, created_at, sender:users!group_messages_sender_id_fkey(id, username, avatar)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? this.transform(data) : undefined;
  }

  static transform(row: any): GroupMessage {
    return {
      id: row.id,
      groupId: row.group_id,
      senderId: row.sender_id,
      senderUsername: row.sender?.username ?? '',
      senderAvatar: row.sender?.avatar ?? undefined,
      content: row.content ?? '',
      timestamp: new Date(row.created_at),
      type: row.type ?? 'text',
      track: row.track ? {
        id: row.track.id, title: row.track.title, artist: row.track.artist,
        cover: row.track.cover, audioUrl: row.track.audio_url,
        duration: row.track.duration, genre: row.track.genre,
      } : undefined,
    };
  }
}
