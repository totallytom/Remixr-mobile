import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import {
  Send, MessageCircle, Users, Music, X, Play, Plus, Trash2,
  Edit2, Check, Moon, EyeOff, ArrowLeft,
} from 'lucide-react-native';
import { format } from 'date-fns';
import { ChatService } from '../../services/chatService';
import { getAvatarUrl } from '../../utils/avatar';
import { useStore, User, Chat, Message, Track } from '../../store/useStore';
import EmojiKeyboard, { type EmojiType } from 'rn-emoji-keyboard';
import ChatMusicShare from '../../components/music/ChatMusicShare';
import { MusicService } from '../../services/musicService';
import { safeLog } from '../../utils/debugUtils';
import VerifiedBadge from '../../components/VerifiedBadge';
import { storage, STORAGE_KEYS } from '../../platform/storage';
import { ChatStackParamList } from '../../navigation/stacks/ChatStack';

type ChatRoute = RouteProp<ChatStackParamList, 'Chat'>;

function AvatarImage({ uri, size = 36 }: { uri?: string | null; size?: number }) {
  const src = getAvatarUrl(uri);
  const isRemote = src.startsWith('http');
  if (isRemote) {
    return (
      <Image
        source={{ uri: src }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
      />
    );
  }
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: '#2a2a3a', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Users size={size * 0.45} color="#6b6b8a" />
    </View>
  );
}

const ChatScreen: React.FC = () => {
  const { user, isAuthenticated, playTrack, userStatus, player } = useStore();
  const route = useRoute<ChatRoute>();
  const openUserId = route.params?.openUserId;

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const [showUserList, setShowUserList] = useState(false);
  const [showMusicShare, setShowMusicShare] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const flatListRef = useRef<FlatList<Message>>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const deletedChatIdsRef = useRef<Set<string>>(new Set());
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [userTracks, setUserTracks] = useState<Track[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [trackSendError, setTrackSendError] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState(true);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [userStatuses, setUserStatuses] = useState<Map<string, string>>(new Map());
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  activeChatIdRef.current = activeChat?.id ?? null;

  // Keyboard show/hide listener
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Auto-select chat when navigating from a profile's message button
  useEffect(() => {
    if (!openUserId || loadingChats || !chats.length) return;
    const target = chats.find((c) => c.participants.some((p) => p.id === openUserId));
    if (target) setActiveChat(target);
  }, [openUserId, chats, loadingChats]);

  // Load persisted deleted-chat IDs
  useEffect(() => {
    if (!user?.id) return;
    storage.getJSON<string[]>(STORAGE_KEYS.deletedChats(user.id))
      .then((stored) => { if (stored) deletedChatIdsRef.current = new Set(stored); });
  }, [user?.id]);

  // Presence subscription
  useEffect(() => {
    if (!user?.id) return;
    return ChatService.subscribeToPresence(
      user.id,
      (ids, statuses) => { setOnlineUserIds(ids); setUserStatuses(statuses); },
      { track: userStatus !== 'invisible', userStatus },
    );
  }, [user?.id, userStatus]);

  // Load chats + subscribe to chat-list updates
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
  }, [user]);

  // Load messages when active chat changes
  useEffect(() => {
    if (!user || !activeChat) return;
    const otherId = getOtherUserId(activeChat);
    if (!otherId) return;
    ChatService.getChatMessages(user.id, otherId).then(setMessages);
  }, [activeChat?.id, user?.id]);

  // Subscribe to live messages for the active chat
  useEffect(() => {
    if (!user || !activeChat) return;
    const otherId = getOtherUserId(activeChat);
    if (!otherId) return;
    return ChatService.subscribeToActiveChatMessages(user.id, otherId, (newMsg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
    });
  }, [activeChat?.id, user?.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messages]);

  // Load user's tracks for the music share modal
  useEffect(() => {
    if (!showMusicShare || !user) return;
    setLoadingTracks(true);
    MusicService.getUserTracks(user.id)
      .then(setUserTracks)
      .catch(() => setUserTracks([]))
      .finally(() => setLoadingTracks(false));
  }, [showMusicShare, user]);

  // Load all users for the new-chat picker (lazy)
  useEffect(() => {
    if (!user || !showUserList || allUsers.length > 0) return;
    let cancelled = false;
    ChatService.searchUsers('', user.id).then((list) => {
      if (!cancelled) setAllUsers(list);
    });
    return () => { cancelled = true; };
  }, [user, showUserList, allUsers.length]);

  function getOtherUserId(chat: Chat): string {
    return chat.participants.find((u) => u.id !== user?.id)?.id ?? '';
  }

  const handleSend = async () => {
    if (!message.trim() || !activeChat || !user) return;
    const receiverId = getOtherUserId(activeChat);
    if (!receiverId) return;
    const content = message;
    setMessage('');
    try {
      const sent = await ChatService.sendMessage({ senderId: user.id, receiverId, content });
      setMessages((prev) => prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]);
      setChats((prev) => prev.map((c) => (c.id === activeChat.id ? { ...c, lastMessage: sent } : c)));
    } catch (err) {
      safeLog('handleSend error:', err);
      setMessage(content);
    }
  };

  const handleStartNewChat = async (otherUser: User) => {
    let chat = chats.find(
      (c) => c.participants.some((p) => p.id === otherUser.id) && c.participants.some((p) => p.id === user?.id),
    );
    if (!chat) {
      await ChatService.sendMessage({ senderId: user!.id, receiverId: otherUser.id, content: '👋' });
      const updated = await ChatService.getUserChats(user!.id);
      setChats(updated);
      chat = updated.find(
        (c) => c.participants.some((p) => p.id === otherUser.id) && c.participants.some((p) => p.id === user?.id),
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
      setTrackSendError('Failed to send track.');
    }
  };

  const handleDeleteChat = (chatId: string) => {
    Alert.alert('Delete Chat', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
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
            Alert.alert('Error', 'Failed to delete chat. Please try again.');
          }
        },
      },
    ]);
  };

  const handleDeleteMessage = (messageId: string) => {
    Alert.alert('Delete Message', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          if (!user) return;
          try {
            await ChatService.deleteMessage(messageId, user.id);
            const newMsgs = messages.filter((m) => m.id !== messageId);
            setMessages(newMsgs);
            const newLast = newMsgs.length > 0 ? newMsgs[newMsgs.length - 1] : undefined;
            if (!newLast && activeChat) {
              setChats((prev) => prev.filter((c) => c.id !== activeChat.id));
              setActiveChat(null);
            } else {
              setChats((prev) => prev.map((c) => (c.id === activeChat?.id ? { ...c, lastMessage: newLast } : c)));
            }
          } catch {
            Alert.alert('Error', 'Failed to delete message. Please try again.');
          }
        },
      },
    ]);
  };

  const handleSaveEdit = async () => {
    if (!user || !editingMessageId) return;
    try {
      const updated = await ChatService.updateMessage(editingMessageId, user.id, editingContent);
      setMessages((prev) => prev.map((m) => (m.id === editingMessageId ? updated : m)));
      setEditingMessageId(null);
      setEditingContent('');
    } catch {
      Alert.alert('Error', 'Failed to update message. Please try again.');
    }
  };

  const handlePlaySharedMusic = (track: Track) => {
    if (!track?.audioUrl) { safeLog('Shared track has no audio URL:', track); return; }
    playTrack(track);
  };

  function formatTimestamp(ts: string) {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return format(d, 'p');
    if (new Date(now.getTime() - 86400000).toDateString() === d.toDateString()) return `Yesterday ${format(d, 'p')}`;
    return format(d, 'MMM d, p');
  }

  function statusColor(isOnline: boolean, status?: string) {
    if (!isOnline) return '#4b5563';
    if (status === 'idle') return '#f59e0b';
    return '#22c55e';
  }

  // ── Render helpers ────────────────────────────────────────────────────

  const renderMessage = useCallback(({ item: msg }: { item: Message }) => {
    const isMine = msg.senderId === user?.id;
    const isEditing = editingMessageId === msg.id;

    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
        <View style={msg.type === 'track' ? styles.msgBubbleTrack : [styles.msgBubble, isMine ? styles.msgBubbleMine : styles.msgBubbleOther]}>
          {isEditing ? (
            <View style={styles.editContainer}>
              <TextInput
                style={styles.editInput}
                value={editingContent}
                onChangeText={setEditingContent}
                multiline
                autoFocus
              />
              <View style={styles.editActions}>
                <TouchableOpacity style={styles.editConfirm} onPress={handleSaveEdit}>
                  <Check size={12} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.editCancel} onPress={() => { setEditingMessageId(null); setEditingContent(''); }}>
                  <X size={12} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          ) : msg.type === 'track' ? (() => {
            const track: Track | null = (msg as any).track ?? (() => {
              try { return JSON.parse(msg.content); } catch { return null; }
            })();
            return track
              ? <ChatMusicShare track={track} onPlay={handlePlaySharedMusic} />
              : <Text style={styles.invalidTrack}>Invalid track</Text>;
          })() : (
            <TouchableOpacity
              activeOpacity={0.8}
              onLongPress={() => {
                if (!isMine) return;
                Alert.alert('Message', undefined, [
                  { text: 'Edit', onPress: () => { setEditingMessageId(msg.id); setEditingContent(msg.content); } },
                  { text: 'Delete', style: 'destructive', onPress: () => handleDeleteMessage(msg.id) },
                  { text: 'Cancel', style: 'cancel' },
                ]);
              }}
            >
              <Text style={styles.msgText}>{msg.content}</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={[styles.msgTime, isMine ? styles.msgTimeRight : styles.msgTimeLeft]}>
          {formatTimestamp(msg.timestamp)}
        </Text>
      </View>
    );
  }, [user?.id, editingMessageId, editingContent, messages]);

  const renderChatItem = useCallback(({ item: chat }: { item: Chat }) => {
    const other = chat.participants.find((u) => u.id !== user?.id);
    const isActive = activeChat?.id === chat.id;
    const isOnline = other?.id ? onlineUserIds.has(other.id) : false;
    const otherStatus = other?.id ? userStatuses.get(other.id) : undefined;
    const dot = statusColor(isOnline, otherStatus);

    return (
      <TouchableOpacity
        style={[styles.chatItem, isActive && styles.chatItemActive]}
        onPress={() => setActiveChat(chat)}
        onLongPress={() => handleDeleteChat(chat.id)}
        activeOpacity={0.75}
      >
        <View style={styles.chatItemAvatar}>
          <AvatarImage uri={other?.avatar} size={36} />
          <View style={[styles.presenceDot, { backgroundColor: dot }]} />
        </View>
        <View style={styles.chatItemContent}>
          <View style={styles.chatItemNameRow}>
            <Text style={[styles.chatItemName, isActive && styles.chatItemNameActive]} numberOfLines={1}>
              {other?.username}
            </Text>
            <VerifiedBadge verified={other?.isVerified || other?.isVerifiedArtist} size={13} />
          </View>
          <Text style={styles.chatItemPreview} numberOfLines={1}>
            {chat.lastMessage?.type === 'track'
              ? '🎵 Shared a track'
              : chat.lastMessage?.content === '👋'
              ? 'New conversation'
              : (chat.lastMessage?.content ?? '')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [user?.id, activeChat?.id, onlineUserIds, userStatuses]);

  // ── Not authenticated guard ───────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyState}>
          <MessageCircle size={64} color="#4b5563" />
          <Text style={styles.emptyTitle}>Authentication Required</Text>
          <Text style={styles.emptyBody}>You need to sign in to access the chat feature.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Chat list view ────────────────────────────────────────────────────

  if (!activeChat) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.listHeader}>
          <View style={styles.listHeaderLeft}>
            <MessageCircle size={18} color="#8b5cf6" />
            <Text style={styles.listHeaderTitle}>Messages</Text>
          </View>
          <TouchableOpacity
            style={styles.newChatButton}
            onPress={() => setShowUserList((v) => !v)}
          >
            <Plus size={15} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Your status pill */}
        <View style={styles.statusPill}>
          {userStatus === 'online' && (
            <><View style={[styles.statusDot, { backgroundColor: '#22c55e' }]} /><Text style={styles.statusText}>Online</Text></>
          )}
          {userStatus === 'idle' && (
            <><Moon size={14} color="#f59e0b" /><Text style={styles.statusText}>Idle</Text></>
          )}
          {userStatus === 'invisible' && (
            <><EyeOff size={14} color="#4b5563" /><Text style={[styles.statusText, { color: '#4b5563' }]}>Invisible</Text></>
          )}
        </View>

        {/* New chat user picker */}
        {showUserList && (
          <View style={styles.userPickerPanel}>
            <Text style={styles.userPickerLabel}>Start new chat</Text>
            <FlatList
              data={allUsers.filter((u) => u.id !== user?.id)}
              keyExtractor={(u) => u.id}
              style={{ maxHeight: 144 }}
              renderItem={({ item: other }) => (
                <TouchableOpacity
                  style={styles.userPickerItem}
                  onPress={() => handleStartNewChat(other)}
                >
                  <AvatarImage uri={other.avatar} size={24} />
                  <Text style={styles.userPickerName} numberOfLines={1}>{other.username}</Text>
                  <VerifiedBadge verified={other.isVerified || other.isVerifiedArtist} size={13} />
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* Chat list */}
        {loadingChats ? (
          <View style={styles.centeredLoader}>
            <ActivityIndicator size="small" color="#7c3aed" />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : (
          <FlatList
            data={chats.filter((c) => c.lastMessage)}
            keyExtractor={(c) => c.id}
            renderItem={renderChatItem}
            contentContainerStyle={styles.chatList}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    );
  }

  // ── Chat window view ──────────────────────────────────────────────────

  const other = activeChat.participants.find((u) => u.id !== user?.id);
  const isOnline = other?.id ? onlineUserIds.has(other.id) : false;
  const otherStatus = other?.id ? userStatuses.get(other.id) : undefined;
  const statusLabel = !isOnline ? 'Offline' : otherStatus === 'idle' ? 'Idle' : 'Online';
  const dot = statusColor(isOnline, otherStatus);

  // Extra bottom padding when mini player is visible (the player bar sits above the tab bar)
  const inputPaddingBottom = keyboardVisible ? 8 : player.visible ? 132 : 72;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Chat header */}
        <View style={styles.chatHeader}>
          <TouchableOpacity style={styles.backButton} onPress={() => { setActiveChat(null); setMessages([]); }}>
            <ArrowLeft size={20} color="#fff" />
          </TouchableOpacity>
          <AvatarImage uri={other?.avatar} size={36} />
          <View style={styles.chatHeaderInfo}>
            <View style={styles.chatHeaderNameRow}>
              <Text style={styles.chatHeaderName} numberOfLines={1}>{other?.username}</Text>
              <VerifiedBadge verified={other?.isVerified || other?.isVerifiedArtist} size={15} />
            </View>
            <View style={styles.chatHeaderStatusRow}>
              <View style={[styles.statusDotSmall, { backgroundColor: dot }]} />
              <Text style={styles.chatHeaderStatus}>{statusLabel}</Text>
            </View>
          </View>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages.filter((m) => m.content !== '👋')}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: inputPaddingBottom }]}>
          <TouchableOpacity
            style={styles.inputAction}
            onPress={() => setShowEmojiPicker((v) => !v)}
          >
            <Text style={styles.emojiTrigger}>😊</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.messageInput}
            value={message}
            onChangeText={setMessage}
            placeholder="Type a message…"
            placeholderTextColor="#4b5563"
            multiline={false}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity style={styles.inputAction} onPress={() => setShowMusicShare(true)}>
            <Music size={16} color="#8b5cf6" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendButton, !message.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!message.trim()}
          >
            <Send size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Emoji keyboard (bottom sheet) */}
      <EmojiKeyboard
        open={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        onEmojiSelected={(emoji: EmojiType) => setMessage((m) => m + emoji.emoji)}
      />

      {/* Music share modal */}
      <Modal
        visible={showMusicShare}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMusicShare(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.musicShareSheet}>
            <View style={styles.musicShareHeader}>
              <Text style={styles.musicShareTitle}>Share a track</Text>
              <TouchableOpacity onPress={() => setShowMusicShare(false)}>
                <X size={18} color="#6b6b8a" />
              </TouchableOpacity>
            </View>
            {loadingTracks ? (
              <View style={styles.centeredLoader}>
                <ActivityIndicator size="small" color="#7c3aed" />
                <Text style={styles.loadingText}>Loading tracks…</Text>
              </View>
            ) : userTracks.length === 0 ? (
              <Text style={styles.emptyShareText}>You have no tracks to share.</Text>
            ) : (
              <FlatList
                data={userTracks}
                keyExtractor={(t) => t.id}
                renderItem={({ item: track }) => (
                  <View style={styles.shareTrackItem}>
                    {track.cover ? (
                      <Image source={{ uri: track.cover }} style={styles.shareTrackCover} resizeMode="cover" />
                    ) : (
                      <View style={[styles.shareTrackCover, styles.shareTrackCoverFallback]}>
                        <Music size={16} color="#6b6b8a" />
                      </View>
                    )}
                    <View style={styles.shareTrackInfo}>
                      <Text style={styles.shareTrackTitle} numberOfLines={1}>{track.title}</Text>
                      <Text style={styles.shareTrackArtist} numberOfLines={1}>{track.artist}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.shareButton}
                      onPress={() => handleShareMusic(track)}
                    >
                      <Send size={12} color="#fff" />
                      <Text style={styles.shareButtonText}>Share</Text>
                    </TouchableOpacity>
                  </View>
                )}
                showsVerticalScrollIndicator={false}
              />
            )}
            {trackSendError ? (
              <Text style={styles.trackSendError}>{trackSendError}</Text>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────

const DARK = '#0a0a14';
const DARK2 = '#111120';
const DARK3 = '#1a1a28';
const BORDER = '#2a2a3a';
const PURPLE = '#7c3aed';
const PURPLE_LIGHT = '#8b5cf6';
const MUTED = '#6b6b8a';

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: DARK },
  flex: { flex: 1 },

  // ── Chat list ──
  listHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  listHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  newChatButton: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center',
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 12, marginVertical: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: `${DARK3}cc`, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, color: '#9ca3af' },
  userPickerPanel: {
    marginHorizontal: 12, marginBottom: 8,
    padding: 12, backgroundColor: `${DARK3}cc`, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
  },
  userPickerLabel: { fontSize: 11, fontWeight: '500', color: MUTED, marginBottom: 8 },
  userPickerItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  userPickerName: { flex: 1, fontSize: 13, color: '#fff' },
  centeredLoader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 32 },
  loadingText: { fontSize: 13, color: MUTED },
  chatList: { paddingVertical: 4, paddingHorizontal: 8 },
  chatItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, marginVertical: 2,
  },
  chatItemActive: { backgroundColor: `${PURPLE}33`, borderWidth: 1, borderColor: `${PURPLE_LIGHT}4d` },
  chatItemAvatar: { position: 'relative' },
  presenceDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: DARK,
  },
  chatItemContent: { flex: 1, minWidth: 0 },
  chatItemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chatItemName: { fontSize: 13, fontWeight: '500', color: '#fff', flexShrink: 1 },
  chatItemNameActive: { color: '#c4b5fd' },
  chatItemPreview: { fontSize: 12, color: '#6b7280', marginTop: 1 },

  // ── Chat window ──
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: DARK,
  },
  backButton: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: DARK3, alignItems: 'center', justifyContent: 'center',
  },
  chatHeaderInfo: { flex: 1, minWidth: 0 },
  chatHeaderNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chatHeaderName: { fontSize: 14, fontWeight: '600', color: '#fff', flexShrink: 1 },
  chatHeaderStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  statusDotSmall: { width: 6, height: 6, borderRadius: 3 },
  chatHeaderStatus: { fontSize: 11, color: MUTED },

  // ── Messages ──
  messageList: { paddingHorizontal: 12, paddingVertical: 12, gap: 4 },
  msgRow: { marginVertical: 2 },
  msgRowLeft: { alignItems: 'flex-start' },
  msgRowRight: { alignItems: 'flex-end' },
  msgBubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '75%' },
  msgBubbleMine: { backgroundColor: PURPLE, borderBottomRightRadius: 4 },
  msgBubbleOther: { backgroundColor: DARK3, borderBottomLeftRadius: 4 },
  msgBubbleTrack: { maxWidth: '88%' },
  msgText: { fontSize: 14, color: '#fff', lineHeight: 20 },
  msgTime: { fontSize: 11, color: '#4b5563', marginTop: 2, marginHorizontal: 4 },
  msgTimeLeft: { alignSelf: 'flex-start' },
  msgTimeRight: { alignSelf: 'flex-end' },
  invalidTrack: { fontSize: 12, color: MUTED },
  editContainer: { gap: 8, minWidth: 180 },
  editInput: {
    backgroundColor: DARK3, borderWidth: 1, borderColor: BORDER,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    color: '#fff', fontSize: 13,
  },
  editActions: { flexDirection: 'row', gap: 8 },
  editConfirm: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center',
  },
  editCancel: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: DARK3, alignItems: 'center', justifyContent: 'center',
  },

  // ── Input bar ──
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: DARK,
  },
  inputAction: { padding: 8 },
  emojiTrigger: { fontSize: 18 },
  messageInput: {
    flex: 1, backgroundColor: DARK3, borderWidth: 1, borderColor: BORDER,
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8,
    color: '#fff', fontSize: 14,
  },
  sendButton: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.4 },

  // ── Music share modal ──
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  musicShareSheet: {
    backgroundColor: DARK2, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 20, maxHeight: '60%',
    borderWidth: 1, borderColor: BORDER,
  },
  musicShareHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  musicShareTitle: { fontSize: 15, fontWeight: '600', color: '#fff' },
  emptyShareText: { textAlign: 'center', color: MUTED, fontSize: 13, paddingVertical: 32 },
  shareTrackItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  shareTrackCover: { width: 40, height: 40, borderRadius: 8 },
  shareTrackCoverFallback: { backgroundColor: DARK3, alignItems: 'center', justifyContent: 'center' },
  shareTrackInfo: { flex: 1, minWidth: 0 },
  shareTrackTitle: { fontSize: 13, fontWeight: '500', color: '#fff' },
  shareTrackArtist: { fontSize: 12, color: MUTED },
  shareButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: PURPLE, borderRadius: 20,
  },
  shareButtonText: { fontSize: 12, fontWeight: '500', color: '#fff' },
  trackSendError: { color: '#f87171', fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 },

  // ── Empty / unauthenticated ──
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  emptyBody: { fontSize: 14, color: MUTED, textAlign: 'center' },
});

export default ChatScreen;
