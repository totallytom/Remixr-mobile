import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import {
  Play,
  Pause,
  MoreVertical,
  Music,
  X,
  MessageCircle,
  Plus,
  Bookmark,
  ThumbsUp,
  List,
  Check,
} from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { hap } from '../../utils/haptics';
import { MusicService } from '../../services/musicService';
import { ChatService } from '../../services/chatService';
import { getAvatarUrl } from '../../utils/avatar';
import VerifiedBadge from '../VerifiedBadge';

const DEFAULT_TRACK_COVER = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop';

export interface Track {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
  audioUrl?: string;
  duration: number;
  genre?: string;
  boosted?: boolean;
  boostExpiresAt?: Date;
  boostPriority?: number;
  boostUserId?: string;
  createdAt?: Date;
  bpm?: number;
}

interface TrackCardProps {
  track: Track;
  onPlay?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  isPlaying?: boolean;
  showActions?: boolean;
  showBoostActions?: boolean;
  compact?: boolean;
  compactGrid?: boolean;
  onDelete?: (track: Track) => void;
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// ─── PlaylistModal ────────────────────────────────────────────────────────────

interface PlaylistModalProps {
  visible: boolean;
  track: Track;
  onClose: () => void;
}

const PlaylistModal: React.FC<PlaylistModalProps> = ({ visible, track, onClose }) => {
  const { user, playlists, setPlaylists } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!visible || !user) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const own = await MusicService.getPlaylists(user.id);
        const ownWithTracks = await Promise.all(
          own.map(p => MusicService.getPlaylistById(p.id).catch(() => p)),
        );
        const invites = await MusicService.getPlaylistInvitations(user.id, 'accepted');
        const shared = (
          await Promise.all(
            invites.map(inv =>
              MusicService.getPlaylistById(inv.playlists.id)
                .then(p => ({ ...p, isShared: true }))
                .catch(() => null),
            ),
          )
        ).filter(Boolean);
        setPlaylists([...ownWithTracks, ...(shared as any[])]);
      } catch {
        // silent
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [visible, user, setPlaylists]);

  const handleAdd = async (playlistId: string) => {
    try {
      await MusicService.addTrackToPlaylist(playlistId, track.id);
      onClose();
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.includes('duplicate') || msg.includes('unique')) {
        onClose();
      } else {
        Alert.alert('Error', 'Failed to add track to playlist.');
      }
    }
  };

  const handleCreate = async () => {
    if (!user || !newName.trim()) return;
    setIsCreating(true);
    try {
      const pl = await MusicService.createPlaylist({
        name: newName.trim(),
        isPublic,
        createdBy: user.id,
      });
      await MusicService.addTrackToPlaylist(pl.id, track.id).catch(() => {});
      const updated = await MusicService.getPlaylists(user.id);
      setPlaylists(updated);
      setShowCreate(false);
      setNewName('');
      setIsPublic(true);
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to create playlist.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {showCreate ? 'Create Playlist' : 'Add to Playlist'}
            </Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Close">
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {showCreate ? (
            <View style={styles.createForm}>
              <Text style={styles.label}>Playlist name</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="Enter playlist name"
                placeholderTextColor="rgba(255,255,255,0.25)"
                style={styles.input}
                autoFocus
              />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Make public</Text>
                <Switch
                  value={isPublic}
                  onValueChange={setIsPublic}
                  trackColor={{ false: '#374151', true: '#7c3aed' }}
                  thumbColor="#fff"
                />
              </View>
              <View style={styles.row}>
                <TouchableOpacity
                  onPress={handleCreate}
                  disabled={isCreating || !newName.trim()}
                  style={[styles.btnPrimary, (isCreating || !newName.trim()) && styles.btnDisabled]}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Create playlist and add track"
                  accessibilityState={{ disabled: isCreating || !newName.trim() }}
                >
                  {isCreating
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={styles.btnPrimaryText}>Create &amp; Add</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setShowCreate(false); setNewName(''); setIsPublic(true); }}
                  style={styles.btnSecondary}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {isLoading ? (
                <ActivityIndicator color="#7c3aed" style={{ marginVertical: 24 }} />
              ) : (
                <ScrollView style={styles.playlistList} showsVerticalScrollIndicator={false}>
                  {playlists.length === 0 ? (
                    <Text style={styles.emptyText}>No playlists yet</Text>
                  ) : (
                    playlists.map((pl: any) => {
                      const alreadyIn = pl.tracks?.some((t: any) => t.id === track.id);
                      return (
                        <TouchableOpacity
                          key={pl.id}
                          onPress={() => { hap.tap(); if (!alreadyIn) handleAdd(pl.id); }}
                          disabled={alreadyIn}
                          style={[styles.playlistItem, alreadyIn && styles.playlistItemDim]}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={alreadyIn ? `${pl.name}, already added` : `Add to ${pl.name}`}
                          accessibilityState={{ disabled: alreadyIn }}
                        >
                          <Music size={16} color={alreadyIn ? '#6b7280' : '#d1d5db'} />
                          <Text style={[styles.playlistName, alreadyIn && styles.playlistNameDim]} numberOfLines={1}>
                            {pl.name}
                          </Text>
                          {alreadyIn && <Check size={14} color="#6b7280" />}
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
              )}
              <TouchableOpacity
                onPress={() => { hap.tap(); setShowCreate(true); }}
                style={styles.createBtn}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Create new playlist"
              >
                <Plus size={16} color="#fff" />
                <Text style={styles.createBtnText}>Create new playlist</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

// ─── MessageModal ─────────────────────────────────────────────────────────────

interface MessageModalProps {
  visible: boolean;
  track: Track;
  onClose: () => void;
}

const MessageModal: React.FC<MessageModalProps> = ({ visible, track, onClose }) => {
  const { user } = useStore();
  const [query, setQuery] = useState('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !user) return;
    setIsLoading(true);
    ChatService.searchUsers('', user.id)
      .then(r => { setAllUsers(r); setResults(r); })
      .catch(() => setError('Failed to load users'))
      .finally(() => setIsLoading(false));
  }, [visible, user]);

  const filter = (q: string) => {
    setQuery(q);
    if (!q.trim()) { setResults(allUsers); return; }
    setResults(
      allUsers.filter(u =>
        u.username.toLowerCase().includes(q.toLowerCase()) ||
        (u.artistName && u.artistName.toLowerCase().includes(q.toLowerCase())),
      ),
    );
  };

  const handleSend = async (receiverId: string) => {
    if (!user) return;
    try {
      await ChatService.sendMessage({
        senderId: user.id,
        receiverId,
        content: JSON.stringify(track),
        type: 'track',
      });
      setSentId(receiverId);
      setTimeout(() => {
        setSentId(null);
        onClose();
      }, 800);
    } catch {
      setError('Failed to send track');
    }
  };

  const handleClose = () => {
    setQuery('');
    setResults(allUsers);
    setError(null);
    setSentId(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Send to user</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Close">
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Track preview */}
          <View style={styles.trackPreview}>
            <Image
              source={{ uri: track.cover || DEFAULT_TRACK_COVER }}
              style={styles.trackPreviewCover}
              resizeMode="cover"
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.trackPreviewTitle} numberOfLines={1}>{track.title}</Text>
              <Text style={styles.trackPreviewArtist} numberOfLines={1}>{track.artist}</Text>
            </View>
          </View>

          <TextInput
            value={query}
            onChangeText={filter}
            placeholder="Search users…"
            placeholderTextColor="rgba(255,255,255,0.25)"
            style={[styles.input, { marginBottom: 8 }]}
          />

          {error && <Text style={styles.errorText}>{error}</Text>}
          {isLoading
            ? <ActivityIndicator color="#7c3aed" style={{ marginVertical: 16 }} />
            : (
              <FlatList
                data={results}
                keyExtractor={u => u.id}
                style={{ maxHeight: 260 }}
                renderItem={({ item: u }) => (
                  <TouchableOpacity
                    onPress={() => { hap.tap(); handleSend(u.id); }}
                    style={styles.userItem}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={sentId === u.id ? `Sent to ${u.username}` : `Send to ${u.username}`}
                    accessibilityState={{ disabled: sentId === u.id }}
                  >
                    <Image
                      source={{ uri: getAvatarUrl(u.avatar) }}
                      style={styles.avatar}
                      resizeMode="cover"
                    />
                    <View style={{ flex: 1 }}>
                      <View style={styles.usernameRow}>
                        <Text style={styles.username} numberOfLines={1}>{u.username}</Text>
                        <VerifiedBadge verified={u.isVerified || u.isVerifiedArtist} size={14} />
                      </View>
                      {u.artistName ? (
                        <Text style={styles.artistName} numberOfLines={1}>{u.artistName}</Text>
                      ) : null}
                    </View>
                    {sentId === u.id
                      ? <Check size={16} color="#4ade80" />
                      : <MessageCircle size={16} color="#6b7280" />}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>
                    {query ? `No users matching "${query}"` : 'No users available'}
                  </Text>
                }
              />
            )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

// ─── TrackCard ────────────────────────────────────────────────────────────────

const TrackCard: React.FC<TrackCardProps> = ({
  track,
  onPlay,
  onAddToQueue,
  isPlaying = false,
  showActions = true,
  showBoostActions = true,
  compact = false,
  compactGrid = false,
  onDelete,
}) => {
  const { player, playTrack, pauseTrack, addToQueue, user, isAuthenticated } = useStore();

  const [showMenu, setShowMenu] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [isLikedByUser, setIsLikedByUser] = useState(false);
  const [coverError, setCoverError] = useState(false);

  const isCurrentlyPlaying = player.currentTrack?.id === track.id && player.isPlaying;

  useEffect(() => {
    if (!user) return;
    MusicService.isTrackBookmarked(track.id, user.id)
      .then(setIsLiked)
      .catch(() => {});
    MusicService.getTrackLikes(track.id)
      .then(({ likes, likedBy }) => {
        setLikesCount(likes);
        setIsLikedByUser(likedBy.includes(user.id));
      })
      .catch(() => {});
  }, [track.id, user]);

  const handlePlayPause = useCallback(() => {
    hap.tap();
    if (isCurrentlyPlaying) {
      pauseTrack();
    } else if (onPlay) {
      onPlay(track);
    } else {
      playTrack(track);
    }
  }, [isCurrentlyPlaying, onPlay, track, pauseTrack, playTrack]);

  const handleAddToQueue = useCallback(() => {
    hap.tap();
    if (onAddToQueue) onAddToQueue(track);
    else addToQueue(track);
  }, [onAddToQueue, track, addToQueue]);

  const handleBookmark = useCallback(async () => {
    if (!user) return;
    hap.medium();
    try {
      if (isLiked) {
        await MusicService.removeBookmark(track.id, user.id);
        setIsLiked(false);
      } else {
        await MusicService.addBookmark(track.id, user.id);
        setIsLiked(true);
      }
    } catch {
      setIsLiked(prev => !prev);
    }
  }, [isLiked, track.id, user]);

  const handleTrackLike = useCallback(async () => {
    if (!user) return;
    hap.medium();
    const prevCount = likesCount;
    const prevLiked = isLikedByUser;
    setLikesCount(c => isLikedByUser ? Math.max(0, c - 1) : c + 1);
    setIsLikedByUser(v => !v);
    try {
      await MusicService.likeTrack(track.id, user.id);
      const { likes, likedBy } = await MusicService.getTrackLikes(track.id);
      setLikesCount(likes);
      setIsLikedByUser(likedBy.includes(user.id));
    } catch {
      setLikesCount(prevCount);
      setIsLikedByUser(prevLiked);
    }
  }, [isLikedByUser, likesCount, track.id, user]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Track',
      `Delete "${track.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete?.(track) },
      ],
    );
  }, [onDelete, track]);

  const coverSource = coverError ? { uri: DEFAULT_TRACK_COVER } : { uri: track.cover || DEFAULT_TRACK_COVER };

  // ── compactGrid: vertical card ─────────────────────────────────────────────
  if (compactGrid) {
    return (
      <>
        <View style={styles.gridCard}>
          {/* Square artwork */}
          <View style={styles.gridArt}>
            <Image
              source={coverSource}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              onError={() => setCoverError(true)}
            />
            <TouchableOpacity onPress={handlePlayPause} style={styles.gridPlayBtn} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={isCurrentlyPlaying ? `Pause ${track.title}` : `Play ${track.title}`} accessibilityState={{ checked: isCurrentlyPlaying }}>
              <View style={styles.playCircle}>
                {isCurrentlyPlaying ? <Pause size={22} color="#000" /> : <Play size={22} color="#000" />}
              </View>
            </TouchableOpacity>

            {showActions && isAuthenticated && (
              <View style={styles.gridActions}>
                <TouchableOpacity onPress={() => { hap.tap(); setShowPlaylistModal(true); }} style={styles.iconBtn} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Add to playlist">
                  <Plus size={13} color="#374151" />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleBookmark} style={[styles.iconBtn, isLiked && styles.iconBtnActive]} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={isLiked ? 'Remove bookmark' : 'Bookmark'} accessibilityState={{ checked: isLiked }}>
                  <Bookmark size={13} color={isLiked ? '#fff' : '#374151'} fill={isLiked ? '#60a5fa' : 'none'} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAddToQueue} style={styles.iconBtn} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Add to queue">
                  <List size={13} color="#374151" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { hap.tap(); setShowMessageModal(true); }} style={styles.iconBtn} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Send to user">
                  <MessageCircle size={13} color="#374151" />
                </TouchableOpacity>
                {onDelete && (
                  <TouchableOpacity onPress={handleDelete} style={styles.iconBtn} activeOpacity={0.8}>
                    <X size={13} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Info */}
          <View style={styles.gridInfo}>
            <Text style={styles.gridTitle} numberOfLines={1}>{track.title}</Text>
            <Text style={styles.gridArtist} numberOfLines={1}>{track.artist}</Text>
            <View style={styles.gridMeta}>
              <Text style={styles.metaText}>{formatDuration(track.duration)}</Text>
              {user && (
                <TouchableOpacity onPress={handleTrackLike} style={styles.likeRow} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={isLikedByUser ? 'Unlike' : 'Like'} accessibilityState={{ checked: isLikedByUser }}>
                  <ThumbsUp size={12} color={isLikedByUser ? '#60a5fa' : '#9ca3af'} fill={isLikedByUser ? '#60a5fa' : 'none'} />
                  <Text accessible={false} style={styles.metaText}> {likesCount}</Text>
                </TouchableOpacity>
              )}
            </View>
            {(track.createdAt != null || track.bpm != null) && (
              <View style={styles.extraMeta}>
                {track.createdAt != null && (
                  <Text style={styles.metaText}>
                    {new Date(track.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                )}
                {track.bpm != null && <Text style={styles.metaText}>{track.bpm} BPM</Text>}
              </View>
            )}
          </View>
        </View>

        <PlaylistModal visible={showPlaylistModal} track={track} onClose={() => setShowPlaylistModal(false)} />
        <MessageModal visible={showMessageModal} track={track} onClose={() => setShowMessageModal(false)} />
      </>
    );
  }

  // ── Default: horizontal row ────────────────────────────────────────────────
  return (
    <>
      <View style={styles.rowCard}>
        {/* Album art — tap to play */}
        <TouchableOpacity onPress={handlePlayPause} style={styles.rowArt} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={isCurrentlyPlaying ? `Pause ${track.title}` : `Play ${track.title} by ${track.artist}`}>
          <Image
            source={coverSource}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setCoverError(true)}
          />
          {isCurrentlyPlaying && (
            <View style={styles.pauseOverlay}>
              <Pause size={18} color="#ffffff" />
            </View>
          )}
        </TouchableOpacity>

        {/* Info */}
        <View style={styles.rowInfo}>
          <Text style={styles.rowTitle} numberOfLines={1}>{track.title}</Text>
          <Text style={styles.rowArtist} numberOfLines={1}>
            {track.artist}{track.album ? ` • ${track.album}` : ''}
          </Text>
          <View style={styles.rowMeta}>
            <Text style={styles.metaText}>{formatDuration(track.duration)}</Text>
            {user && (
              <TouchableOpacity onPress={handleTrackLike} style={styles.likeRow} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={isLikedByUser ? 'Unlike' : 'Like'} accessibilityState={{ checked: isLikedByUser }}>
                <ThumbsUp size={14} color={isLikedByUser ? '#60a5fa' : '#9ca3af'} fill={isLikedByUser ? '#60a5fa' : 'none'} />
                <Text accessible={false} style={styles.metaText}> {likesCount}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.rowActions}>
          <TouchableOpacity onPress={handlePlayPause} style={styles.playBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={isCurrentlyPlaying ? `Pause ${track.title}` : `Play ${track.title}`} accessibilityState={{ checked: isCurrentlyPlaying }}>
            {isCurrentlyPlaying ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" />}
          </TouchableOpacity>
          {showActions && isAuthenticated && (
            <TouchableOpacity onPress={() => { hap.tap(); setShowMenu(true); }} style={styles.moreBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`More options for ${track.title}`}>
              <MoreVertical size={18} color="#6b7280" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Bottom-sheet actions menu */}
      <Modal visible={showMenu} transparent animationType="slide" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle} numberOfLines={1}>{track.title}</Text>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => { hap.tap(); setShowMenu(false); setShowPlaylistModal(true); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Add to playlist"
            >
              <Plus size={16} color="#d1d5db" />
              <Text style={styles.menuText}>Add to playlist</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => { setShowMenu(false); handleBookmark(); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={isLiked ? 'Remove bookmark' : 'Bookmark'}
            >
              <Bookmark size={16} color={isLiked ? '#60a5fa' : '#d1d5db'} fill={isLiked ? '#60a5fa' : 'none'} />
              <Text style={styles.menuText}>{isLiked ? 'Remove bookmark' : 'Bookmark'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => { setShowMenu(false); handleAddToQueue(); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Add to queue"
            >
              <List size={16} color="#d1d5db" />
              <Text style={styles.menuText}>Add to queue</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => { hap.tap(); setShowMenu(false); setShowMessageModal(true); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Send to user"
            >
              <MessageCircle size={16} color="#d1d5db" />
              <Text style={styles.menuText}>Send to user</Text>
            </TouchableOpacity>

            {onDelete && (
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => { setShowMenu(false); handleDelete(); }}
                activeOpacity={0.7}
              >
                <X size={16} color="#f87171" />
                <Text style={[styles.menuText, { color: '#f87171' }]}>Delete</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { hap.tap(); setShowMenu(false); }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <PlaylistModal visible={showPlaylistModal} track={track} onClose={() => setShowPlaylistModal(false)} />
      <MessageModal visible={showMessageModal} track={track} onClose={() => setShowMessageModal(false)} />
    </>
  );
};

const styles = StyleSheet.create({
  // ── Shared modal/sheet ─────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1c1c2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  // ── Playlist modal ─────────────────────────────────────────────────────────
  createForm: { gap: 12 },
  label: { color: '#d1d5db', fontSize: 13, marginBottom: 4 },
  input: {
    backgroundColor: '#0f0f1a',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    marginBottom: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  switchLabel: { color: '#d1d5db', fontSize: 14 },
  row: { flexDirection: 'row', gap: 8 },
  btnPrimary: {
    flex: 1,
    backgroundColor: '#7c3aed',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  btnSecondary: {
    flex: 1,
    backgroundColor: '#374151',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  btnSecondaryText: { color: '#fff', fontSize: 14 },
  playlistList: { maxHeight: 280, marginBottom: 12 },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3a',
  },
  playlistItemDim: { opacity: 0.5 },
  playlistName: { flex: 1, color: '#fff', fontSize: 14 },
  playlistNameDim: { color: '#6b7280' },
  emptyText: { color: '#6b7280', textAlign: 'center', paddingVertical: 16, fontSize: 13 },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 4,
  },
  createBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  // ── Message modal ──────────────────────────────────────────────────────────
  trackPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0f0f1a',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  trackPreviewCover: { width: 44, height: 44, borderRadius: 6 },
  trackPreviewTitle: { color: '#fff', fontWeight: '600', fontSize: 13 },
  trackPreviewArtist: { color: '#9ca3af', fontSize: 12 },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3a',
  },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#374151' },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  username: { color: '#fff', fontWeight: '600', fontSize: 14 },
  artistName: { color: '#9ca3af', fontSize: 12 },
  errorText: { color: '#f87171', textAlign: 'center', fontSize: 13, marginBottom: 8 },
  // ── Row card ───────────────────────────────────────────────────────────────
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 0,
    backgroundColor: '#111',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    marginBottom: 4,
    shadowColor: '#f97316',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  rowArt: {
    width: 60,
    height: 60,
    borderRadius: 0,
    overflow: 'hidden',
    flexShrink: 0,
    backgroundColor: '#1f2937',
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  rowArtist: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Bottom-sheet menu rows ─────────────────────────────────────────────────
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3a',
  },
  menuText: { color: '#d1d5db', fontSize: 15 },
  cancelBtn: {
    marginTop: 10,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#374151',
    borderRadius: 12,
  },
  cancelText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '500' },
  // ── Grid card ──────────────────────────────────────────────────────────────
  gridCard: {
    borderRadius: 0,
    backgroundColor: '#111',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    shadowColor: '#f97316',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  gridArt: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#1f2937',
    overflow: 'hidden',
  },
  gridPlayBtn: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  playCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridActions: {
    position: 'absolute',
    top: 8,
    right: 8,
    gap: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: { backgroundColor: '#60a5fa' },
  gridInfo: { padding: 10, backgroundColor: '#111' },
  gridTitle: { color: '#fff', fontWeight: '600', fontSize: 13 },
  gridArtist: { color: '#9ca3af', fontSize: 11, marginTop: 2 },
  gridMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  extraMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  metaText: { color: '#9ca3af', fontSize: 11 },
  likeRow: { flexDirection: 'row', alignItems: 'center' },
});

export default TrackCard;
