import { supabase } from './supabase';
import { Chat, Message, User } from '../store/useStore';

export interface CreateMessageData {
  senderId: string;
  receiverId: string;
  content: string;
  type?: 'text' | 'audio' | 'image' | 'track';
  trackId?: string; // preferred over embedding JSON in content
}

export class ChatService {
  // UUID validation helper
  private static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  // Canonical chat key: always smaller UUID first
  static chatKey(a: string, b: string): string {
    return [a, b].sort().join('_');
  }

  /**
   * Get all chats for a user.
   *
   * OPTIMIZATION: Uses a Supabase RPC (get_user_chats) that runs DISTINCT ON
   * server-side so only one row per conversation is transferred.
   * Falls back to the client-side dedup approach if the RPC doesn't exist yet.
   *
   * SQL for the RPC (run once in Supabase SQL editor):
   *   See schema recommendations below.
   */
  static async getUserChats(userId: string): Promise<Chat[]> {
    // Try the efficient RPC first
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_user_chats', {
      p_user_id: userId,
    });

    if (!rpcError && rpcData) {
      return (rpcData as any[]).map((row: any) => this.rpcRowToChat(userId, row));
    }

    // Fallback: client-side dedup (original approach, still limited to 40 rows)
    const { data: messages, error } = await supabase
      .from('messages')
      .select(`
        id,
        content,
        created_at,
        type,
        track_id,
        sender_id,
        receiver_id,
        sender:users!messages_sender_id_fkey (
          id, username, avatar, artist_name
        ),
        receiver:users!messages_receiver_id_fkey (
          id, username, avatar, artist_name
        )
      `)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(40);

    if (error) throw new Error(error.message);

    const chatMap = new Map<string, any>();
    messages.forEach((msg: any) => {
      const key = this.chatKey(msg.sender_id, msg.receiver_id);
      if (!chatMap.has(key)) chatMap.set(key, msg);
    });

    const chats: Chat[] = [];
    chatMap.forEach((msg: any, key: string) => {
      chats.push(this.messageRowToChat(userId, msg, key));
    });
    return chats;
  }

  // Get messages between two users
  static async getChatMessages(userId1: string, userId2: string, limit = 50): Promise<Message[]> {
    if (!userId1 || !userId2) throw new Error('Invalid user IDs provided');
    if (!this.isValidUUID(userId1) || !this.isValidUUID(userId2)) {
      throw new Error('Invalid UUID format provided');
    }

    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:users!messages_sender_id_fkey (id, username, avatar, artist_name),
        receiver:users!messages_receiver_id_fkey (id, username, avatar, artist_name),
        track:tracks(id, title, artist, cover, audio_url, duration, genre)
      `)
      .or(
        `and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),` +
        `and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return data.reverse().map((msg) => this.transformMessage(msg));
  }

  // Send a message — returns the created Message so callers can append it locally
  static async sendMessage(data: CreateMessageData): Promise<Message> {
    if (!this.isValidUUID(data.senderId) || !this.isValidUUID(data.receiverId)) {
      throw new Error('Invalid UUID format provided');
    }

    const insert: any = {
      sender_id: data.senderId,
      receiver_id: data.receiverId,
      content: data.content,
      type: data.type || 'text',
    };

    // Use track_id when sharing tracks (avoids storing large JSON in content)
    if (data.trackId) {
      insert.track_id = data.trackId;
      insert.content = ''; // empty — UI reads from track join
    }

    const { data: messageData, error } = await supabase
      .from('messages')
      .insert(insert)
      .select(`
        *,
        sender:users!messages_sender_id_fkey (id, username, avatar, artist_name),
        receiver:users!messages_receiver_id_fkey (id, username, avatar, artist_name),
        track:tracks(id, title, artist, cover, audio_url, duration, genre)
      `)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!messageData) throw new Error('Failed to create message');

    return this.transformMessage(messageData);
  }

  // Delete a message
  static async deleteMessage(messageId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('sender_id', userId);
    if (error) throw new Error(error.message);
  }

  // Update a message
  static async updateMessage(messageId: string, userId: string, newContent: string): Promise<Message> {
    if (!this.isValidUUID(messageId) || !this.isValidUUID(userId)) {
      throw new Error('Invalid UUID format provided');
    }

    const { data: messageData, error } = await supabase
      .from('messages')
      .update({ content: newContent })
      .eq('id', messageId)
      .eq('sender_id', userId)
      .select(`
        *,
        sender:users!messages_sender_id_fkey (id, username, avatar, artist_name),
        receiver:users!messages_receiver_id_fkey (id, username, avatar, artist_name),
        track:tracks(id, title, artist, cover, audio_url, duration, genre)
      `)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!messageData) throw new Error('Message not found or no permission to edit');

    return this.transformMessage(messageData);
  }

  // Delete all messages in a chat
  static async deleteChat(userId1: string, userId2: string): Promise<void> {
    const { error } = await supabase
      .from('messages')
      .delete()
      .or(
        `and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),` +
        `and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`
      );
    if (error) throw new Error(error.message);
  }

  /**
   * Subscribe to new incoming messages in the active chat (from otherUserId → currentUserId).
   * Sender's own messages are added optimistically on send; no subscription needed for them.
   * Returns an unsubscribe function.
   */
  static subscribeToActiveChatMessages(
    currentUserId: string,
    otherUserId: string,
    callback: (message: Message) => void
  ): () => void {
    const channelName = `active_chat_${this.chatKey(currentUserId, otherUserId)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${currentUserId}`,
        },
        async (payload) => {
          const row = payload.new as any;
          // Only process messages from the other participant in this chat
          if (row.sender_id !== otherUserId) return;
          const { data, error } = await supabase
            .from('messages')
            .select(`
              *,
              sender:users!messages_sender_id_fkey (id, username, avatar, artist_name),
              receiver:users!messages_receiver_id_fkey (id, username, avatar, artist_name),
              track:tracks(id, title, artist, cover, audio_url, duration, genre)
            `)
            .eq('id', row.id)
            .maybeSingle();
          if (!error && data) callback(this.transformMessage(data));
        }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }

  /**
   * Subscribe to chat list updates (new chats, last-message preview changes).
   * Does NOT trigger a full message refetch — callers should use
   * subscribeToActiveChatMessages for in-chat realtime.
   */
  static subscribeToChatUpdates(userId: string, callback: (chat: Chat) => void) {
    return supabase
      .channel('chat_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`,
        },
        async (payload) => {
          try {
            const event = payload.eventType;
            if (event === 'INSERT' || event === 'UPDATE') {
              const row = payload.new as { id: string };
              const { data, error } = await supabase
                .from('messages')
                .select(`
                  id, content, created_at, type, track_id, sender_id, receiver_id,
                  sender:users!messages_sender_id_fkey (id, username, avatar, artist_name),
                  receiver:users!messages_receiver_id_fkey (id, username, avatar, artist_name)
                `)
                .eq('id', row.id)
                .maybeSingle();
              if (!error && data) callback(this.messageRowToChat(userId, data));
              return;
            }
            if (event === 'DELETE') {
              const old = payload.old as { sender_id: string; receiver_id: string };
              const otherUserId = old.sender_id === userId ? old.receiver_id : old.sender_id;
              const { data: lastMessages } = await supabase
                .from('messages')
                .select(`
                  id, content, created_at, type, track_id, sender_id, receiver_id,
                  sender:users!messages_sender_id_fkey (id, username, avatar, artist_name),
                  receiver:users!messages_receiver_id_fkey (id, username, avatar, artist_name)
                `)
                .or(
                  `and(sender_id.eq.${userId},receiver_id.eq.${otherUserId}),` +
                  `and(sender_id.eq.${otherUserId},receiver_id.eq.${userId})`
                )
                .order('created_at', { ascending: false })
                .limit(1);
              if (lastMessages?.length) {
                callback(this.messageRowToChat(userId, lastMessages[0]));
              } else {
                const otherUser = await this.getUserById(otherUserId);
                callback(this.emptyChatForPair(userId, otherUserId, otherUser));
              }
            }
          } catch (err) {
            console.error('Error processing chat update:', err);
          }
        }
      )
      .subscribe();
  }

  /** Presence channel name used for online/offline status in chat */
  private static readonly PRESENCE_CHANNEL = 'presence:chat';

  static subscribeToPresence(
    currentUserId: string,
    onPresenceUpdate: (onlineUserIds: Set<string>, userStatuses: Map<string, string>) => void,
    options?: { track?: boolean; userStatus?: string }
  ): () => void {
    const shouldTrack = options?.track !== false;
    const userStatus = options?.userStatus ?? 'online';
    const statusForPresence = userStatus === 'invisible' ? undefined : userStatus;
    const channel = supabase.channel(ChatService.PRESENCE_CHANNEL);

    const notifyPresenceState = () => {
      const state = channel.presenceState() as Record<string, Array<{ user_id?: string; status?: string }>>;
      const onlineIds = new Set<string>();
      const statuses = new Map<string, string>();
      Object.values(state).forEach((presences) => {
        presences.forEach((p) => {
          if (p?.user_id) {
            onlineIds.add(p.user_id);
            statuses.set(p.user_id, p.status || 'online');
          }
        });
      });
      onPresenceUpdate(onlineIds, statuses);
    };

    channel
      .on('presence', { event: 'sync' }, notifyPresenceState)
      .on('presence', { event: 'join' }, notifyPresenceState)
      .on('presence', { event: 'leave' }, notifyPresenceState)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && shouldTrack && statusForPresence) {
          await channel.track({ user_id: currentUserId, status: statusForPresence, online_at: new Date().toISOString() });
        }
      });

    return () => { channel.unsubscribe(); };
  }

  // Search users for starting new chats
  static async searchUsers(query: string, currentUserId: string, limit?: number): Promise<User[]> {
    const defaultLimit = limit || (query ? 10 : 20);
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, avatar, followers, following, role, is_verified, is_verified_artist, artist_name, bio, genres')
      .neq('id', currentUserId)
      .ilike('username', `%${query}%`)
      .limit(defaultLimit);

    if (error) throw new Error(error.message);

    return data.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      avatar: u.avatar,
      followers: u.followers,
      following: u.following,
      role: u.role,
      isVerified: u.is_verified,
      isVerifiedArtist: u.is_verified_artist ?? false,
      artistName: u.artist_name,
      bio: u.bio,
      genres: u.genres,
    }));
  }

  private static userFromDbRow(data: Record<string, unknown>): User {
    return {
      id: data.id as string,
      username: data.username as string,
      email: data.email as string,
      avatar: data.avatar as string,
      followers: data.followers as number,
      following: data.following as number,
      role: data.role as User['role'],
      isVerified: data.is_verified as boolean,
      isPrivate: data.is_private as boolean,
      isVerifiedArtist: (data.is_verified_artist as boolean) ?? false,
      artistName: data.artist_name as string | undefined,
      bio: data.bio as string | undefined,
      genres: data.genres as string[] | undefined,
      externalLinks: (data.external_links as string[]) ?? [],
      subscriptionTier: (data.subscription_tier as 'free' | 'pro') ?? 'free',
      bannerUrl: data.banner_url as string | undefined,
      vanityUrl: data.vanity_url as string | undefined,
    };
  }

  static async getProfileByVanityUrl(handle: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('vanity_url', handle.toLowerCase())
      .maybeSingle();
    if (error || !data) return null;
    return this.userFromDbRow(data as Record<string, unknown>);
  }

  static async isVanityUrlAvailable(handle: string, excludeUserId: string): Promise<boolean> {
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('vanity_url', handle.toLowerCase())
      .neq('id', excludeUserId)
      .maybeSingle();
    return !data;
  }

  // Get user by ID
  static async getUserById(userId: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;

    return this.userFromDbRow(data as Record<string, unknown>);
  }

  /** Resolve public profile URL segment: UUID → by id, otherwise by username (stored lowercase). */
  static async getProfileBySlug(slug: string): Promise<User | null> {
    let s = slug.trim();
    if (!s) return null;
    try {
      s = decodeURIComponent(s);
    } catch {
      /* keep s */
    }
    if (this.isValidUUID(s)) {
      return this.getUserById(s);
    }
    const key = s.toLowerCase();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', key)
      .maybeSingle();

    if (error || !data) return null;
    return this.userFromDbRow(data as Record<string, unknown>);
  }

  // Mark messages as read
  static async markMessagesAsRead(senderId: string, receiverId: string): Promise<void> {
    const { error } = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', senderId)
      .eq('receiver_id', receiverId)
      .is('read_at', null);
    if (error) console.error('Error marking messages as read:', error);
  }

  // --- Private helpers ---

  private static transformMessage(dbMessage: any): Message {
    const msg: Message = {
      id: dbMessage.id,
      senderId: dbMessage.sender_id,
      content: dbMessage.content,
      timestamp: new Date(dbMessage.created_at),
      type: dbMessage.type,
    };
    // Attach joined track data if available, mapping snake_case → camelCase
    if (dbMessage.track) {
      (msg as any).track = {
        id: dbMessage.track.id,
        title: dbMessage.track.title,
        artist: dbMessage.track.artist,
        cover: dbMessage.track.cover,
        audioUrl: dbMessage.track.audio_url,
        duration: dbMessage.track.duration,
        genre: dbMessage.track.genre,
      };
    }
    return msg;
  }

  private static messageRowToChat(userId: string, msgRow: any, chatId?: string): Chat {
    const key = chatId ?? this.chatKey(msgRow.sender_id, msgRow.receiver_id);
    const otherUserId = msgRow.sender_id === userId ? msgRow.receiver_id : msgRow.sender_id;
    const otherInfo = msgRow.sender_id === userId ? msgRow.receiver : msgRow.sender;
    return {
      id: key,
      participants: [
        { id: userId, username: '', email: 'unknown@remix.app', avatar: '', followers: 0, following: 0, role: 'consumer', isVerified: false },
        { id: otherUserId, username: otherInfo?.username || '', email: 'unknown@remix.app', avatar: otherInfo?.avatar || '', followers: 0, following: 0, role: 'consumer', isVerified: false },
      ],
      messages: [],
      lastMessage: this.transformMessage(msgRow),
    };
  }

  private static rpcRowToChat(userId: string, row: any): Chat {
    return {
      id: this.chatKey(userId, row.other_user_id),
      participants: [
        { id: userId, username: '', email: 'unknown@remix.app', avatar: '', followers: 0, following: 0, role: 'consumer', isVerified: false },
        { id: row.other_user_id, username: row.other_username || '', email: 'unknown@remix.app', avatar: row.other_avatar || '', followers: 0, following: 0, role: 'consumer', isVerified: false },
      ],
      messages: [],
      lastMessage: {
        id: row.last_message_id,
        senderId: row.last_sender_id,
        content: row.last_content,
        timestamp: new Date(row.last_created_at),
        type: row.last_type,
      },
    };
  }

  private static emptyChatForPair(userId: string, otherUserId: string, otherUser: User | null): Chat {
    return {
      id: this.chatKey(userId, otherUserId),
      participants: [
        { id: userId, username: '', email: 'unknown@remix.app', avatar: '', followers: 0, following: 0, role: 'consumer', isVerified: false },
        { id: otherUserId, username: otherUser?.username || '', email: 'unknown@remix.app', avatar: otherUser?.avatar || '', followers: 0, following: 0, role: 'consumer', isVerified: false },
      ],
      messages: [],
      lastMessage: undefined,
    };
  }
}
