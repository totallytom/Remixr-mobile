import React, { useState, useEffect, useCallback } from 'react';
import LicenseBadge from './LicenseBadge';
import {
  View,
  Text as RNText,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  type TextProps,
} from 'react-native';
import { Image } from 'expo-image';
import { FONTS } from '../../utils/fonts';

const Text = ({ style, ...props }: TextProps) => (
  <RNText style={[{ fontFamily: FONTS.body }, style]} {...props} />
);
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
  Flag,
} from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { hap } from '../../utils/haptics';
import { MusicService } from '../../services/musicService';
import { ChatService } from '../../services/chatService';
import { supabase } from '../../services/supabase';
import { getAvatarUrl } from '../../utils/avatar';
import VerifiedBadge from '../VerifiedBadge';
import { requireAuth } from '../auth/GuestPrompt';
import { appLocale } from '../../utils/dateLocale';
import { useTranslation } from 'react-i18next';
import { isDuplicateError } from '../../utils/appError';
import { updateTrackStatus, useTrackStatus } from '../../services/trackStatusLoader';

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
  const { t } = useTranslation();
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
      if (isDuplicateError(e) || msg.includes('duplicate') || msg.includes('unique')) {
        onClose();
      } else {
        Alert.alert(t('common.error'), t('track.playlistSheet.addFailed'));
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
      Alert.alert(t('common.error'), e?.message ?? t('track.playlistSheet.createFailed'));
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
              {showCreate ? t('track.playlistSheet.createTitle') : t('track.playlistSheet.addTitle')}
            </Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {showCreate ? (
            <View style={styles.createForm}>
              <Text style={styles.label}>{t('track.playlistSheet.name')}</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder={t('track.playlistSheet.namePlaceholder')}
                placeholderTextColor="rgba(255,255,255,0.25)"
                style={styles.input}
                autoFocus
              />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{t('track.playlistSheet.makePublic')}</Text>
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
                  accessibilityLabel={t('track.playlistSheet.createAndAddA11y')}
                  accessibilityState={{ disabled: isCreating || !newName.trim() }}
                >
                  {isCreating
                    ? <ActivityIndicator size="small" color="#000000" />
                    : <Text style={styles.btnPrimaryText}>{t('track.playlistSheet.createAndAdd')}</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setShowCreate(false); setNewName(''); setIsPublic(true); }}
                  style={styles.btnSecondary}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                >
                  <Text style={styles.btnSecondaryText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {isLoading ? (
                <ActivityIndicator color="#000000" style={{ marginVertical: 24 }} />
              ) : (
                <ScrollView style={styles.playlistList} showsVerticalScrollIndicator={false}>
                  {playlists.length === 0 ? (
                    <Text style={styles.emptyText}>{t('track.playlistSheet.none')}</Text>
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
                          accessibilityLabel={alreadyIn ? t('track.playlistSheet.alreadyAdded', { name: pl.name }) : t('track.playlistSheet.addTo', { name: pl.name })}
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
                accessibilityLabel={t('track.playlistSheet.createNew')}
              >
                <Plus size={16} color="#fff" />
                <Text style={styles.createBtnText}>{t('track.playlistSheet.createNew')}</Text>
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
  const { t } = useTranslation();
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
      .catch(() => setError(t('track.sendSheet.loadFailed')))
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
      setError(t('track.sendSheet.sendFailed'));
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
            <Text style={styles.sheetTitle}>{t('track.sendSheet.title')}</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Track preview */}
          <View style={styles.trackPreview}>
            <Image
              source={{ uri: track.cover || DEFAULT_TRACK_COVER }}
              style={styles.trackPreviewCover}
              contentFit="cover"
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.trackPreviewTitle} numberOfLines={1}>{track.title}</Text>
              <Text style={styles.trackPreviewArtist} numberOfLines={1}>{track.artist}</Text>
            </View>
          </View>

          <TextInput
            value={query}
            onChangeText={filter}
            placeholder={t('track.sendSheet.search')}
            placeholderTextColor="rgba(255,255,255,0.25)"
            style={[styles.input, { marginBottom: 8 }]}
          />

          {error && <Text style={styles.errorText}>{error}</Text>}
          {isLoading
            ? <ActivityIndicator color="#000000" style={{ marginVertical: 16 }} />
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
                    accessibilityLabel={sentId === u.id ? t('track.sendSheet.sentTo', { name: u.username }) : t('track.sendSheet.sendTo', { name: u.username })}
                    accessibilityState={{ disabled: sentId === u.id }}
                  >
                    <Image
                      source={{ uri: getAvatarUrl(u.avatar) }}
                      style={styles.avatar}
                      contentFit="cover"
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
                    {query ? t('track.sendSheet.noMatch', { query }) : t('track.sendSheet.none')}
                  </Text>
                }
              />
            )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

// ─── ReportModal ─────────────────────────────────────────────────────────────

const REPORT_REASONS = [
  { key: 'copyright',     label: 'track.reportSheet.copyright' },
  { key: 'inappropriate', label: 'track.reportSheet.inappropriate' },
  { key: 'spam',          label: 'track.reportSheet.spam' },
  { key: 'other',         label: 'track.reportSheet.other' },
] as const;

type ReportReason = typeof REPORT_REASONS[number]['key'];

interface ReportModalProps {
  visible: boolean;
  track: Track;
  onClose: () => void;
}

const ReportModal: React.FC<ReportModalProps> = ({ visible, track, onClose }) => {
  const { t } = useTranslation();
  const { user } = useStore();
  const [reason, setReason] = useState<ReportReason>('copyright');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      const { data: result, error } = await supabase
        .rpc('submit_track_report', {
          p_track_id: track.id,
          p_reason:   reason,
          p_details:  details.trim() || null,
        });
      if (error) throw error;
      if (result === 'already_reported') {
        Alert.alert(t('track.reportSheet.alreadyTitle'), t('track.reportSheet.alreadyBody'));
        handleClose();
        return;
      }
      setDone(true);
      setTimeout(() => {
        setDone(false);
        setDetails('');
        setReason('copyright');
        onClose();
      }, 1500);
    } catch {
      Alert.alert(t('common.error'), t('track.reportSheet.failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setDetails('');
    setReason('copyright');
    setDone(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('track.reportSheet.title')}</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {done ? (
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 10 }}>
              <Check size={32} color="#4ade80" />
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{t('track.reportSheet.submitted')}</Text>
              <Text style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center' }}>
                {t('track.reportSheet.reviewNote')}
              </Text>
            </View>
          ) : (
            <>
              <Text style={{ color: '#9ca3af', fontSize: 13, marginBottom: 14 }} numberOfLines={1}>
                "{track.title}"
              </Text>

              {REPORT_REASONS.map(r => (
                <TouchableOpacity
                  key={r.key}
                  onPress={() => setReason(r.key)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 11,
                    borderBottomWidth: 1,
                    borderBottomColor: '#2a2a3a',
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    borderWidth: 2,
                    borderColor: reason === r.key ? '#7c3aed' : '#4b5563',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {reason === r.key && (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#7c3aed' }} />
                    )}
                  </View>
                  <Text style={{ color: '#d1d5db', fontSize: 14 }}>{t(r.label)}</Text>
                </TouchableOpacity>
              ))}

              <TextInput
                value={details}
                onChangeText={setDetails}
                placeholder={t('track.reportSheet.details')}
                placeholderTextColor="rgba(255,255,255,0.25)"
                multiline
                numberOfLines={2}
                style={[styles.input, { marginTop: 12, textAlignVertical: 'top', minHeight: 60 }]}
              />

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={isSubmitting}
                style={{
                  marginTop: 14,
                  backgroundColor: isSubmitting ? '#4b5563' : '#ef4444',
                  borderRadius: 12,
                  paddingVertical: 13,
                  alignItems: 'center',
                }}
                activeOpacity={0.8}
              >
                {isSubmitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t('track.reportSheet.submit')}</Text>
                }
              </TouchableOpacity>
            </>
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
  const { t } = useTranslation();
  const { player, playTrack, pauseTrack, addToQueue, user, isAuthenticated } = useStore();

  const [showMenu, setShowMenu] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  // Like / bookmark status comes from a shared, batched loader (one request
  // set for every card on screen, cached) instead of 2 requests per card.
  const status = useTrackStatus(track.id, user?.id);
  const isLiked = status?.bookmarked ?? false; // bookmark
  const likesCount = status?.likes ?? 0;
  const isLikedByUser = status?.likedByMe ?? false;
  const [coverError, setCoverError] = useState(false);

  const isCurrentlyPlaying = player.currentTrack?.id === track.id && player.isPlaying;

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
    if (!user) { requireAuth('like'); return; }
    hap.medium();
    const was = isLiked;
    updateTrackStatus(track.id, { bookmarked: !was });
    try {
      if (was) await MusicService.removeBookmark(track.id, user.id);
      else await MusicService.addBookmark(track.id, user.id);
    } catch {
      updateTrackStatus(track.id, { bookmarked: was });
    }
  }, [isLiked, track.id, user]);

  const handleTrackLike = useCallback(async () => {
    if (!user) { requireAuth('like'); return; }
    hap.medium();
    const prev = { likes: likesCount, likedByMe: isLikedByUser };
    updateTrackStatus(track.id, {
      likedByMe: !prev.likedByMe,
      likes: prev.likedByMe ? Math.max(0, prev.likes - 1) : prev.likes + 1,
    });
    try {
      // The server returns the new state; no second request needed.
      const res = await MusicService.likeTrack(track.id, user.id);
      updateTrackStatus(track.id, { likedByMe: !!res.liked, likes: Number(res.likes ?? 0) });
    } catch {
      updateTrackStatus(track.id, prev);
    }
  }, [isLikedByUser, likesCount, track.id, user]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      t('track.deleteTitle'),
      t('track.deleteBody', { title: track.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('track.delete'), style: 'destructive', onPress: () => onDelete?.(track) },
      ],
    );
  }, [onDelete, track]);

  const coverSource = coverError ? { uri: DEFAULT_TRACK_COVER } : { uri: track.cover || DEFAULT_TRACK_COVER };

  // ── compactGrid: vertical card ─────────────────────────────────────────────
  if (compactGrid) {
    return (
      <>
        <View style={styles.gridCard}>
          <View style={styles.gridInner}>
            {/* Cover art — tap to play/pause */}
            <TouchableOpacity
              onPress={handlePlayPause}
              style={styles.gridArt}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={isCurrentlyPlaying ? t('track.pauseTitle', { title: track.title }) : t('track.playTitle', { title: track.title })}
              accessibilityState={{ checked: isCurrentlyPlaying }}
            >
              <Image
                source={coverSource}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                onError={() => setCoverError(true)}
              />
              {isCurrentlyPlaying && (
                <View style={styles.gridPlayingOverlay}>
                  <Pause size={28} color="#fff" />
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.gridDivider} />

            {/* Info strip */}
            <View style={styles.gridInfo}>
              <Text style={styles.gridTitle} numberOfLines={1}>
                {track.title}{track.album ? `, ${track.album}` : ''}
              </Text>
              <Text style={styles.gridArtist} numberOfLines={1}>{track.artist}</Text>
              <View style={{ marginTop: 4 }}>
                <LicenseBadge license={(track as { licenseType?: string }).licenseType} />
              </View>

              <View style={styles.gridMeta}>
                <Text style={styles.metaText}>
                  {track.createdAt != null
                    ? new Date(track.createdAt).toLocaleDateString(appLocale(), { month: 'short', day: 'numeric', year: 'numeric' })
                    : formatDuration(track.duration)}
                </Text>
                {user && (
                  <TouchableOpacity
                    onPress={handleTrackLike}
                    style={styles.likeRow}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={isLikedByUser ? t('track.unlike') : t('track.like')}
                    accessibilityState={{ checked: isLikedByUser }}
                  >
                    <ThumbsUp size={14} color={isLikedByUser ? '#60a5fa' : '#9ca3af'} fill={isLikedByUser ? '#60a5fa' : 'none'} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Action buttons row */}
              <View style={styles.gridActions}>
                <TouchableOpacity onPress={handlePlayPause} style={styles.gridActionBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={isCurrentlyPlaying ? t('track.pause') : t('track.play')}>
                  {isCurrentlyPlaying ? <Pause size={15} color="#fff" /> : <Play size={15} color="#fff" />}
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAddToQueue} style={[styles.gridActionBtn, styles.gridActionBtnOutline]} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('track.addToQueue')}>
                  <List size={15} color="#000" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { hap.tap(); if (requireAuth('playlist')) setShowPlaylistModal(true); }} style={[styles.gridActionBtn, styles.gridActionBtnOutline]} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('track.addToPlaylist')}>
                  <Plus size={15} color="#000" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { hap.tap(); setShowMenu(true); }} style={[styles.gridActionBtn, styles.gridActionBtnOutline]} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('track.moreOptions')}>
                  <MoreVertical size={15} color="#000" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <Modal visible={showMenu} transparent animationType="slide" onRequestClose={() => setShowMenu(false)}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowMenu(false)}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle} numberOfLines={1}>{track.title}</Text>

              <TouchableOpacity style={styles.menuRow} onPress={() => { hap.tap(); setShowMenu(false); if (requireAuth('playlist')) setShowPlaylistModal(true); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('track.addToPlaylist')}>
                <Plus size={16} color="#d1d5db" />
                <Text style={styles.menuText}>{t('track.addToPlaylist')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuRow} onPress={() => { setShowMenu(false); handleBookmark(); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={isLiked ? t('track.removeBookmark') : t('track.bookmark')}>
                <Bookmark size={16} color={isLiked ? '#60a5fa' : '#d1d5db'} fill={isLiked ? '#60a5fa' : 'none'} />
                <Text style={styles.menuText}>{isLiked ? t('track.removeBookmark') : t('track.bookmark')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuRow} onPress={() => { setShowMenu(false); handleAddToQueue(); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('track.addToQueue')}>
                <List size={16} color="#d1d5db" />
                <Text style={styles.menuText}>{t('track.addToQueue')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuRow} onPress={() => { hap.tap(); setShowMenu(false); if (requireAuth('chat')) setShowMessageModal(true); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('track.sendToUser')}>
                <MessageCircle size={16} color="#d1d5db" />
                <Text style={styles.menuText}>{t('track.sendToUser')}</Text>
              </TouchableOpacity>

              {onDelete && (
                <TouchableOpacity style={styles.menuRow} onPress={() => { setShowMenu(false); handleDelete(); }} activeOpacity={0.7}>
                  <X size={16} color="#f87171" />
                  <Text style={[styles.menuText, { color: '#f87171' }]}>{t('track.delete')}</Text>
                </TouchableOpacity>
              )}

              {user && (
                <TouchableOpacity style={styles.menuRow} onPress={() => { hap.tap(); setShowMenu(false); if (requireAuth('report')) setShowReportModal(true); }} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('track.reportTrack')}>
                  <Flag size={16} color="#f87171" />
                  <Text style={[styles.menuText, { color: '#f87171' }]}>{t('track.report')}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.cancelBtn} onPress={() => { hap.tap(); setShowMenu(false); }} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        <PlaylistModal visible={showPlaylistModal} track={track} onClose={() => setShowPlaylistModal(false)} />
        <MessageModal visible={showMessageModal} track={track} onClose={() => setShowMessageModal(false)} />
        <ReportModal visible={showReportModal} track={track} onClose={() => setShowReportModal(false)} />
      </>
    );
  }

  // ── Default: horizontal row ────────────────────────────────────────────────
  return (
    <>
      <View style={styles.rowCard}>
        {/* Album art — tap to play */}
        <TouchableOpacity onPress={handlePlayPause} style={styles.rowArt} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={isCurrentlyPlaying ? t('track.pauseTitle', { title: track.title }) : t('track.playTitleBy', { title: track.title, artist: track.artist })}>
          <Image
            source={coverSource}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
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
            <LicenseBadge license={(track as { licenseType?: string }).licenseType} />
            {user && (
              <TouchableOpacity onPress={handleTrackLike} style={styles.likeRow} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={isLikedByUser ? t('track.unlike') : t('track.like')} accessibilityState={{ checked: isLikedByUser }}>
                <ThumbsUp size={14} color={isLikedByUser ? '#60a5fa' : '#9ca3af'} fill={isLikedByUser ? '#60a5fa' : 'none'} />
                <Text accessible={false} style={styles.metaText}> {likesCount}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.rowActions}>
          <TouchableOpacity onPress={handlePlayPause} style={styles.playBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={isCurrentlyPlaying ? t('track.pauseTitle', { title: track.title }) : t('track.playTitle', { title: track.title })} accessibilityState={{ checked: isCurrentlyPlaying }}>
            {isCurrentlyPlaying ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" />}
          </TouchableOpacity>
          {showActions && isAuthenticated && (
            <TouchableOpacity onPress={() => { hap.tap(); setShowMenu(true); }} style={styles.moreBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('track.moreOptionsFor', { title: track.title })}>
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
              onPress={() => { hap.tap(); setShowMenu(false); if (requireAuth('playlist')) setShowPlaylistModal(true); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('track.addToPlaylist')}
            >
              <Plus size={16} color="#d1d5db" />
              <Text style={styles.menuText}>{t('track.addToPlaylist')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => { setShowMenu(false); handleBookmark(); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={isLiked ? t('track.removeBookmark') : t('track.bookmark')}
            >
              <Bookmark size={16} color={isLiked ? '#60a5fa' : '#d1d5db'} fill={isLiked ? '#60a5fa' : 'none'} />
              <Text style={styles.menuText}>{isLiked ? t('track.removeBookmark') : t('track.bookmark')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => { setShowMenu(false); handleAddToQueue(); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('track.addToQueue')}
            >
              <List size={16} color="#d1d5db" />
              <Text style={styles.menuText}>{t('track.addToQueue')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => { hap.tap(); setShowMenu(false); if (requireAuth('chat')) setShowMessageModal(true); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('track.sendToUser')}
            >
              <MessageCircle size={16} color="#d1d5db" />
              <Text style={styles.menuText}>{t('track.sendToUser')}</Text>
            </TouchableOpacity>

            {onDelete && (
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => { setShowMenu(false); handleDelete(); }}
                activeOpacity={0.7}
              >
                <X size={16} color="#f87171" />
                <Text style={[styles.menuText, { color: '#f87171' }]}>{t('track.delete')}</Text>
              </TouchableOpacity>
            )}

            {user && (
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => { hap.tap(); setShowMenu(false); if (requireAuth('report')) setShowReportModal(true); }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('track.reportTrack')}
              >
                <Flag size={16} color="#f87171" />
                <Text style={[styles.menuText, { color: '#f87171' }]}>{t('track.report')}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { hap.tap(); setShowMenu(false); }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <PlaylistModal visible={showPlaylistModal} track={track} onClose={() => setShowPlaylistModal(false)} />
      <MessageModal visible={showMessageModal} track={track} onClose={() => setShowMessageModal(false)} />
      <ReportModal visible={showReportModal} track={track} onClose={() => setShowReportModal(false)} />
    </>
  );
};

const styles = StyleSheet.create({
  // ── Shared modal/sheet ─────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
    paddingBottom: 230,
  },
  sheet: {
    backgroundColor: '#1c1c2e',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    marginHorizontal: 12,
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
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#121212',
    marginBottom: 4,
    shadowColor: '#121212',
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
  rowTitle: { color: '#000', fontWeight: '700', fontSize: 14 },
  rowArtist: { color: '#1f2937', fontSize: 12, marginTop: 2 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#121212',
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
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#000',
    padding: 7,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 0,
    elevation: 6,
  },
  gridInner: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#000',
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  gridArt: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#1f2937',
    overflow: 'hidden',
  },
  gridPlayingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridDivider: {
    height: 2,
    backgroundColor: '#000',
  },
  gridInfo: { padding: 10, gap: 2 },
  gridTitle: { color: '#000', fontWeight: '700', fontSize: 13 },
  gridArtist: { color: '#374151', fontSize: 11, marginTop: 1 },
  gridMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  gridActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  gridActionBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121212',
  },
  gridActionBtnOutline: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#000',
  },
  metaText: { color: '#6b7280', fontSize: 11 },
  likeRow: { flexDirection: 'row', alignItems: 'center' },
});

export default TrackCard;
