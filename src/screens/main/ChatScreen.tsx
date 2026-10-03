import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Pressable,
  View,
  Text as RNText,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Keyboard,
  ScrollView,
  type TextProps,
} from 'react-native';
import { FONTS } from '../../utils/fonts';
import { colors } from '../../theme';
import { supabase } from '../../services/supabase';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useRoute, RouteProp } from '@react-navigation/native';
import {
  Send, MessageCircle, Users, Music, X, Plus, Check,
  Moon, EyeOff, ArrowLeft, Crown, SkipForward, Radio, ListMusic, Info, MoreHorizontal,
} from 'lucide-react-native';
import { BlockService } from '../../services/blockService';
import ReportSheet from '../../components/moderation/ReportSheet';
import type { ReportTarget } from '../../services/reportService';
import { format } from 'date-fns';
import { ChatService } from '../../services/chatService';
import { GroupChatService, GroupChat, GroupMessage } from '../../services/groupChatService';
import { getAvatarUrl } from '../../utils/avatar';
import { useStore, setTrackEndHandler, User, Chat, Message, Track } from '../../store/useStore';
import ChatMusicShare from '../../components/music/ChatMusicShare';
import { MusicService } from '../../services/musicService';
import { safeLog } from '../../utils/debugUtils';
import VerifiedBadge from '../../components/VerifiedBadge';
import { storage, STORAGE_KEYS } from '../../platform/storage';
import { ChatStackParamList } from '../../navigation/stacks/ChatStack';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '../../utils/dateLocale';
import DjTrackPicker from '../../components/chat/DjTrackPicker';
import { isRateLimited } from '../../utils/appError';

type ChatRoute = RouteProp<ChatStackParamList, 'Chat'>;
type ActiveTab = 'chat' | 'dj';
type ListTab = 'dms' | 'groups';

const Text = ({ style, ...props }: TextProps) => (
  <RNText style={[{ fontFamily: FONTS.body }, style]} {...props} />
);

function AvatarImage({ uri, size = 36 }: { uri?: string | null; size?: number }) {
  const src = getAvatarUrl(uri);
  if (src.startsWith('http')) {
    return (
      <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
      <Users size={size * 0.45} color={colors.textMuted} />
    </View>
  );
}

// Stacked avatar row for group chat items
function GroupAvatarStack({ members, size = 36 }: { members: User[]; size?: number }) {
  const shown = members.slice(0, 3);
  const overlap = size * 0.35;
  return (
    <View style={{ width: size + overlap * (shown.length - 1), height: size }}>
      {shown.map((m, i) => (
        <View key={m.id} style={{ position: 'absolute', left: i * overlap, zIndex: shown.length - i }}>
          <AvatarImage uri={m.avatar} size={size} />
        </View>
      ))}
    </View>
  );
}

// Messages shown before the server confirms them. Failed ones can be retried.
type Pending = { pending?: boolean; failed?: boolean };
type UIMessage = Message & Pending;
type UIGroupMessage = GroupMessage & Pending;

// Stable across renders so the message lists don't re-render on every keystroke.
const messageKey = <T extends { id: string }>(m: T) => m.id;

// Last-loaded messages per DM partner, so reopening a conversation is instant
// while a fresh copy loads in the background.
const dmCache = new Map<string, Message[]>();

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
const sameMap = (a: Map<string, string>, b: Map<string, string>) =>
  a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

const tempId = () => `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const ChatScreen: React.FC = () => {
  const { t } = useTranslation();
  const { user, isAuthenticated, playTrack, userStatus, player, setConversationOpen } = useStore() as any;
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const route = useRoute<ChatRoute>();
  const openUserId = route.params?.openUserId;

  // ── DM state ──────────────────────────────────────────────────────────────
  const [listTab, setListTab] = useState<ListTab>('dms');
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  // Older history: the list loads the latest page, then earlier pages on scroll-up.
  const [hasMoreDm, setHasMoreDm] = useState(false);
  const [loadingOlderDm, setLoadingOlderDm] = useState(false);
  const [hasMoreGroup, setHasMoreGroup] = useState(false);
  const [loadingOlderGroup, setLoadingOlderGroup] = useState(false);
  const loadingOlderRef = useRef(false);
  const [message, setMessage] = useState('');
  const [showUserList, setShowUserList] = useState(false);
  const [showMusicShare, setShowMusicShare] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const flatListRef = useRef<FlatList<Message>>(null);
  const deletedChatIdsRef = useRef<Set<string>>(new Set());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [userTracks, setUserTracks] = useState<Track[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [trackSendError, setTrackSendError] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState(true);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [userStatuses, setUserStatuses] = useState<Map<string, string>>(new Map());
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // ── Group chat state ──────────────────────────────────────────────────────
  const [groupChats, setGroupChats] = useState<GroupChat[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [activeGroupChat, setActiveGroupChat] = useState<GroupChat | null>(null);
  const [groupMessages, setGroupMessages] = useState<UIGroupMessage[]>([]);
  const [groupMessage, setGroupMessage] = useState('');
  const groupFlatListRef = useRef<FlatList<GroupMessage>>(null);
  const [showGroupInfo, setShowGroupInfo] = useState(false);

  // Group creation
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<User[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // ── DJ Room state ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat');
  const [djQueue, setDjQueue] = useState<Track[]>([]);
  const [djCurrentIdx, setDjCurrentIdx] = useState(0);
  const [djHostId, setDjHostId] = useState<string | null>(null);
  const [showTrackPicker, setShowTrackPicker] = useState(false);
  const djChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const djCurrentIdxRef = useRef(0);
  djCurrentIdxRef.current = djCurrentIdx;
  // Refs for the end-of-track handler, which runs outside React renders.
  const djQueueRef = useRef<Track[]>([]);
  djQueueRef.current = djQueue;
  const djHostIdRef = useRef<string | null>(null);
  djHostIdRef.current = djHostId;
  /** The room played its last track; the next track added starts right away. */
  const djEndedRef = useRef(false);
  /** Listener fallback: take over as DJ if the DJ doesn't advance (e.g. they left). */
  const djTakeoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Late-joiner sync: pending reply, and whether someone already answered. */
  const syncReplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncAnsweredRef = useRef(false);

  /** True when the listener paused because the DJ did (so a DJ resume resumes them). */
  const pausedByDjRef = useRef(false);

  /**
   * Listener: follow the DJ's playback. Only the DJ controls the room; a
   * listener's own pause is respected (periodic checks won't restart them),
   * but drift of more than 2 s while playing is corrected.
   */
  const applyDjPlayback = (p: any) => {
    if (!p || djHostIdRef.current === user?.id) return;
    const queue = djQueueRef.current;
    if (p.idx !== djCurrentIdxRef.current || queue[p.idx]?.id !== p.trackId) return; // queue_update handles track changes
    const st = useStore.getState() as any;
    const pl = st.player;
    if (pl.currentTrack?.id !== p.trackId || !pl.isLoaded) return; // not listening to the room right now
    const elapsed = p.isPlaying ? Math.min(Math.max((Date.now() - (p.sentAt ?? Date.now())) / 1000, 0), 5) : 0;
    const target = (p.positionSec ?? 0) + elapsed;
    const drift = Math.abs((pl.currentTime ?? 0) - target);

    if (!p.isPlaying) {
      // DJ paused (or scrubbed while paused): pause here and line up.
      if (pl.isPlaying) { pausedByDjRef.current = true; st.pauseTrack(); }
      if (drift > 1) st.seekTo(target);
      return;
    }
    if (!pl.isPlaying) {
      // Resume only if it was the DJ who paused us; a listener's own pause stays.
      if (p.reason === 'resume' && pausedByDjRef.current) {
        pausedByDjRef.current = false;
        if (drift > 1) st.seekTo(target);
        st.resumeTrack();
      }
      return;
    }
    if (p.reason === 'seek' ? drift > 1 : drift > 2) st.seekTo(target);
  };

  /** Starts `track` and seeks to `sec` once the player has loaded it. */
  const joinAt = (track: Track, sec: number) => {
    playTrack(track);
    if (sec < 1) return;
    const started = Date.now();
    const unsubscribe = useStore.subscribe((st: any) => {
      const pl = st.player;
      if (pl.currentTrack?.id !== track.id || Date.now() - started > 8000) { unsubscribe(); return; }
      if (!pl.isLoaded) return;
      unsubscribe();
      // Allow for the load time, and stay clear of the very end of the track.
      const target = sec + (Date.now() - started) / 1000;
      const max = pl.duration > 0 ? pl.duration - 2 : target;
      if (target > 0 && target < max) st.seekTo(target);
    });
  };

  // Inverted lists render newest-first, which keeps the latest message at the
  // bottom with no scroll-to-end jumps. Memoised so typing doesn't rebuild them.
  const visibleMessages = useMemo(() => messages.filter((m) => m.content !== '👋').reverse(), [messages]);
  const visibleGroupMessages = useMemo(() => [...groupMessages].reverse(), [groupMessages]);

  const isHost = djHostId === user?.id;
  const djCurrentTrack = djQueue[djCurrentIdx] ?? null;

  // Unified active conversation ID (used for DJ channel)
  const activeChatId = activeChat?.id ?? activeGroupChat?.id ?? null;

  // ── Effects ───────────────────────────────────────────────────────────────
  const conversationOpen = isFocused && !!(activeChat || activeGroupChat);
  useEffect(() => {
    setConversationOpen(conversationOpen);
  }, [conversationOpen]);
  useEffect(() => () => setConversationOpen(false), []);

  useEffect(() => {
    // iOS has "will" events, so spacing changes with the keyboard animation rather
    // than jumping after it; Android only emits "did".
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (!openUserId || loadingChats || !chats.length) return;
    const target = chats.find((c) => c.participants.some((p) => p.id === openUserId));
    if (target) setActiveChat(target);
  }, [openUserId, chats, loadingChats]);

  useEffect(() => {
    if (!user?.id) return;
    storage.getJSON<string[]>(STORAGE_KEYS.deletedChats(user.id))
      .then((stored) => { if (stored) deletedChatIdsRef.current = new Set(stored); });
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    return ChatService.subscribeToPresence(
      user.id,
      (ids, statuses) => {
        setOnlineUserIds((prev) => (sameSet(prev, ids) ? prev : ids));
        setUserStatuses((prev) => (sameMap(prev, statuses) ? prev : statuses));
      },
      { track: userStatus !== 'invisible', userStatus },
    );
  }, [user?.id, userStatus]);

  useEffect(() => {
    if (!user) { setLoadingChats(false); return; }
    setLoadingChats(true);
    ChatService.getUserChats(user.id)
      .then((list) => setChats(list.filter((c) => !deletedChatIdsRef.current.has(c.id))))
      .finally(() => setLoadingChats(false));
    const sub = ChatService.subscribeToChatUpdates(user.id, (updated) => {
      if (deletedChatIdsRef.current.has(updated.id)) return;
      setChats((prev) => [updated, ...prev.filter((c) => c.id !== updated.id)]);
    });
    return () => { sub?.unsubscribe?.(); };
  }, [user?.id]);

  // Load group chats when groups tab is opened
  useEffect(() => {
    if (!user || listTab !== 'groups') return;
    setLoadingGroups(true);
    GroupChatService.getUserGroupChats(user.id)
      .then(setGroupChats)
      .finally(() => setLoadingGroups(false));
  }, [user?.id, listTab]);

  // DM messages
  useEffect(() => {
    if (!user || !activeChat) return;
    const otherId = getOtherUserId(activeChat);
    if (!otherId) return;
    const cached = dmCache.get(otherId);
    setMessages(cached ?? []);
    setLoadingMessages(!cached);
    let cancelled = false;
    setHasMoreDm(false);
    ChatService.getChatMessages(user.id, otherId)
      .then(({ messages: list, hasMore }) => {
        if (cancelled) return;
        // Keep anything still sending (or failed) on top of the fresh copy.
        setMessages((prev) => [...list, ...prev.filter((m) => m.pending || m.failed)]);
        setHasMoreDm(hasMore);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingMessages(false); });
    return () => { cancelled = true; };
  }, [activeChat?.id, user?.id]);

  useEffect(() => {
    if (!user || !activeChat) return;
    const otherId = getOtherUserId(activeChat);
    if (!otherId) return;
    return ChatService.subscribeToActiveChatMessages(user.id, otherId, (newMsg) => {
      setMessages((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]);
    });
  }, [activeChat?.id, user?.id]);

  // Remember confirmed messages for instant reopening.
  useEffect(() => {
    if (!activeChat) return;
    const otherId = getOtherUserId(activeChat);
    if (otherId) dmCache.set(otherId, messages.filter((m) => !m.pending && !m.failed));
  }, [messages]);

  // Group messages
  useEffect(() => {
    if (!user || !activeGroupChat) return;
    let cancelled = false;
    setHasMoreGroup(false);
    GroupChatService.getGroupMessages(activeGroupChat.id)
      .then(({ messages: list, hasMore }) => {
        if (cancelled) return;
        setGroupMessages(list);
        setHasMoreGroup(hasMore);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeGroupChat?.id, user?.id]);

  // Prepends the page before the oldest loaded message. Fired by the inverted
  // lists' onEndReached, i.e. when you scroll up to the top of the history.
  const loadOlderDirectMessages = async () => {
    if (!user || !activeChat || !hasMoreDm || loadingOlderRef.current) return;
    const otherId = getOtherUserId(activeChat);
    const oldest = messages.find((m) => !m.pending && !m.failed);
    if (!otherId || !oldest) return;
    loadingOlderRef.current = true;
    setLoadingOlderDm(true);
    try {
      const { messages: older, hasMore } = await ChatService.getChatMessages(user.id, otherId, {
        before: new Date(oldest.timestamp).toISOString(),
      });
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !known.has(m.id)), ...prev];
      });
      setHasMoreDm(hasMore);
    } catch {
      // Leave hasMore as-is so the next scroll retries.
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderDm(false);
    }
  };

  const loadOlderGroupMessages = async () => {
    if (!user || !activeGroupChat || !hasMoreGroup || loadingOlderRef.current) return;
    const oldest = groupMessages.find((m) => !m.pending && !m.failed);
    if (!oldest) return;
    loadingOlderRef.current = true;
    setLoadingOlderGroup(true);
    try {
      const { messages: older, hasMore } = await GroupChatService.getGroupMessages(activeGroupChat.id, {
        before: new Date(oldest.timestamp).toISOString(),
      });
      setGroupMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !known.has(m.id)), ...prev];
      });
      setHasMoreGroup(hasMore);
    } catch {
      // Leave hasMore as-is so the next scroll retries.
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderGroup(false);
    }
  };

  // Top of an inverted list (= its footer): spinner while loading, or a marker
  // once the whole history is loaded.
  const historyEdge = (loading: boolean, hasMore: boolean, count: number) =>
    loading ? (
      <View style={s.historyEdge}><ActivityIndicator size="small" color={colors.textMuted} /></View>
    ) : !hasMore && count > 0 ? (
      <View style={s.historyEdge}><Text style={s.historyEdgeText}>{t('chat.startOfConversation')}</Text></View>
    ) : null;

  useEffect(() => {
    if (!user || !activeGroupChat) return;
    return GroupChatService.subscribeToGroupMessages(activeGroupChat.id, user.id, (msg) => {
      setGroupMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
      setGroupChats((prev) => prev.map((g) =>
        g.id === activeGroupChat.id ? { ...g, lastMessage: msg } : g,
      ));
    }, activeGroupChat.members);
  }, [activeGroupChat?.id, user?.id]);

  // Music share modal
  useEffect(() => {
    if (!showMusicShare || !user) return;
    setLoadingTracks(true);
    MusicService.getUserTracks(user.id)
      .then(setUserTracks).catch(() => setUserTracks([]))
      .finally(() => setLoadingTracks(false));
  }, [showMusicShare, user]);

  // User list (DM new chat + group creation)
  useEffect(() => {
    if (!user || (!showUserList && !showCreateGroup) || allUsers.length > 0) return;
    let cancelled = false;
    ChatService.searchUsers('', user.id).then((list) => { if (!cancelled) setAllUsers(list); });
    return () => { cancelled = true; };
  }, [user, showUserList, showCreateGroup, allUsers.length]);

  // Conversation broadcast channel (active for the whole DM or group): the DJ
  // Room, late-joiner sync and message deletions.
  useEffect(() => {
    if (!activeChatId) return;
    const ch = supabase
      .channel(`dj_room:${activeChatId}`)
      .on('broadcast', { event: 'queue_update' }, ({ payload }: any) => {
        const prevIdx = djCurrentIdxRef.current;
        const newQueue: Track[] = payload.queue ?? [];
        const newIdx: number = payload.currentIdx ?? 0;
        setDjQueue(newQueue);
        setDjCurrentIdx(newIdx);
        if (payload.hostId) setDjHostId(payload.hostId);
        if (newIdx !== prevIdx) {
          djEndedRef.current = false;
          pausedByDjRef.current = false;
          if (djTakeoverTimerRef.current) { clearTimeout(djTakeoverTimerRef.current); djTakeoverTimerRef.current = null; }
          if (newQueue[newIdx]) playTrack(newQueue[newIdx]);
        }
      })
      .on('broadcast', { event: 'host_claim' }, ({ payload }: any) => {
        setDjHostId(payload.hostId);
      })
      // The DJ paused, resumed, seeked, or sent a periodic position check.
      .on('broadcast', { event: 'playback' }, ({ payload }: any) => {
        applyDjPlayback(payload);
      })
      // The sender deleted a message (text or shared track): remove it here too.
      .on('broadcast', { event: 'message_deleted' }, ({ payload }: any) => {
        const id = payload?.id;
        if (!id) return;
        setMessages((prev) => prev.filter((m) => m.id !== id));
        setGroupMessages((prev) => prev.filter((m) => m.id !== id));
      })
      // ── Late joiners ──────────────────────────────────────────────────────
      // Someone just opened this chat and asks what's playing. The DJ answers
      // right away; if there's no DJ here (they left), anyone holding the
      // queue answers after a short random delay, unless someone beat them.
      .on('broadcast', { event: 'sync_request' }, ({ payload }: any) => {
        if (!djQueueRef.current.length) return;
        const amHost = djHostIdRef.current === user?.id;
        // Non-DJs wait so the DJ (if still here) answers first.
        const delay = amHost ? 0 : 1200 + Math.random() * 1500;
        if (syncReplyTimerRef.current) clearTimeout(syncReplyTimerRef.current);
        syncAnsweredRef.current = false;
        syncReplyTimerRef.current = setTimeout(() => {
          syncReplyTimerRef.current = null;
          if (!amHost && syncAnsweredRef.current) return;
          const queue = djQueueRef.current;
          const idx = djCurrentIdxRef.current;
          const { player: pl } = useStore.getState() as any;
          const playingRoomTrack = pl.currentTrack?.id === queue[idx]?.id;
          ch.send({
            type: 'broadcast',
            event: 'sync_state',
            payload: {
              to: payload?.from,
              queue,
              currentIdx: idx,
              hostId: djHostIdRef.current,
              positionSec: playingRoomTrack ? pl.currentTime ?? 0 : 0,
              isPlaying: playingRoomTrack ? !!pl.isPlaying : false,
              ended: djEndedRef.current,
              sentAt: Date.now(),
            },
          });
        }, delay);
      })
      .on('broadcast', { event: 'sync_state' }, ({ payload }: any) => {
        // Someone answered: other members stand down.
        syncAnsweredRef.current = true;
        if (syncReplyTimerRef.current && djHostIdRef.current !== user?.id) {
          clearTimeout(syncReplyTimerRef.current);
          syncReplyTimerRef.current = null;
        }
        // Only the member who asked, and only while their room is still empty.
        if (payload?.to !== user?.id || djQueueRef.current.length) return;
        const queue: Track[] = payload.queue ?? [];
        const idx: number = payload.currentIdx ?? 0;
        if (!queue.length) return;
        setDjQueue(queue);
        setDjCurrentIdx(idx);
        if (payload.hostId) setDjHostId(payload.hostId);
        djEndedRef.current = !!payload.ended;
        const track = queue[idx];
        if (!track || !payload.isPlaying || payload.ended) return;
        // Pick up where the room is: their position plus the time the message took.
        const elapsed = Math.min(Math.max((Date.now() - (payload.sentAt ?? Date.now())) / 1000, 0), 5);
        joinAt(track, (payload.positionSec ?? 0) + elapsed);
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED' && user?.id) {
          ch.send({ type: 'broadcast', event: 'sync_request', payload: { from: user.id } });
        }
      });
    djChannelRef.current = ch;
    return () => {
      ch.unsubscribe();
      djChannelRef.current = null;
      if (syncReplyTimerRef.current) { clearTimeout(syncReplyTimerRef.current); syncReplyTimerRef.current = null; }
    };
  }, [activeChatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset DJ + tab state when conversation changes
  useEffect(() => {
    setActiveTab('chat');
    setDjQueue([]);
    setDjCurrentIdx(0);
    setDjHostId(null);
    djEndedRef.current = false;
  }, [activeChatId]);

  // DJ: share pause / resume / seek right away, plus the position every 10 s
  // so listeners who drifted (buffering) get pulled back in.
  useEffect(() => {
    if (!activeChatId || !user?.id) return;
    const me = user.id as string;
    let last: { trackId?: string; t: number; wall: number; playing: boolean } = { t: 0, wall: Date.now(), playing: false };
    let lastSent = 0;

    const roomTrackPlaying = (pl: any) => {
      const queue = djQueueRef.current;
      const idx = djCurrentIdxRef.current;
      return djHostIdRef.current === me && !!queue[idx] && pl.currentTrack?.id === queue[idx].id && pl.isLoaded;
    };
    const send = (pl: any, reason: 'pause' | 'resume' | 'seek' | 'tick') => {
      lastSent = Date.now();
      djChannelRef.current?.send({
        type: 'broadcast',
        event: 'playback',
        payload: {
          trackId: pl.currentTrack.id,
          idx: djCurrentIdxRef.current,
          positionSec: pl.currentTime ?? 0,
          isPlaying: !!pl.isPlaying,
          reason,
          sentAt: Date.now(),
        },
      });
    };

    const unsubscribe = useStore.subscribe((st: any) => {
      const pl = st.player;
      if (!roomTrackPlaying(pl) || pl.isBuffering) return;
      const now = Date.now();
      const t = pl.currentTime ?? 0;
      if (last.trackId !== pl.currentTrack.id) {
        last = { trackId: pl.currentTrack.id, t, wall: now, playing: !!pl.isPlaying };
        return;
      }
      const nearEnd = pl.duration > 0 && t >= pl.duration - 1;
      if (!!pl.isPlaying !== last.playing && !nearEnd) {
        send(pl, pl.isPlaying ? 'resume' : 'pause');
      } else {
        const expected = last.t + (last.playing ? (now - last.wall) / 1000 : 0);
        if (Math.abs(t - expected) > 2.5 && now - lastSent > 700) send(pl, 'seek');
      }
      last = { trackId: pl.currentTrack.id, t, wall: now, playing: !!pl.isPlaying };
    });

    const timer = setInterval(() => {
      const pl = (useStore.getState() as any).player;
      if (roomTrackPlaying(pl) && pl.isPlaying && Date.now() - lastSent > 9000) send(pl, 'tick');
    }, 10000);

    return () => { unsubscribe(); clearInterval(timer); };
  }, [activeChatId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-advance: when a DJ Room track finishes, the room's queue moves on
  // (not the listener's personal queue). The DJ's phone advances and
  // broadcasts; listeners wait for that, and if it never comes (the DJ left
  // the chat) one of them takes over after a few seconds.
  useEffect(() => {
    if (!activeChatId || !user?.id) return;
    const me = user.id as string;
    const send = (event: string, payload: Record<string, unknown>) =>
      djChannelRef.current?.send({ type: 'broadcast', event, payload });

    const unregister = setTrackEndHandler((track) => {
      const queue = djQueueRef.current;
      const idx = djCurrentIdxRef.current;
      if (!track || queue[idx]?.id !== track.id) return false; // not the room's track
      const next = idx + 1;
      if (next >= queue.length) {
        djEndedRef.current = true;
        return true;
      }
      const advance = (hostId: string) => {
        setDjCurrentIdx(next);
        playTrack(queue[next]);
        send('queue_update', { queue, currentIdx: next, hostId });
      };
      if (djHostIdRef.current === me) {
        advance(me);
        return true;
      }
      if (djTakeoverTimerRef.current) clearTimeout(djTakeoverTimerRef.current);
      // Jittered so two listeners rarely take over at the same moment.
      djTakeoverTimerRef.current = setTimeout(() => {
        djTakeoverTimerRef.current = null;
        if (djCurrentIdxRef.current !== idx) return; // the DJ advanced
        setDjHostId(me);
        send('host_claim', { hostId: me });
        advance(me);
      }, 4000 + Math.random() * 2000);
      return true;
    });

    return () => {
      unregister();
      if (djTakeoverTimerRef.current) { clearTimeout(djTakeoverTimerRef.current); djTakeoverTimerRef.current = null; }
    };
  }, [activeChatId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Helpers ───────────────────────────────────────────────────────────────
  function getOtherUserId(chat: Chat) {
    return chat.participants.find((u) => u.id !== user?.id)?.id ?? '';
  }

  function formatTimestamp(ts: Date | string) {
    const d = new Date(ts as any);
    const now = new Date();
    const locale = dateLocale();
    if (d.toDateString() === now.toDateString()) return format(d, 'p', { locale });
    if (new Date(now.getTime() - 86400000).toDateString() === d.toDateString()) return t('chat.yesterday', { time: format(d, 'p', { locale }) });
    return format(d, t('chat.datePattern'), { locale });
  }

  function messageStatusLabel(m: { timestamp: Date; pending?: boolean; failed?: boolean }) {
    if (m.failed) return t('chat.notSent');
    if (m.pending) return t('chat.sending');
    return formatTimestamp(m.timestamp);
  }

  function statusColor(online: boolean, status?: string) {
    if (!online) return '#4b5563';
    if (status === 'idle') return '#f59e0b';
    return '#22c55e';
  }

  // ── DM actions ────────────────────────────────────────────────────────────
  // Shows the message at once ("Sending…"), then swaps in the saved copy, or marks
  // it "Not sent · Tap to retry". Pass retryId to resend a failed message.
  const sendDirectMessage = async (content: string, retryId?: string) => {
    if (!activeChat || !user) return;
    const receiverId = getOtherUserId(activeChat);
    if (!receiverId) return;
    const chatId = activeChat.id;
    const id = retryId ?? tempId();
    const draft: UIMessage = { id, senderId: user.id, content, timestamp: new Date(), type: 'text', pending: true };
    setMessages((prev) => (retryId ? prev.map((m) => (m.id === retryId ? draft : m)) : [...prev, draft]));
    try {
      const sent = await ChatService.sendMessage({ senderId: user.id, receiverId, content });
      setMessages((prev) => prev.map((m) => (m.id === id ? sent : m)));
      setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, lastMessage: sent } : c)));
    } catch (err) {
      safeLog('handleSend error:', err);
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, pending: false, failed: true } : m)));
      if (isRateLimited(err)) Alert.alert(t('errors.rateLimitedTitle'), t('errors.rateLimited'));
    }
  };

  const handleSend = () => {
    const content = message.trim();
    if (!content) return;
    setMessage('');
    sendDirectMessage(content);
  };

  // Bumped after block/unblock so the DM composer re-reads BlockService.isHidden().
  const [, setBlockVersion] = useState(0);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  // Offered by the report sheet after a successful report.
  const blockReportedUser = async (blockedId: string) => {
    if (!user) return;
    try {
      await BlockService.blockUser(user.id, blockedId);
      setChats((prev) => prev.filter((c) => !c.participants.some((p) => p.id === blockedId)));
      setGroupMessages((prev) => prev.filter((m) => m.senderId !== blockedId));
      if (activeChat?.participants.some((p) => p.id === blockedId)) {
        setActiveChat(null);
        setMessages([]);
      }
    } catch { Alert.alert(t('common.error'), t('chat.blockFailed')); }
  };

  const handleChatOptions = async (other?: User) => {
    if (!user || !other) return;
    const iBlocked = await BlockService.hasBlocked(user.id, other.id);
    if (iBlocked) {
      Alert.alert(other.username, undefined, [
        { text: t('chat.report'), onPress: () => setReportTarget({ userId: other.id, username: other.username }) },
        {
          text: t('chat.unblock'),
          onPress: async () => {
            try {
              await BlockService.unblockUser(user.id, other.id);
              setBlockVersion((v) => v + 1);
            } catch { Alert.alert(t('common.error'), t('chat.unblockFailed')); }
          },
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
      return;
    }
    Alert.alert(other.username, undefined, [
      { text: t('chat.report'), onPress: () => setReportTarget({ userId: other.id, username: other.username }) },
      {
        text: t('chat.block'),
        style: 'destructive',
        onPress: () => Alert.alert(
          t('chat.blockTitle', { name: other.username }),
          t('chat.blockBody'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('chat.block'),
              style: 'destructive',
              onPress: async () => {
                try {
                  await BlockService.blockUser(user.id, other.id);
                  setChats((prev) => prev.filter((c) => !c.participants.some((p) => p.id === other.id)));
                  setActiveChat(null);
                  setMessages([]);
                } catch { Alert.alert(t('common.error'), t('chat.blockFailed')); }
              },
            },
          ],
        ),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const handleStartNewChat = async (otherUser: User) => {
    let chat = chats.find((c) =>
      c.participants.some((p) => p.id === otherUser.id) && c.participants.some((p) => p.id === user?.id),
    );
    if (!chat) {
      await ChatService.sendMessage({ senderId: user!.id, receiverId: otherUser.id, content: '👋' });
      const updated = await ChatService.getUserChats(user!.id);
      setChats(updated);
      chat = updated.find((c) =>
        c.participants.some((p) => p.id === otherUser.id) && c.participants.some((p) => p.id === user?.id),
      );
    }
    setActiveChat(chat!);
    setShowUserList(false);
  };

  const handleShareMusic = async (track: Track) => {
    if (!activeChat || !user) return;
    setTrackSendError(null);
    const receiverId = getOtherUserId(activeChat);
    if (!receiverId) return;
    try {
      const sent = await ChatService.sendMessage({ senderId: user.id, receiverId, content: '', type: 'track', trackId: track.id });
      setMessages((prev) => prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]);
      setShowMusicShare(false);
    } catch {
      setTrackSendError(t('chat.sendTrackFailed'));
    }
  };

  const handleDeleteChat = (chatId: string) => {
    Alert.alert(t('chat.deleteChat'), t('chat.deleteChatBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('chat.delete'), style: 'destructive', onPress: async () => {
          if (!user) return;
          deletedChatIdsRef.current.add(chatId);
          await storage.setJSON(STORAGE_KEYS.deletedChats(user.id), [...deletedChatIdsRef.current]);
          try {
            const [a, b] = chatId.split('_');
            await ChatService.deleteChat(user.id, a === user.id ? b : a);
            setChats((prev) => prev.filter((c) => c.id !== chatId));
            if (activeChat?.id === chatId) { setActiveChat(null); setMessages([]); }
          } catch {
            deletedChatIdsRef.current.delete(chatId);
            await storage.setJSON(STORAGE_KEYS.deletedChats(user.id), [...deletedChatIdsRef.current]);
            Alert.alert(t('common.error'), t('chat.deleteChatFailed'));
          }
        },
      },
    ]);
  };

  const handleDeleteMessage = (messageId: string) => {
    Alert.alert(t('chat.deleteMessage'), t('chat.cannotUndo'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('chat.delete'), style: 'destructive', onPress: async () => {
          if (!user) return;
          try {
            await ChatService.deleteMessage(messageId, user.id);
            // Tell anyone with this chat open to drop it now.
            djChannelRef.current?.send({ type: 'broadcast', event: 'message_deleted', payload: { id: messageId } });
            const newMsgs = messages.filter((m) => m.id !== messageId);
            setMessages(newMsgs);
            const newLast = newMsgs[newMsgs.length - 1];
            if (!newLast && activeChat) { setChats((prev) => prev.filter((c) => c.id !== activeChat.id)); setActiveChat(null); }
            else setChats((prev) => prev.map((c) => c.id === activeChat?.id ? { ...c, lastMessage: newLast } : c));
          } catch { Alert.alert(t('common.error'), t('chat.deleteMessageFailed')); }
        },
      },
    ]);
  };

  const handleSaveEdit = async () => {
    if (!user || !editingMessageId) return;
    try {
      const updated = await ChatService.updateMessage(editingMessageId, user.id, editingContent);
      setMessages((prev) => prev.map((m) => m.id === editingMessageId ? updated : m));
      setEditingMessageId(null); setEditingContent('');
    } catch { Alert.alert(t('common.error'), t('chat.updateMessageFailed')); }
  };

  // ── Group actions ─────────────────────────────────────────────────────────
  const sendGroupContent = async (content: string, retryId?: string) => {
    if (!activeGroupChat || !user) return;
    const groupId = activeGroupChat.id;
    const id = retryId ?? tempId();
    const draft: UIGroupMessage = {
      id, groupId, senderId: user.id, senderUsername: user.username, senderAvatar: user.avatar,
      content, timestamp: new Date(), type: 'text', pending: true,
    };
    setGroupMessages((prev) => (retryId ? prev.map((m) => (m.id === retryId ? draft : m)) : [...prev, draft]));
    try {
      const sent = await GroupChatService.sendGroupMessage(groupId, user.id, content);
      setGroupMessages((prev) => prev.map((m) => (m.id === id ? sent : m)));
      setGroupChats((prev) => prev.map((g) => (g.id === groupId ? { ...g, lastMessage: sent } : g)));
    } catch (err) {
      setGroupMessages((prev) => prev.map((m) => (m.id === id ? { ...m, pending: false, failed: true } : m)));
      if (isRateLimited(err)) Alert.alert(t('errors.rateLimitedTitle'), t('errors.rateLimited'));
    }
  };

  const handleSendGroupMessage = () => {
    const content = groupMessage.trim();
    if (!content) return;
    setGroupMessage('');
    sendGroupContent(content);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !user) return;
    if (selectedGroupMembers.length === 0) {
      Alert.alert(t('chat.addMembers'), t('chat.selectOne'));
      return;
    }
    setCreatingGroup(true);
    try {
      const group = await GroupChatService.createGroupChat(
        user.id, newGroupName, selectedGroupMembers.map((u) => u.id),
      );
      setGroupChats((prev) => [group, ...prev]);
      setShowCreateGroup(false);
      setNewGroupName('');
      setSelectedGroupMembers([]);
      setListTab('groups');
      setActiveGroupChat(group);
      setActiveChat(null);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message ?? t('chat.createGroupFailed'));
    } finally { setCreatingGroup(false); }
  };

  const handleLeaveGroup = () => {
    if (!activeGroupChat || !user) return;
    Alert.alert(t('chat.leaveGroup'), t('chat.leaveGroupBody', { name: activeGroupChat.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('chat.leave'), style: 'destructive', onPress: async () => {
          try {
            await GroupChatService.leaveGroup(activeGroupChat.id, user.id);
            setGroupChats((prev) => prev.filter((g) => g.id !== activeGroupChat.id));
            setActiveGroupChat(null);
            setGroupMessages([]);
            setShowGroupInfo(false);
          } catch { Alert.alert(t('common.error'), t('chat.leaveFailed')); }
        },
      },
    ]);
  };

  /** ⋯ / long-press menu on a shared track: delete your own, report someone else's. */
  const openTrackMessageMenu = (
    msg: { id: string; senderId: string; pending?: boolean; failed?: boolean; senderUsername?: string },
    kind: 'direct' | 'group',
  ) => {
    const isMine = msg.senderId === user?.id;
    if (msg.pending) return;
    if (msg.failed) {
      // Never reached the server: just drop it locally.
      if (kind === 'direct') setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      else setGroupMessages((prev) => prev.filter((m) => m.id !== msg.id));
      return;
    }
    if (isMine) {
      Alert.alert(t('chat.sharedTrackTitle'), undefined, [
        {
          text: t('chat.deleteForEveryone'),
          style: 'destructive',
          onPress: () => (kind === 'direct' ? handleDeleteMessage(msg.id) : handleDeleteGroupMessage(msg.id)),
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
      return;
    }
    const sender = kind === 'direct' ? activeChat?.participants.find((p) => p.id === msg.senderId)?.username : msg.senderUsername;
    Alert.alert(t('chat.sharedTrackTitle'), undefined, [
      {
        text: t('chat.reportMessage'),
        style: 'destructive',
        onPress: () => setReportTarget({ userId: msg.senderId, username: sender ?? t('chat.thisUser'), messageId: msg.id, messageKind: kind }),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const handleDeleteGroupMessage = (msgId: string) => {
    if (!user) return;
    Alert.alert(t('chat.deleteMessage'), t('chat.cannotUndo'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('chat.delete'), style: 'destructive', onPress: async () => {
          try {
            await GroupChatService.deleteGroupMessage(msgId, user.id);
            djChannelRef.current?.send({ type: 'broadcast', event: 'message_deleted', payload: { id: msgId } });
            setGroupMessages((prev) => prev.filter((m) => m.id !== msgId));
          } catch { Alert.alert(t('common.error'), t('chat.deleteMessageFailed')); }
        },
      },
    ]);
  };

  const toggleGroupMember = (u: User) => {
    setSelectedGroupMembers((prev) => {
      if (prev.some((m) => m.id === u.id)) return prev.filter((m) => m.id !== u.id);
      if (prev.length >= GroupChatService.MAX_MEMBERS - 1) {
        Alert.alert(t('chat.limitReached'), t('chat.groupCap', { max: GroupChatService.MAX_MEMBERS }));
        return prev;
      }
      return [...prev, u];
    });
  };

  // ── DJ actions ────────────────────────────────────────────────────────────
  const broadcastQueue = (queue: Track[], idx: number, hostId?: string) => {
    djChannelRef.current?.send({
      type: 'broadcast', event: 'queue_update',
      payload: { queue, currentIdx: idx, hostId: hostId ?? djHostId },
    });
  };

  const claimHost = (queue: Track[], idx: number) => {
    const hid = user!.id;
    setDjHostId(hid);
    djChannelRef.current?.send({ type: 'broadcast', event: 'host_claim', payload: { hostId: hid } });
    broadcastQueue(queue, idx, hid);
  };

  const handleAddToQueue = (track: Track) => {
    const newQueue = [...djQueue, track];
    const isFirst = djQueue.length === 0;
    // The room had played everything: jump to the new track for everyone.
    const resume = !isFirst && djEndedRef.current;
    const idx = resume ? newQueue.length - 1 : djCurrentIdx;
    setDjQueue(newQueue);
    if (resume) {
      djEndedRef.current = false;
      setDjCurrentIdx(idx);
    }
    if (!djHostId) claimHost(newQueue, idx);
    else broadcastQueue(newQueue, idx);
    if (isFirst || resume) playTrack(track);
  };

  const handleDjSkip = () => {
    if (!isHost) return;
    const nextIdx = djCurrentIdx + 1;
    if (nextIdx >= djQueue.length) return;
    setDjCurrentIdx(nextIdx);
    playTrack(djQueue[nextIdx]);
    broadcastQueue(djQueue, nextIdx);
  };

  const handleRemoveFromQueue = (idx: number) => {
    if (!isHost) return;
    const newQueue = djQueue.filter((_, i) => i !== idx);
    let newIdx = djCurrentIdx;
    if (idx < djCurrentIdx) newIdx = Math.max(0, djCurrentIdx - 1);
    else if (idx === djCurrentIdx) { newIdx = Math.min(idx, newQueue.length - 1); if (newQueue[newIdx]) playTrack(newQueue[newIdx]); }
    newIdx = Math.max(0, newIdx);
    setDjQueue(newQueue); setDjCurrentIdx(newIdx);
    broadcastQueue(newQueue, newIdx);
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderMessage = useCallback(({ item: msg }: { item: UIMessage }) => {
    const isMine = msg.senderId === user?.id;
    const isEditing = editingMessageId === msg.id;
    return (
      <View style={[s.msgRow, isMine ? s.msgRowRight : s.msgRowLeft]}>
        <View style={msg.type === 'track' ? s.msgBubbleTrack : [s.msgBubble, isMine ? s.msgBubbleMine : s.msgBubbleOther, msg.pending && s.msgPending]}>
          {isEditing ? (
            <View style={s.editContainer}>
              <TextInput style={s.editInput} value={editingContent} onChangeText={setEditingContent} multiline autoFocus />
              <View style={s.editActions}>
                <TouchableOpacity style={s.editConfirm} onPress={handleSaveEdit}><Check size={12} color="#fff" /></TouchableOpacity>
                <TouchableOpacity style={s.editCancel} onPress={() => { setEditingMessageId(null); setEditingContent(''); }}><X size={12} color="#fff" /></TouchableOpacity>
              </View>
            </View>
          ) : msg.type === 'track' ? (() => {
            const track: Track | null = (msg as any).track ?? (() => { try { return JSON.parse(msg.content); } catch { return null; } })();
            return (
              <Pressable onLongPress={() => openTrackMessageMenu(msg, 'direct')} delayLongPress={350}>
                {track ? <ChatMusicShare track={track} onPlay={(tr) => { if (tr?.audioUrl) playTrack(tr); }} /> : <Text style={s.invalidTrack}>{t('chat.invalidTrack')}</Text>}
                {!msg.pending && (
                  <TouchableOpacity
                    onPress={() => openTrackMessageMenu(msg, 'direct')}
                    style={[s.trackMsgMore, isMine ? s.trackMsgMoreMine : s.trackMsgMoreOther]}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={isMine ? t('chat.trackOptionsMine') : t('chat.trackOptions')}
                  >
                    <MoreHorizontal size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </Pressable>
            );
          })() : (
            <TouchableOpacity activeOpacity={0.8} onPress={() => { if (msg.failed) sendDirectMessage(msg.content, msg.id); }} onLongPress={() => {
              if (msg.pending || msg.failed) {
                if (msg.failed) Alert.alert(t('chat.notSentTitle'), undefined, [
                  { text: t('chat.retry'), onPress: () => sendDirectMessage(msg.content, msg.id) },
                  { text: t('chat.delete'), style: 'destructive', onPress: () => setMessages((prev) => prev.filter((m) => m.id !== msg.id)) },
                  { text: t('common.cancel'), style: 'cancel' },
                ]);
                return;
              }
              if (!isMine) {
                const sender = activeChat?.participants.find((p) => p.id === msg.senderId);
                Alert.alert(t('chat.message'), undefined, [
                  {
                    text: t('chat.reportMessage'),
                    style: 'destructive',
                    onPress: () => setReportTarget({
                      userId: msg.senderId,
                      username: sender?.username ?? t('chat.thisUser'),
                      messageId: msg.id,
                      messageKind: 'direct',
                    }),
                  },
                  { text: t('common.cancel'), style: 'cancel' },
                ]);
                return;
              }
              Alert.alert(t('chat.message'), undefined, [
                { text: t('chat.edit'), onPress: () => { setEditingMessageId(msg.id); setEditingContent(msg.content); } },
                { text: t('chat.delete'), style: 'destructive', onPress: () => handleDeleteMessage(msg.id) },
                { text: t('common.cancel'), style: 'cancel' },
              ]);
            }}>
              <Text style={s.msgText}>{msg.content}</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={[s.msgTime, isMine ? s.msgTimeRight : s.msgTimeLeft, msg.failed && s.msgFailed]}>{messageStatusLabel(msg)}</Text>
      </View>
    );
  }, [user?.id, editingMessageId, editingContent, messages, activeChat]);

  const renderGroupMessage = useCallback(({ item: msg }: { item: UIGroupMessage }) => {
    const isMine = msg.senderId === user?.id;
    return (
      <View style={[s.msgRow, isMine ? s.msgRowRight : s.msgRowLeft]}>
        {!isMine && (
          <View style={s.groupSenderRow}>
            <AvatarImage uri={msg.senderAvatar} size={18} />
            <Text style={s.groupSenderName}>{msg.senderUsername}</Text>
          </View>
        )}
        <View style={msg.type === 'track' ? s.msgBubbleTrack : [s.msgBubble, isMine ? s.msgBubbleMine : s.msgBubbleOther, msg.pending && s.msgPending]}>
          {msg.type === 'track' ? (() => {
            const track = (msg as any).track ?? null;
            return (
              <Pressable onLongPress={() => openTrackMessageMenu(msg, 'group')} delayLongPress={350}>
                {track ? <ChatMusicShare track={track} onPlay={(tr) => { if (tr?.audioUrl) playTrack(tr); }} /> : <Text style={s.invalidTrack}>{t('chat.invalidTrack')}</Text>}
                {!msg.pending && (
                  <TouchableOpacity
                    onPress={() => openTrackMessageMenu(msg, 'group')}
                    style={[s.trackMsgMore, isMine ? s.trackMsgMoreMine : s.trackMsgMoreOther]}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={isMine ? t('chat.trackOptionsMine') : t('chat.trackOptions')}
                  >
                    <MoreHorizontal size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </Pressable>
            );
          })() : (
            <TouchableOpacity activeOpacity={0.8} onPress={() => { if (msg.failed) sendGroupContent(msg.content, msg.id); }} onLongPress={() => {
              if (msg.pending || msg.failed) {
                if (msg.failed) Alert.alert(t('chat.notSentTitle'), undefined, [
                  { text: t('chat.retry'), onPress: () => sendGroupContent(msg.content, msg.id) },
                  { text: t('chat.delete'), style: 'destructive', onPress: () => setGroupMessages((prev) => prev.filter((m) => m.id !== msg.id)) },
                  { text: t('common.cancel'), style: 'cancel' },
                ]);
                return;
              }
              if (!isMine) {
                Alert.alert(t('chat.message'), undefined, [
                  {
                    text: t('chat.reportMessage'),
                    style: 'destructive',
                    onPress: () => setReportTarget({
                      userId: msg.senderId,
                      username: msg.senderUsername ?? t('chat.thisUser'),
                      messageId: msg.id,
                      messageKind: 'group',
                    }),
                  },
                  { text: t('common.cancel'), style: 'cancel' },
                ]);
                return;
              }
              Alert.alert(t('chat.message'), undefined, [
                { text: t('chat.delete'), style: 'destructive', onPress: () => handleDeleteGroupMessage(msg.id) },
                { text: t('common.cancel'), style: 'cancel' },
              ]);
            }}>
              <Text style={s.msgText}>{msg.content}</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={[s.msgTime, isMine ? s.msgTimeRight : s.msgTimeLeft, msg.failed && s.msgFailed]}>{messageStatusLabel(msg)}</Text>
      </View>
    );
  }, [user?.id, groupMessages, activeGroupChat]);

  const renderChatItem = useCallback(({ item: chat }: { item: Chat }) => {
    const other = chat.participants.find((u) => u.id !== user?.id);
    const isActive = activeChat?.id === chat.id;
    const isOnline = other?.id ? onlineUserIds.has(other.id) : false;
    const dot = statusColor(isOnline, other?.id ? userStatuses.get(other.id) : undefined);
    return (
      <TouchableOpacity style={[s.chatItem, isActive && s.chatItemActive]} onPress={() => { setActiveChat(chat); setActiveGroupChat(null); }} onLongPress={() => handleDeleteChat(chat.id)} activeOpacity={0.75}>
        <View style={s.chatItemAvatar}>
          <AvatarImage uri={other?.avatar} size={42} />
          <View style={[s.presenceDot, { backgroundColor: dot }]} />
        </View>
        <View style={s.chatItemContent}>
          <View style={s.chatItemNameRow}>
            <Text style={s.chatItemName} numberOfLines={1}>{other?.username}</Text>
            <VerifiedBadge verified={other?.isVerified || other?.isVerifiedArtist} size={13} />
          </View>
          <Text style={s.chatItemPreview} numberOfLines={1}>
            {chat.lastMessage?.type === 'track' ? t('chat.sharedTrack') : chat.lastMessage?.content === '👋' ? t('chat.newConversation') : (chat.lastMessage?.content ?? '')}
          </Text>
        </View>
        {isActive && <View style={s.activeDot} />}
      </TouchableOpacity>
    );
  }, [user?.id, activeChat?.id, onlineUserIds, userStatuses]);

  const renderGroupItem = useCallback(({ item: group }: { item: GroupChat }) => {
    const isActive = activeGroupChat?.id === group.id;
    return (
      <TouchableOpacity style={[s.chatItem, isActive && s.chatItemActive]} onPress={() => { setActiveGroupChat(group); setActiveChat(null); }} activeOpacity={0.75}>
        <GroupAvatarStack members={group.members} size={36} />
        <View style={s.chatItemContent}>
          <View style={s.chatItemNameRow}>
            <Text style={s.chatItemName} numberOfLines={1}>{group.name}</Text>
            <Text style={s.groupMemberCount}>{group.members.length}/{GroupChatService.MAX_MEMBERS}</Text>
          </View>
          <Text style={s.chatItemPreview} numberOfLines={1}>
            {group.lastMessage
              ? `${group.lastMessage.senderUsername}: ${group.lastMessage.type === 'track' ? t('chat.sharedTrack') : group.lastMessage.content}`
              : t('chat.noMessagesYet')}
          </Text>
        </View>
        {isActive && <View style={s.activeDot} />}
      </TouchableOpacity>
    );
  }, [activeGroupChat?.id]);

  // ── DJ Room shared UI ─────────────────────────────────────────────────────
  const djHost = (activeChat?.participants ?? activeGroupChat?.members ?? []).find((p) => p.id === djHostId);

  const renderDjRoom = () => (
    <View style={s.flex}>
      {djQueue.length === 0 ? (
        <View style={s.djEmpty}>
          <Radio size={56} color={colors.primary} />
          <Text style={s.djEmptyTitle}>{t('chat.djStart')}</Text>
          <Text style={s.djEmptyBody}>{t('chat.djStartBody')}</Text>
          <TouchableOpacity style={s.djEmptyBtn} onPress={() => setShowTrackPicker(true)}>
            <Plus size={18} color="#000" /><Text style={s.djEmptyBtnText}>{t('chat.addTrack')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={djQueue}
          keyExtractor={(t, i) => `${t.id}_${i}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 96 }}
          ListHeaderComponent={
            <View>
              {djCurrentTrack && (
                <View style={s.nowPlayingCard}>
                  {djCurrentTrack.cover
                    ? <Image source={{ uri: djCurrentTrack.cover }} style={s.nowPlayingCover} resizeMode="cover" />
                    : <View style={[s.nowPlayingCover, s.nowPlayingCoverFb]}><Music size={44} color={colors.primary} /></View>}
                  <Text style={s.nowPlayingTitle} numberOfLines={1}>{djCurrentTrack.title}</Text>
                  <Text style={s.nowPlayingArtist} numberOfLines={1}>{djCurrentTrack.artist}</Text>
                  <View style={s.hostBadge}>
                    <Crown size={12} color="#f59e0b" />
                    <Text style={s.hostBadgeText}>{isHost ? t('chat.youAreDj') : t('chat.someoneDj', { name: djHost?.username ?? t('chat.someone') })}</Text>
                  </View>
                  <View style={s.djControls}>
                    <TouchableOpacity style={[s.skipBtn, (!isHost || djCurrentIdx >= djQueue.length - 1) && s.skipBtnOff]} onPress={handleDjSkip} disabled={!isHost || djCurrentIdx >= djQueue.length - 1}>
                      <SkipForward size={18} color={isHost && djCurrentIdx < djQueue.length - 1 ? '#000' : colors.textMuted} />
                      <Text style={[s.skipBtnText, (!isHost || djCurrentIdx >= djQueue.length - 1) && { color: colors.textMuted }]}>{t('chat.skip')}</Text>
                    </TouchableOpacity>
                    {!isHost && (
                      <TouchableOpacity style={s.claimBtn} onPress={() => claimHost(djQueue, djCurrentIdx)}>
                        <Crown size={13} color="#92400e" /><Text style={s.claimBtnText}>{t('chat.takeOver')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
              <View style={s.queueHeader}>
                <ListMusic size={13} color={colors.textMuted} />
                <Text style={s.queueHeaderText}>{t('chat.upNext', { count: Math.max(0, djQueue.length - djCurrentIdx - 1) })}</Text>
              </View>
            </View>
          }
          renderItem={({ item: track, index }) => {
            const isCurrent = index === djCurrentIdx;
            const isPast = index < djCurrentIdx;
            return (
              <View style={[s.queueItem, isCurrent && s.queueItemCurrent, isPast && s.queueItemPast]}>
                {track.cover ? <Image source={{ uri: track.cover }} style={s.queueItemCover} resizeMode="cover" /> : <View style={[s.queueItemCover, s.queueItemCoverFb]}><Music size={14} color={colors.textMuted} /></View>}
                <View style={s.queueItemInfo}>
                  <Text style={[s.queueItemTitle, isPast && { color: colors.textMuted }]} numberOfLines={1}>{track.title}</Text>
                  <Text style={s.queueItemArtist} numberOfLines={1}>{track.artist}</Text>
                </View>
                {isCurrent && <Text style={s.playingSymbol}>♪</Text>}
                {isHost && !isCurrent && (
                  <TouchableOpacity onPress={() => handleRemoveFromQueue(index)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <X size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            );
          }}
        />
      )}
      {djQueue.length > 0 && (
        <TouchableOpacity style={s.djFab} onPress={() => setShowTrackPicker(true)}>
          <Plus size={18} color="#000" /><Text style={s.djFabText}>{t('chat.addToQueue')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.emptyState}>
          <MessageCircle size={56} color={colors.textMuted} />
          <Text style={s.emptyTitle}>{t('chat.signInTitle')}</Text>
          <Text style={s.emptyBody}>{t('chat.signInBody')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Chat list ─────────────────────────────────────────────────────────────
  if (!activeChat && !activeGroupChat) {
    return (
      <SafeAreaView style={s.safeArea} edges={['top']}>
        {/* Header */}
        <View style={s.listHeader}>
          <View style={s.listHeaderLeft}>
            <MessageCircle size={18} color={colors.primary} />
            <Text style={s.listHeaderTitle}>{t('chat.messages')}</Text>
          </View>
          <View style={s.listHeaderRight}>
            {listTab === 'dms' && (
              <TouchableOpacity style={s.newChatBtn} onPress={() => setShowUserList((v) => !v)}>
                <Plus size={15} color="#000" />
              </TouchableOpacity>
            )}
            {listTab === 'groups' && (
              <TouchableOpacity style={s.newChatBtn} onPress={() => setShowCreateGroup(true)}>
                <Plus size={15} color="#000" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* DMs / Groups tab pill */}
        <View style={s.listTabBar}>
          <TouchableOpacity style={[s.listTabBtn, listTab === 'dms' && s.listTabBtnActive]} onPress={() => setListTab('dms')}>
            <Text style={[s.listTabLabel, listTab === 'dms' && s.listTabLabelActive]}>{t('chat.dms')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.listTabBtn, listTab === 'groups' && s.listTabBtnActive]} onPress={() => setListTab('groups')}>
            <Text style={[s.listTabLabel, listTab === 'groups' && s.listTabLabelActive]}>{t('chat.groups')}</Text>
            {groupChats.length > 0 && <View style={s.tabBadge}><Text style={s.tabBadgeText}>{groupChats.length}</Text></View>}
          </TouchableOpacity>
        </View>

        {/* Status pill (DMs only) */}
        {listTab === 'dms' && (
          <View style={s.statusPill}>
            {userStatus === 'online' && <><View style={[s.statusDot, { backgroundColor: '#22c55e' }]} /><Text style={s.statusText}>{t('chat.online')}</Text></>}
            {userStatus === 'idle' && <><Moon size={14} color="#f59e0b" /><Text style={s.statusText}>{t('chat.idle')}</Text></>}
            {userStatus === 'invisible' && <><EyeOff size={14} color={colors.textMuted} /><Text style={[s.statusText, { color: colors.textMuted }]}>{t('chat.invisible')}</Text></>}
          </View>
        )}

        {/* New DM user picker */}
        {listTab === 'dms' && showUserList && (
          <View style={s.userPickerPanel}>
            <Text style={s.userPickerLabel}>{t('chat.startNew')}</Text>
            <FlatList
              data={allUsers.filter((u) => u.id !== user?.id)}
              keyExtractor={(u) => u.id}
              style={{ maxHeight: 144 }}
              renderItem={({ item: other }) => (
                <TouchableOpacity style={s.userPickerItem} onPress={() => handleStartNewChat(other)}>
                  <AvatarImage uri={other.avatar} size={28} />
                  <Text style={s.userPickerName} numberOfLines={1}>{other.username}</Text>
                  <VerifiedBadge verified={other.isVerified || other.isVerifiedArtist} size={13} />
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* DMs list */}
        {listTab === 'dms' && (
          loadingChats ? (
            <View style={s.centeredLoader}><ActivityIndicator size="small" color={colors.primary} /></View>
          ) : chats.filter((c) => c.lastMessage).length === 0 ? (
            <View style={s.emptyState}>
              <MessageCircle size={44} color={colors.textMuted} />
              <Text style={s.emptyTitle}>{t('chat.noMessagesYet')}</Text>
              <Text style={s.emptyBody}>{t('chat.tapPlus')}</Text>
            </View>
          ) : (
            <FlatList data={chats.filter((c) => c.lastMessage)} keyExtractor={(c) => c.id} renderItem={renderChatItem} contentContainerStyle={s.chatList} showsVerticalScrollIndicator={false} />
          )
        )}

        {/* Groups list */}
        {listTab === 'groups' && (
          loadingGroups ? (
            <View style={s.centeredLoader}><ActivityIndicator size="small" color={colors.primary} /></View>
          ) : groupChats.length === 0 ? (
            <View style={s.emptyState}>
              <Users size={44} color={colors.textMuted} />
              <Text style={s.emptyTitle}>{t('chat.noGroups')}</Text>
              <Text style={s.emptyBody}>{t('chat.tapPlusGroup', { max: GroupChatService.MAX_MEMBERS })}</Text>
            </View>
          ) : (
            <FlatList data={groupChats} keyExtractor={(g) => g.id} renderItem={renderGroupItem} contentContainerStyle={s.chatList} showsVerticalScrollIndicator={false} />
          )
        )}

        {/* Create group modal */}
        <Modal visible={showCreateGroup} transparent animationType="slide" onRequestClose={() => setShowCreateGroup(false)}>
          <View style={s.overlay}>
            <View style={[s.sheet, { maxHeight: '80%' }]}>
              <View style={s.sheetHeader}>
                <Text style={s.sheetTitle}>{t('chat.newGroup')}</Text>
                <TouchableOpacity onPress={() => { setShowCreateGroup(false); setNewGroupName(''); setSelectedGroupMembers([]); }}>
                  <X size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <TextInput
                  style={s.groupNameInput}
                  placeholder={t('chat.groupName')}
                  placeholderTextColor={colors.textMuted}
                  value={newGroupName}
                  onChangeText={setNewGroupName}
                  maxLength={40}
                />
                <Text style={s.groupMemberHint}>
                  {t('chat.membersSelected', { count: selectedGroupMembers.length, max: GroupChatService.MAX_MEMBERS - 1 })}
                </Text>
                {selectedGroupMembers.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    {selectedGroupMembers.map((m) => (
                      <TouchableOpacity key={m.id} style={s.selectedMemberChip} onPress={() => toggleGroupMember(m)}>
                        <AvatarImage uri={m.avatar} size={24} />
                        <Text style={s.selectedMemberName}>{m.username}</Text>
                        <X size={10} color={colors.textMuted} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              <FlatList
                data={allUsers.filter((u) => u.id !== user?.id)}
                keyExtractor={(u) => u.id}
                renderItem={({ item: u }) => {
                  const selected = selectedGroupMembers.some((m) => m.id === u.id);
                  return (
                    <TouchableOpacity style={[s.userPickerItem, { paddingHorizontal: 16 }]} onPress={() => toggleGroupMember(u)}>
                      <AvatarImage uri={u.avatar} size={32} />
                      <Text style={[s.userPickerName, { flex: 1 }]} numberOfLines={1}>{u.username}</Text>
                      <View style={[s.checkbox, selected && s.checkboxChecked]}>
                        {selected && <Check size={10} color="#000" />}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />

              <TouchableOpacity
                style={[s.createGroupBtn, (!newGroupName.trim() || selectedGroupMembers.length === 0 || creatingGroup) && s.createGroupBtnOff]}
                onPress={handleCreateGroup}
                disabled={!newGroupName.trim() || selectedGroupMembers.length === 0 || creatingGroup}
              >
                {creatingGroup
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Text style={s.createGroupBtnText}>{t('chat.createGroup')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ── DM window ─────────────────────────────────────────────────────────────
  if (activeChat) {
    const other = activeChat.participants.find((u) => u.id !== user?.id);
    const isOnline = other?.id ? onlineUserIds.has(other.id) : false;
    const dot = statusColor(isOnline, other?.id ? userStatuses.get(other.id) : undefined);
    const statusLabel = !isOnline ? t('chat.offline') : userStatuses.get(other?.id ?? '') === 'idle' ? t('chat.idle') : t('chat.online');
    const inputPaddingBottom = keyboardVisible ? 8 : Math.max(insets.bottom, 8);

    return (
      <SafeAreaView style={s.safeArea} edges={['top']}>
        <View style={s.chatHeader}>
          <TouchableOpacity style={s.backBtn} onPress={() => { setActiveChat(null); setMessages([]); }}>
            <ArrowLeft size={20} color={colors.text} />
          </TouchableOpacity>
          <AvatarImage uri={other?.avatar} size={36} />
          <View style={s.chatHeaderInfo}>
            <View style={s.chatHeaderNameRow}>
              <Text style={s.chatHeaderName} numberOfLines={1}>{other?.username}</Text>
              <VerifiedBadge verified={other?.isVerified || other?.isVerifiedArtist} size={15} />
            </View>
            <View style={s.chatHeaderStatusRow}>
              <View style={[s.statusDotSm, { backgroundColor: dot }]} />
              <Text style={s.chatHeaderStatus}>{statusLabel}</Text>
            </View>
          </View>
          <TouchableOpacity style={s.backBtn} onPress={() => handleChatOptions(other)} accessibilityLabel={t('chat.chatOptions')}>
            <MoreHorizontal size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={s.tabBar}>
          <TouchableOpacity style={[s.tabBtn, activeTab === 'chat' && s.tabBtnActive]} onPress={() => setActiveTab('chat')}>
            <MessageCircle size={13} color={activeTab === 'chat' ? '#000' : colors.textMuted} />
            <Text style={[s.tabLabel, activeTab === 'chat' && s.tabLabelActive]}>{t('chat.chatTab')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tabBtn, activeTab === 'dj' && s.tabBtnActive]} onPress={() => setActiveTab('dj')}>
            <Radio size={13} color={activeTab === 'dj' ? '#000' : colors.textMuted} />
            <Text style={[s.tabLabel, activeTab === 'dj' && s.tabLabelActive]}>{t('chat.djRoom')}</Text>
            {djQueue.length > 0 && <View style={s.tabBadge}><Text style={s.tabBadgeText}>{djQueue.length}</Text></View>}
          </TouchableOpacity>
        </View>

        {activeTab === 'chat' && (
          <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
            {loadingMessages && visibleMessages.length === 0 ? (
              <View style={[s.flex, s.centered]}><ActivityIndicator color={colors.textMuted} /></View>
            ) : (
              <FlatList
                ref={flatListRef}
                data={visibleMessages}
                keyExtractor={messageKey}
                renderItem={renderMessage}
                contentContainerStyle={s.messageList}
                showsVerticalScrollIndicator={false}
                inverted
                onEndReached={loadOlderDirectMessages}
                onEndReachedThreshold={0.3}
                ListFooterComponent={historyEdge(loadingOlderDm, hasMoreDm, visibleMessages.length)}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={20}
                maxToRenderPerBatch={20}
                windowSize={11}
              />
            )}
            {BlockService.isHidden(other?.id) ? (
              <View style={[s.inputBar, { paddingBottom: inputPaddingBottom, justifyContent: 'center' }]}>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('chat.cantMessage')}</Text>
              </View>
            ) : (
            <View style={[s.inputBar, { paddingBottom: inputPaddingBottom }]}>
              <TextInput style={s.messageInput} value={message} onChangeText={setMessage} placeholder={t('chat.typeMessage')} placeholderTextColor={colors.textMuted} multiline={false} returnKeyType="send" onSubmitEditing={handleSend} />
              <TouchableOpacity style={s.inputAction} onPress={() => setShowMusicShare(true)}><Music size={16} color={colors.primary} /></TouchableOpacity>
              <TouchableOpacity style={[s.sendBtn, !message.trim() && s.sendBtnDisabled]} onPress={handleSend} disabled={!message.trim()}><Send size={15} color="#000" /></TouchableOpacity>
            </View>
            )}
          </KeyboardAvoidingView>
        )}
        {activeTab === 'dj' && renderDjRoom()}

        {/* Music share modal */}
        <Modal visible={showMusicShare} transparent animationType="slide" onRequestClose={() => setShowMusicShare(false)}>
          <View style={s.overlay}>
            <View style={s.sheet}>
              <View style={s.sheetHeader}>
                <Text style={s.sheetTitle}>{t('chat.shareTrack')}</Text>
                <TouchableOpacity onPress={() => setShowMusicShare(false)}><X size={18} color={colors.textMuted} /></TouchableOpacity>
              </View>
              {loadingTracks ? <View style={s.centeredLoader}><ActivityIndicator size="small" color={colors.primary} /></View>
                : userTracks.length === 0 ? <Text style={s.sheetEmpty}>{t('chat.noTracksToShare')}</Text>
                : <FlatList data={userTracks} keyExtractor={(t) => t.id} renderItem={({ item: track }) => (
                  <View style={s.trackRow}>
                    {track.cover ? <Image source={{ uri: track.cover }} style={s.trackRowCover} resizeMode="cover" /> : <View style={[s.trackRowCover, s.trackRowCoverFb]}><Music size={16} color={colors.textMuted} /></View>}
                    <View style={s.trackRowInfo}><Text style={s.trackRowTitle} numberOfLines={1}>{track.title}</Text><Text style={s.trackRowArtist} numberOfLines={1}>{track.artist}</Text></View>
                    <TouchableOpacity style={s.shareBtn} onPress={() => handleShareMusic(track)}><Send size={12} color="#000" /><Text style={s.shareBtnText}>{t('chat.share')}</Text></TouchableOpacity>
                  </View>
                )} showsVerticalScrollIndicator={false} />}
              {trackSendError ? <Text style={s.trackSendError}>{trackSendError}</Text> : null}
            </View>
          </View>
        </Modal>

        {/* Track picker */}
        <DjTrackPicker
          visible={showTrackPicker}
          onClose={() => setShowTrackPicker(false)}
          onPick={handleAddToQueue}
          queuedIds={new Set(djQueue.map((tr) => tr.id))}
        />
        <ReportSheet
          target={reportTarget}
          onClose={() => setReportTarget(null)}
          onBlock={reportTarget ? () => blockReportedUser(reportTarget.userId) : undefined}
        />
      </SafeAreaView>
    );
  }

  // ── Group chat window ─────────────────────────────────────────────────────
  const inputPaddingBottom = keyboardVisible ? 8 : Math.max(insets.bottom, 8);
  return (
    <SafeAreaView style={s.safeArea} edges={['top']}>
      <View style={s.chatHeader}>
        <TouchableOpacity style={s.backBtn} onPress={() => { setActiveGroupChat(null); setGroupMessages([]); }}>
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <GroupAvatarStack members={activeGroupChat!.members} size={32} />
        <View style={s.chatHeaderInfo}>
          <Text style={s.chatHeaderName} numberOfLines={1}>{activeGroupChat!.name}</Text>
          <Text style={s.chatHeaderStatus}>{t('chat.members', { count: activeGroupChat!.members.length })}</Text>
        </View>
        <TouchableOpacity style={s.backBtn} onPress={() => setShowGroupInfo(true)}>
          <Info size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={s.tabBar}>
        <TouchableOpacity style={[s.tabBtn, activeTab === 'chat' && s.tabBtnActive]} onPress={() => setActiveTab('chat')}>
          <MessageCircle size={13} color={activeTab === 'chat' ? '#000' : colors.textMuted} />
          <Text style={[s.tabLabel, activeTab === 'chat' && s.tabLabelActive]}>{t('chat.chatTab')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tabBtn, activeTab === 'dj' && s.tabBtnActive]} onPress={() => setActiveTab('dj')}>
          <Radio size={13} color={activeTab === 'dj' ? '#000' : colors.textMuted} />
          <Text style={[s.tabLabel, activeTab === 'dj' && s.tabLabelActive]}>{t('chat.djRoom')}</Text>
          {djQueue.length > 0 && <View style={s.tabBadge}><Text style={s.tabBadgeText}>{djQueue.length}</Text></View>}
        </TouchableOpacity>
      </View>

      {activeTab === 'chat' && (
        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
          {visibleGroupMessages.length === 0 ? (
            // Outside the list: an inverted list would draw its empty state upside down.
            <View style={[s.flex, s.emptyState, { paddingTop: 48 }]}>
              <Text style={s.emptyBody}>{t('chat.sayHello')}</Text>
            </View>
          ) : (
            <FlatList
              ref={groupFlatListRef}
              data={visibleGroupMessages}
              keyExtractor={messageKey}
              renderItem={renderGroupMessage}
              contentContainerStyle={s.messageList}
              showsVerticalScrollIndicator={false}
              inverted
              onEndReached={loadOlderGroupMessages}
              onEndReachedThreshold={0.3}
              ListFooterComponent={historyEdge(loadingOlderGroup, hasMoreGroup, visibleGroupMessages.length)}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={11}
            />
          )}
          <View style={[s.inputBar, { paddingBottom: inputPaddingBottom }]}>
            <TextInput style={s.messageInput} value={groupMessage} onChangeText={setGroupMessage} placeholder={t('chat.messageGroup')} placeholderTextColor={colors.textMuted} multiline={false} returnKeyType="send" onSubmitEditing={handleSendGroupMessage} />
            <TouchableOpacity style={[s.sendBtn, !groupMessage.trim() && s.sendBtnDisabled]} onPress={handleSendGroupMessage} disabled={!groupMessage.trim()}><Send size={15} color="#000" /></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
      {activeTab === 'dj' && renderDjRoom()}

      {/* Group info modal */}
      <Modal visible={showGroupInfo} transparent animationType="slide" onRequestClose={() => setShowGroupInfo(false)}>
        <View style={s.overlay}>
          <View style={[s.sheet, { maxHeight: '65%' }]}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{activeGroupChat!.name}</Text>
              <TouchableOpacity onPress={() => setShowGroupInfo(false)}><X size={18} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <Text style={[s.userPickerLabel, { paddingHorizontal: 16, paddingTop: 12 }]}>
              {t('chat.membersHeading', { count: activeGroupChat!.members.length, max: GroupChatService.MAX_MEMBERS })}
            </Text>
            <FlatList
              data={activeGroupChat!.members}
              keyExtractor={(m) => m.id}
              renderItem={({ item: m }) => (
                <View style={[s.userPickerItem, { paddingHorizontal: 16 }]}>
                  <AvatarImage uri={m.avatar} size={32} />
                  <Text style={[s.userPickerName, { flex: 1 }]} numberOfLines={1}>{m.username}</Text>
                  {m.id === activeGroupChat!.creatorId && (
                    <View style={s.creatorBadge}><Crown size={11} color="#92400e" /><Text style={s.creatorBadgeText}>{t('chat.creator')}</Text></View>
                  )}
                  <VerifiedBadge verified={m.isVerified || m.isVerifiedArtist} size={13} />
                </View>
              )}
            />
            <TouchableOpacity style={s.leaveGroupBtn} onPress={handleLeaveGroup}>
              <Text style={s.leaveGroupText}>{t('chat.leaveGroup')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Track picker (DJ Room) */}
      <DjTrackPicker
          visible={showTrackPicker}
          onClose={() => setShowTrackPicker(false)}
          onPick={handleAddToQueue}
          queuedIds={new Set(djQueue.map((tr) => tr.id))}
        />
      <ReportSheet
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onBlock={reportTarget ? () => blockReportedUser(reportTarget.userId) : undefined}
      />
    </SafeAreaView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const BG = colors.background;
const SFC = colors.surface;
const SFCEL = colors.surfaceElevated;
const BORDER = colors.border;
const GREEN = colors.primary;
const MUTED = colors.textMuted;
const TEXT = colors.text;

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  flex: { flex: 1 },
  centeredLoader: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },

  // List header
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: SFC, borderBottomWidth: 1, borderBottomColor: BORDER },
  listHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listHeaderTitle: { fontSize: 16, fontWeight: '700', color: TEXT },
  newChatBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },

  // List tabs
  listTabBar: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8, backgroundColor: SFC, borderBottomWidth: 1, borderBottomColor: BORDER },
  listTabBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: BORDER },
  listTabBtnActive: { backgroundColor: GREEN, borderColor: GREEN },
  listTabLabel: { fontSize: 13, color: MUTED },
  listTabLabelActive: { color: '#000', fontWeight: '600' },

  // Status pill
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 12, marginVertical: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: SFC, borderRadius: 12, borderWidth: 1, borderColor: BORDER },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, color: TEXT },

  // User picker
  userPickerPanel: { marginHorizontal: 12, marginBottom: 8, padding: 12, backgroundColor: SFC, borderRadius: 14, borderWidth: 1, borderColor: BORDER },
  userPickerLabel: { fontSize: 11, fontWeight: '500', color: MUTED, marginBottom: 8 },
  userPickerItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  userPickerName: { flex: 1, fontSize: 13, color: TEXT },

  // Chat list
  chatList: { paddingVertical: 4, paddingHorizontal: 8 },
  chatItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, marginVertical: 2, backgroundColor: SFC },
  chatItemActive: { borderWidth: 1.5, borderColor: GREEN },
  chatItemAvatar: { position: 'relative' },
  presenceDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: BG },
  chatItemContent: { flex: 1, minWidth: 0 },
  chatItemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chatItemName: { fontSize: 13, fontWeight: '600', color: TEXT, flexShrink: 1 },
  chatItemPreview: { fontSize: 12, color: MUTED, marginTop: 2 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN },
  groupMemberCount: { fontSize: 11, color: MUTED, marginLeft: 4 },

  // Chat header
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: SFC, borderBottomWidth: 1, borderBottomColor: BORDER },
  backBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chatHeaderInfo: { flex: 1, minWidth: 0 },
  chatHeaderNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chatHeaderName: { fontSize: 14, fontWeight: '600', color: TEXT, flexShrink: 1 },
  chatHeaderStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  statusDotSm: { width: 6, height: 6, borderRadius: 3 },
  chatHeaderStatus: { fontSize: 11, color: MUTED },

  // Tab bar (within conversation)
  tabBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: SFC, borderBottomWidth: 1, borderBottomColor: BORDER },
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: BORDER },
  tabBtnActive: { backgroundColor: GREEN, borderColor: GREEN },
  tabLabel: { fontSize: 13, color: MUTED },
  tabLabelActive: { color: '#000', fontWeight: '600' },
  tabBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  // Messages
  messageList: { paddingHorizontal: 12, paddingVertical: 12, gap: 4 },
  msgRow: { marginVertical: 2 },
  msgPending: { opacity: 0.6 },
  trackMsgMore: {
    position: 'absolute', top: 6, width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', backgroundColor: SFCEL, borderWidth: 1, borderColor: BORDER,
  },
  trackMsgMoreMine: { left: -32 },
  trackMsgMoreOther: { right: -32 },
  historyEdge: { alignItems: 'center', paddingVertical: 14 },
  historyEdgeText: { color: colors.textMuted, fontSize: 12 },
  msgFailed: { color: '#ef4444' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  msgRowLeft: { alignItems: 'flex-start' },
  msgRowRight: { alignItems: 'flex-end' },
  msgBubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '75%' },
  msgBubbleMine: { backgroundColor: '#7c3aed', borderBottomRightRadius: 4 },
  msgBubbleOther: { backgroundColor: '#2a2a3a', borderBottomLeftRadius: 4 },
  msgBubbleTrack: { maxWidth: '88%' },
  msgText: { fontSize: 14, color: '#fff', lineHeight: 20 },
  msgTime: { fontSize: 11, color: MUTED, marginTop: 2, marginHorizontal: 4 },
  msgTimeLeft: { alignSelf: 'flex-start' },
  msgTimeRight: { alignSelf: 'flex-end' },
  invalidTrack: { fontSize: 12, color: MUTED },
  editContainer: { gap: 8, minWidth: 180 },
  editInput: { backgroundColor: SFCEL, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, color: TEXT, fontSize: 13 },
  editActions: { flexDirection: 'row', gap: 8 },
  editConfirm: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center' },
  editCancel: { width: 28, height: 28, borderRadius: 8, backgroundColor: SFCEL, alignItems: 'center', justifyContent: 'center' },

  // Group sender name
  groupSenderRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2, marginLeft: 4 },
  groupSenderName: { fontSize: 11, color: MUTED, fontWeight: '500' },

  // Input bar
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: SFC },
  inputAction: { padding: 8 },
  messageInput: { flex: 1, backgroundColor: SFCEL, borderWidth: 1, borderColor: BORDER, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, color: TEXT, fontSize: 14 },
  sendBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },

  // DJ empty
  djEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  djEmptyTitle: { fontSize: 18, fontWeight: '700', color: TEXT },
  djEmptyBody: { fontSize: 13, color: MUTED, textAlign: 'center' },
  djEmptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: GREEN, borderRadius: 24 },
  djEmptyBtnText: { fontSize: 15, fontWeight: '600', color: '#000' },

  // Now playing
  nowPlayingCard: { margin: 12, padding: 20, borderRadius: 20, backgroundColor: SFC, borderWidth: 1, borderColor: BORDER, alignItems: 'center' },
  nowPlayingCover: { width: 160, height: 160, borderRadius: 16, marginBottom: 16 },
  nowPlayingCoverFb: { backgroundColor: SFCEL, alignItems: 'center', justifyContent: 'center' },
  nowPlayingTitle: { fontSize: 17, fontWeight: '700', color: TEXT, textAlign: 'center', marginBottom: 4 },
  nowPlayingArtist: { fontSize: 13, color: MUTED, textAlign: 'center', marginBottom: 14 },
  hostBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fef3c7', borderRadius: 20, marginBottom: 16 },
  hostBadgeText: { fontSize: 12, fontWeight: '500', color: '#92400e' },
  djControls: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  skipBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: SFCEL, borderRadius: 20, borderWidth: 1, borderColor: BORDER },
  skipBtnOff: { opacity: 0.4 },
  skipBtnText: { fontSize: 13, fontWeight: '500', color: TEXT },
  claimBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fef3c7', borderRadius: 20 },
  claimBtnText: { fontSize: 13, fontWeight: '500', color: '#92400e' },

  // Queue
  queueHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8 },
  queueHeaderText: { fontSize: 11, fontWeight: '600', color: MUTED, letterSpacing: 0.5 },
  queueItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: SFC },
  queueItemCurrent: { backgroundColor: GREEN + '22', borderLeftWidth: 3, borderLeftColor: GREEN },
  queueItemPast: { opacity: 0.45 },
  queueItemCover: { width: 44, height: 44, borderRadius: 8 },
  queueItemCoverFb: { backgroundColor: SFCEL, alignItems: 'center', justifyContent: 'center' },
  queueItemInfo: { flex: 1, minWidth: 0 },
  queueItemTitle: { fontSize: 14, fontWeight: '500', color: TEXT },
  queueItemArtist: { fontSize: 12, color: MUTED, marginTop: 2 },
  playingSymbol: { fontSize: 18, color: GREEN },
  djFab: { position: 'absolute', bottom: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: GREEN, borderRadius: 24 },
  djFabText: { fontSize: 14, fontWeight: '600', color: '#000' },

  // Modals / sheets
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: SFC, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20, maxHeight: '65%', borderWidth: 1, borderColor: BORDER },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  sheetTitle: { fontSize: 15, fontWeight: '600', color: TEXT },
  sheetEmpty: { textAlign: 'center', color: MUTED, fontSize: 13, paddingVertical: 32 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  trackRowCover: { width: 42, height: 42, borderRadius: 8 },
  trackRowCoverFb: { backgroundColor: SFCEL, alignItems: 'center', justifyContent: 'center' },
  trackRowInfo: { flex: 1, minWidth: 0 },
  trackRowTitle: { fontSize: 13, fontWeight: '500', color: TEXT },
  trackRowArtist: { fontSize: 12, color: MUTED },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: GREEN, borderRadius: 20 },
  shareBtnText: { fontSize: 12, fontWeight: '500', color: '#000' },
  addBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  trackSendError: { color: '#f87171', fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 },

  // Group creation
  groupNameInput: { backgroundColor: SFCEL, borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: TEXT, marginBottom: 6 },
  groupMemberHint: { fontSize: 11, color: MUTED },
  selectedMemberChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: SFCEL, borderRadius: 20, marginRight: 6 },
  selectedMemberName: { fontSize: 12, color: TEXT },
  checkbox: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: GREEN, borderColor: GREEN },
  createGroupBtn: { margin: 16, paddingVertical: 12, backgroundColor: GREEN, borderRadius: 12, alignItems: 'center' },
  createGroupBtnOff: { opacity: 0.4 },
  createGroupBtnText: { fontSize: 15, fontWeight: '600', color: '#000' },

  // Group info modal
  creatorBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#fef3c7', borderRadius: 12 },
  creatorBadgeText: { fontSize: 11, color: '#92400e', fontWeight: '500' },
  leaveGroupBtn: { margin: 16, paddingVertical: 12, backgroundColor: '#fee2e2', borderRadius: 12, alignItems: 'center' },
  leaveGroupText: { fontSize: 14, fontWeight: '600', color: '#dc2626' },

  // Empty / unauth
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: TEXT },
  emptyBody: { fontSize: 13, color: MUTED, textAlign: 'center' },
});

export default ChatScreen;
