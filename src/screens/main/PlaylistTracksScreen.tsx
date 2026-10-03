/**
 * Playlist page. Design and behaviour mirror the website's PlaylistTracksPage
 * (sypher repo: src/pages/PlaylistTracksPage.tsx): neo-brutalist cream page,
 * play/pause the whole playlist, shuffle, play-from-here, now-playing row.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text as RNText,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Animated,
  type TextProps,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import {
  Play, Pause, Shuffle, UserPlus, Plus, X, Search, Check, Users, UserMinus,
  Mail, ArrowLeft, Lock, Globe, ImagePlus, Music2, ListMusic, Clock, MoreHorizontal,
} from 'lucide-react-native';
import { FONTS } from '../../utils/fonts';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { MusicService } from '../../services/musicService';
import { ChatService } from '../../services/chatService';
import { supabase } from '../../services/supabase';
import { getAvatarUrl } from '../../utils/avatar';
import { useStore } from '../../store/useStore';
import { B, Raised, BrutalButton, brutalInput } from '../../components/ui/brutal';
import type { PlaylistsStackParamList } from '../../navigation/stacks/PlaylistsStack';
import { appLocale } from '../../utils/dateLocale';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { isDuplicateError } from '../../utils/appError';

const Text = ({ style, ...props }: TextProps) => (
  <RNText style={[{ fontFamily: FONTS.body }, style]} {...props} />
);

type RouteProps = RouteProp<PlaylistsStackParamList, 'PlaylistTracks'>;
type NavProps = NativeStackNavigationProp<PlaylistsStackParamList, 'PlaylistTracks'>;

const FALLBACK_COVER = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop';
const MAX_COVER_MB = 5;

const formatDuration = (seconds: number) => {
  const mins = Math.floor((seconds || 0) / 60);
  const secs = Math.floor((seconds || 0) % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/** "1 hr 12 min" / "23 min" */
const formatTotal = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? i18n.t('playlist.hrMin', { h, m }) : i18n.t('playlist.min', { m });
};

// ─── Shells ───────────────────────────────────────────────────────────────────

const StateCard: React.FC<{ icon: React.ReactNode; title: string; children?: React.ReactNode }> = ({ icon, title, children }) => (
  <SafeAreaView style={s.screen} edges={['top']}>
    <View style={s.stateWrap}>
      <Raised offset={6} style={s.stateCard}>
        <View style={s.stateIcon}>{icon}</View>
        <Text style={s.stateTitle}>{title}</Text>
        {children}
      </Raised>
    </View>
  </SafeAreaView>
);

/** Bottom sheet in the website's style: cream panel, thick border, square close button. */
const Sheet: React.FC<{
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ visible, title, onClose, children, footer }) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={s.sheetBackdrop}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={i18n.t('playlist.close')} />
      <View style={s.sheet}>
        <View style={s.sheetHeader}>
          <Text style={s.sheetTitle} numberOfLines={1}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={s.sheetClose} accessibilityLabel={i18n.t('playlist.close')} hitSlop={6}>
            <X size={16} color={B.black} />
          </TouchableOpacity>
        </View>
        <ScrollView
          style={{ flexGrow: 0 }}
          contentContainerStyle={s.sheetBody}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {footer ? <View style={s.sheetFooter}>{footer}</View> : null}
      </View>
    </KeyboardAvoidingView>
  </Modal>
);

/** Animated "now playing" bars; they settle low and still when paused. */
const NowPlaying: React.FC<{ paused?: boolean }> = ({ paused }) => {
  const bars = useRef([0, 1, 2].map(() => new Animated.Value(0.4))).current;
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (paused) {
      bars.forEach((b) => b.setValue(0.35));
      return;
    }
    if (reduceMotion) {
      bars.forEach((b, i) => b.setValue([0.6, 1, 0.75][i]));
      return;
    }
    const loops = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, { toValue: 1, duration: 360 + i * 110, useNativeDriver: true }),
          Animated.timing(b, { toValue: 0.3, duration: 360 + i * 110, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [paused, reduceMotion]);
  return (
    <View style={s.npBars} accessibilityLabel={paused ? i18n.t('playlist.paused') : i18n.t('playlist.nowPlaying')}>
      {bars.map((b, i) => (
        <Animated.View key={i} style={[s.npBar, { transform: [{ scaleY: b }] }]} />
      ))}
    </View>
  );
};

/** Small teal action that presses in, disabled = flat white (Add / Invite). */
const PillAction: React.FC<{
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}> = ({ label, icon, onPress, disabled, loading }) => (
  <Pressable onPress={onPress} disabled={disabled || loading} accessibilityRole="button" accessibilityLabel={label}>
    {({ pressed }) => (
      <Raised
        offset={2}
        radius={8}
        pressed={pressed || disabled}
        style={[s.pill, disabled ? s.pillDisabled : { backgroundColor: B.teal }]}
      >
        {loading ? <ActivityIndicator size="small" color={B.black} /> : icon}
        <Text style={s.pillText}>{label}</Text>
      </Raised>
    )}
  </Pressable>
);

/** Square icon button for the header's secondary actions; `active` = inverted. */
const IconAction: React.FC<{
  label: string;
  icon: (color: string) => React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  badge?: number;
}> = ({ label, icon, onPress, disabled, active, badge }) => (
  <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}>
    {({ pressed }) => (
      <Raised
        offset={3}
        radius={12}
        pressed={pressed || disabled}
        style={[s.iconAction, active && { backgroundColor: B.black }, disabled && { opacity: 0.4 }]}
      >
        {icon(active ? B.white : B.black)}
        {badge ? (
          <View style={s.iconBadge}>
            <Text style={s.iconBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </Raised>
    )}
  </Pressable>
);

// ─── Screen ───────────────────────────────────────────────────────────────────

const PlaylistTracksPage: React.FC = () => {
  const { t } = useTranslation();
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProps>();
  const { playlistId } = route.params;

  const { playlists, player, playTrack, playQueue, pauseTrack, resumeTrack, addToQueue, user, setPlaylists } = useStore() as any;

  const [isChangingCover, setIsChangingCover] = useState(false);
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [coverUrlInput, setCoverUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showAddTrackModal, setShowAddTrackModal] = useState(false);
  const [availableTracks, setAvailableTracks] = useState<any[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [trackSearch, setTrackSearch] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteSearchQuery, setInviteSearchQuery] = useState('');
  const [inviteSearchResults, setInviteSearchResults] = useState<any[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [invitedIds, setInvitedIds] = useState<string[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [hasAccess, setHasAccess] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);

  const [showCollaboratorsSection, setShowCollaboratorsSection] = useState(false);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [pendingInvitesSent, setPendingInvitesSent] = useState<any[]>([]);
  const [isLoadingCollaborators, setIsLoadingCollaborators] = useState(false);

  const playlist: any = playlists.find((p: any) => p.id === playlistId);
  const isOwner = !!(user && playlist && user.id === playlist.createdBy);

  useEffect(() => {
    const checkAccess = async () => {
      if (!playlistId || !user) { setIsCheckingAccess(false); return; }
      setIsCheckingAccess(true);
      try {
        setHasAccess(await MusicService.hasPlaylistAccess(playlistId, user.id));
      } catch (error) {
        console.error('Failed to check playlist access:', error);
        setHasAccess(false);
      } finally {
        setIsCheckingAccess(false);
      }
    };
    checkAccess();
  }, [playlistId, user?.id]);

  useEffect(() => {
    const loadInvitations = async () => {
      if (!user || !playlistId) return;
      try {
        const invitations = await MusicService.getPlaylistInvitations(user.id, 'pending');
        setPendingInvitations(invitations.filter((inv: any) => inv.playlists?.id === playlistId));
      } catch (error) {
        console.error('Failed to load invitations:', error);
      }
    };
    loadInvitations();
  }, [user?.id, playlistId]);

  const refreshCollaborators = async () => {
    if (!playlistId || !isOwner || !user) return;
    const [collabs, pending] = await Promise.all([
      MusicService.getPlaylistCollaborators(playlistId),
      MusicService.getPlaylistPendingInvitations(playlistId, user.id),
    ]);
    setCollaborators(collabs);
    setPendingInvitesSent(pending);
  };

  useEffect(() => {
    if (!playlistId || !isOwner || !user) return;
    setIsLoadingCollaborators(true);
    refreshCollaborators()
      .catch((error) => console.error('Failed to load collaborators:', error))
      .finally(() => setIsLoadingCollaborators(false));
  }, [playlistId, isOwner, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fetchPlaylist = async () => {
      if (!playlistId) return;
      if (!playlist || playlist.tracks.length === 0) {
        setIsLoading(true);
        try {
          const fetched = await MusicService.getPlaylistById(playlistId);
          if (playlist) setPlaylists(playlists.map((p: any) => (p.id === playlistId ? fetched : p)));
          else setPlaylists([...playlists, fetched]);
        } catch (error) {
          console.error('Failed to fetch playlist:', error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    };
    fetchPlaylist();
  }, [playlistId]);

  const refreshPlaylist = async (id: string) => {
    const updated = await MusicService.getPlaylistById(id);
    setPlaylists(useStore.getState().playlists.map((p: any) => (p.id === id ? updated : p)));
  };

  const openAddTracks = async () => {
    setTrackSearch('');
    setShowAddTrackModal(true);
    setIsLoadingTracks(true);
    try {
      setAvailableTracks(await MusicService.getTracks());
    } catch (error) {
      console.error('Failed to load tracks:', error);
      Alert.alert(t('common.error'), t('playlist.loadTracksFailed'));
    } finally {
      setIsLoadingTracks(false);
    }
  };

  const handleAddTrackToPlaylist = async (track: any) => {
    if (!playlist || !hasAccess) return;
    if (playlist.tracks.find((t: any) => t.id === track.id)) return;
    setAddingId(track.id);
    try {
      await MusicService.addTrackToPlaylist(playlist.id, track.id);
      await refreshPlaylist(playlist.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('playlists.unknownError');
      if (!isDuplicateError(error) && !message.includes('duplicate key') && !message.includes('unique constraint')) {
        Alert.alert(t('common.error'), t('playlist.addFailed', { message }));
      }
    } finally {
      setAddingId(null);
    }
  };

  const handleSearchUsers = async (query: string) => {
    if (!user || !query.trim()) { setInviteSearchResults([]); return; }
    setIsSearchingUsers(true);
    try {
      setInviteSearchResults(await ChatService.searchUsers(query, user.id, 10));
    } catch (error) {
      console.error('Failed to search users:', error);
      setInviteSearchResults([]);
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const handleInviteUser = async (inviteeId: string) => {
    if (!playlist || !user || !playlistId) return;
    try {
      await MusicService.inviteUserToPlaylist(playlistId, user.id, inviteeId);
      setInvitedIds((ids) => [...ids, inviteeId]);
      if (isOwner) await refreshCollaborators();
    } catch (error) {
      Alert.alert(t('common.error'), t('playlist.inviteFailed', { message: error instanceof Error ? error.message : t('playlists.unknownError') }));
    }
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    if (!user) return;
    try {
      await MusicService.acceptPlaylistInvitation(invitationId, user.id);
      setHasAccess(true);
      setPendingInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
      Alert.alert(t('playlist.acceptedTitle'), t('playlist.acceptedBody'));
    } catch (error) {
      Alert.alert(t('common.error'), t('playlist.acceptFailed', { message: error instanceof Error ? error.message : t('playlists.unknownError') }));
    }
  };

  const handleDeclineInvitation = async (invitationId: string) => {
    if (!user) return;
    try {
      await MusicService.declinePlaylistInvitation(invitationId, user.id);
      setPendingInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
    } catch (error) {
      Alert.alert(t('common.error'), t('playlist.declineFailed', { message: error instanceof Error ? error.message : t('playlists.unknownError') }));
    }
  };

  const handleRemoveCollaborator = (invitationId: string, username: string) => {
    Alert.alert(t('playlist.removeCollabTitle', { name: username }), t('playlist.removeCollabBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('playlist.remove'),
        style: 'destructive',
        onPress: async () => {
          if (!user || !isOwner || !playlistId) return;
          try {
            await MusicService.removeCollaborator(invitationId, user.id);
            await refreshCollaborators();
          } catch (error) {
            Alert.alert(t('common.error'), t('playlist.removeCollabFailed', { message: error instanceof Error ? error.message : t('playlists.unknownError') }));
          }
        },
      },
    ]);
  };

  const handleRemoveTrack = async (trackId: string) => {
    if (!playlist || !hasAccess) return;
    setRemovingId(trackId);
    try {
      await MusicService.removeTrackFromPlaylist(playlist.id, trackId);
      await refreshPlaylist(playlist.id);
    } catch (error) {
      Alert.alert(t('common.error'), t('playlist.removeTrackFailed', { message: error instanceof Error ? error.message : t('playlists.unknownError') }));
    } finally {
      setRemovingId(null);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!user || !isOwner || !playlistId) return;
    try {
      await MusicService.cancelInvitation(invitationId, user.id);
      setPendingInvitesSent(await MusicService.getPlaylistPendingInvitations(playlistId, user.id));
    } catch (error) {
      Alert.alert(t('common.error'), t('playlist.cancelInviteFailed', { message: error instanceof Error ? error.message : t('playlists.unknownError') }));
    }
  };

  const handleChangeCover = async (coverUrl: string) => {
    if (!user || !playlist) return;
    setIsChangingCover(true);
    try {
      await MusicService.updatePlaylist(playlist.id, user.id, { cover: coverUrl });
      setPlaylists(useStore.getState().playlists.map((p: any) => (p.id === playlist.id ? { ...p, cover: coverUrl } : p)));
      setShowCoverModal(false);
      setCoverUrlInput('');
    } catch (error) {
      console.error('Failed to update playlist cover:', error);
      Alert.alert(t('common.error'), t('playlist.coverFailed'));
    } finally {
      setIsChangingCover(false);
    }
  };

  const handleUploadCover = async () => {
    if (!user || !playlist) return;
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert(t('playlist.permissionTitle'), t('playlist.permissionBody'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if ((asset.fileSize ?? 0) > MAX_COVER_MB * 1024 * 1024) {
      Alert.alert(t('playlist.tooLargeTitle'), t('playlist.tooLarge', { mb: MAX_COVER_MB }));
      return;
    }
    setIsChangingCover(true);
    try {
      const blob = await (await fetch(asset.uri)).blob();
      const path = `playlist-covers/${user.id}/${playlist.id}-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('music-files')
        .upload(path, blob, { contentType: asset.mimeType ?? 'image/jpeg', upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      const { data } = supabase.storage.from('music-files').getPublicUrl(path);
      await handleChangeCover(data.publicUrl);
    } catch (error) {
      console.error('Failed to upload playlist cover:', error);
      Alert.alert(t('common.error'), t('playlist.uploadFailed'));
      setIsChangingCover(false);
    }
  };

  // ── Derived ──
  const tracks: any[] = playlist?.tracks ?? [];
  const totalSeconds = useMemo(() => tracks.reduce((sum, t) => sum + (Number(t.duration) || 0), 0), [tracks]);
  const currentId: string | undefined = player.currentTrack?.id;
  const playlistIsCurrent = !!currentId && tracks.some((t) => t.id === currentId);
  const filteredAvailable = useMemo(() => {
    const q = trackSearch.trim().toLowerCase();
    return availableTracks.filter((t) => !q || t.title?.toLowerCase().includes(q) || t.artist?.toLowerCase().includes(q));
  }, [availableTracks, trackSearch]);

  // ── States ──
  if ((isLoading || isCheckingAccess) && !playlist) {
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        <View style={s.stateWrap}>
          <ActivityIndicator size="large" color={B.faint} accessibilityLabel={t('playlist.loading')} />
        </View>
      </SafeAreaView>
    );
  }

  if (!playlist) {
    return (
      <StateCard icon={<ListMusic size={26} color={B.black} />} title={t('playlist.notFound')}>
        <Text style={s.stateBody}>{t('playlist.notFoundBody')}</Text>
        <BrutalButton label={t('playlist.back')} full onPress={() => navigation.goBack()} />
      </StateCard>
    );
  }

  // Public playlists are read-only for everyone else (guests included).
  if (!hasAccess && !isOwner && !playlist.isPublic) {
    return (
      <StateCard icon={<Lock size={24} color={B.black} />} title={t('playlist.private')}>
        <Text style={s.stateBody}>
          {pendingInvitations.length > 0
            ? t('playlist.invitedTo', { name: playlist.name })
            : t('playlist.noAccess')}
        </Text>
        {pendingInvitations.length > 0 && (
          <View style={s.stateActions}>
            <View style={{ flex: 1 }}>
              <BrutalButton label={t('playlist.accept')} tone="teal" full icon={<Check size={16} color={B.black} />}
                onPress={() => handleAcceptInvitation(pendingInvitations[0].id)} />
            </View>
            <View style={{ flex: 1 }}>
              <BrutalButton label={t('playlist.decline')} tone="white" full onPress={() => handleDeclineInvitation(pendingInvitations[0].id)} />
            </View>
          </View>
        )}
        <BrutalButton
          label={t('playlist.back')}
          tone={pendingInvitations.length ? 'white' : 'black'}
          full
          onPress={() => navigation.goBack()}
        />
      </StateCard>
    );
  }

  const handlePlayPlaylist = () => {
    if (tracks.length === 0) return;
    if (playlistIsCurrent) {
      if (player.isPlaying) pauseTrack();
      else resumeTrack();
      return;
    }
    playQueue(tracks);
  };

  const handleShuffle = () => {
    if (tracks.length === 0) return;
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playQueue(shuffled);
  };

  const handlePlayTrack = (track: any) => {
    if (track.id === currentId) {
      if (player.isPlaying) pauseTrack();
      else resumeTrack();
      return;
    }
    // Queue the rest of the playlist from this track on.
    const i = tracks.findIndex((t) => t.id === track.id);
    if (i >= 0) playQueue([...tracks.slice(i), ...tracks.slice(0, i)]);
    else playTrack(track);
  };

  const openTrackMenu = (track: any) => {
    const isPlayingNow = track.id === currentId && player.isPlaying;
    Alert.alert(track.title, track.artist, [
      { text: isPlayingNow ? t('playlist.pause') : t('playlist.play'), onPress: () => handlePlayTrack(track) },
      { text: t('playlist.addToQueue'), onPress: () => addToQueue(track) },
      ...(hasAccess
        ? [{ text: t('playlist.removeFromPlaylist'), style: 'destructive' as const, onPress: () => handleRemoveTrack(track.id) }]
        : []),
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  };

  const playlistCover = playlist.cover || tracks[0]?.cover || FALLBACK_COVER;
  const playingAll = playlistIsCurrent && player.isPlaying;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.page}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back} accessibilityRole="button">
          <ArrowLeft size={16} color={B.muted} />
          <Text style={s.backText}>{t('playlist.playlists')}</Text>
        </TouchableOpacity>

        {/* ── Header ── */}
        <View style={s.header}>
          <Raised offset={6} style={s.coverFrame}>
            <Image source={{ uri: playlistCover }} style={s.cover} accessibilityLabel={t('playlist.cover')} />
            {isOwner && (
              <View style={s.coverButtonWrap}>
                <Pressable onPress={() => setShowCoverModal(true)} accessibilityRole="button" accessibilityLabel={t('playlist.changeCover')}>
                  {({ pressed }) => (
                    <Raised offset={2} radius={8} pressed={pressed} style={s.coverButton}>
                      <ImagePlus size={14} color={B.black} />
                      <Text style={s.coverButtonText}>{t('playlist.changeCover')}</Text>
                    </Raised>
                  )}
                </Pressable>
              </View>
            )}
          </Raised>

          <Text style={s.kicker}>{t('playlist.kicker')}</Text>
          <Text style={s.title}>{playlist.name}</Text>
          {playlist.description ? <Text style={s.description} numberOfLines={2}>{playlist.description}</Text> : null}

          <View style={s.meta}>
            <Text style={s.metaStrong}>{t('playlist.tracks', { count: tracks.length })}</Text>
            {totalSeconds > 0 && <Text style={s.metaText}>· {formatTotal(totalSeconds)}</Text>}
            <View style={s.visibility}>
              {playlist.isPublic ? <Globe size={12} color={B.black} /> : <Lock size={12} color={B.black} />}
              <Text style={s.visibilityText}>{playlist.isPublic ? t('playlist.public') : t('playlist.privateBadge')}</Text>
            </View>
            {collaborators.length > 0 && (
              <View style={s.collabMeta}>
                <View style={{ flexDirection: 'row' }}>
                  {collaborators.slice(0, 4).map((c: any, i: number) => (
                    <Image
                      key={c.id}
                      source={{ uri: getAvatarUrl(c.avatar) }}
                      style={[s.collabAvatar, i > 0 && { marginLeft: -8 }]}
                      accessibilityLabel={c.username}
                    />
                  ))}
                </View>
                <Text style={s.metaText}>{t('playlist.collaborators', { count: collaborators.length })}</Text>
              </View>
            )}
          </View>

          {/* Actions: secondary icons on the left, the big play button on the right.
              Adding tracks lives in the track list's footer / empty state. */}
          <View style={s.actions}>
            <View style={s.actionsLeft}>
              <IconAction
                label={t('playlist.shuffle')}
                icon={(c) => <Shuffle size={20} color={c} />}
                disabled={tracks.length < 2}
                onPress={handleShuffle}
              />
              {isOwner && (
                <>
                  <IconAction
                    label={t('playlist.invite')}
                    icon={(c) => <UserPlus size={20} color={c} />}
                    onPress={() => { setInvitedIds([]); setShowInviteModal(true); }}
                  />
                  <IconAction
                    label={pendingInvitesSent.length > 0 ? t('playlist.collaboratorsPending', { count: pendingInvitesSent.length }) : t('playlist.collaboratorsLabel')}
                    icon={(c) => <Users size={20} color={c} />}
                    active={showCollaboratorsSection}
                    badge={pendingInvitesSent.length}
                    onPress={() => setShowCollaboratorsSection((v) => !v)}
                  />
                </>
              )}
            </View>
            <Pressable
              onPress={handlePlayPlaylist}
              disabled={tracks.length === 0}
              accessibilityRole="button"
              accessibilityLabel={playingAll ? t('playlist.pausePlaylist') : t('playlist.playPlaylist')}
            >
              {({ pressed }) => (
                <Raised
                  offset={3}
                  radius={30}
                  pressed={pressed}
                  shadowColor={B.tealDark}
                  style={[s.playButton, tracks.length === 0 && { opacity: 0.4 }]}
                >
                  {playingAll
                    ? <Pause size={26} color={B.white} fill={B.white} />
                    : <Play size={26} color={B.white} fill={B.white} style={{ marginLeft: 3 }} />}
                </Raised>
              )}
            </Pressable>
          </View>
        </View>

        {/* ── Pending invitation ── */}
        {pendingInvitations.length > 0 && !hasAccess && (
          <View style={s.inviteBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Mail size={16} color={B.black} />
              <Text style={s.inviteBannerText}>{t('playlist.invitedBanner')}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <BrutalButton label={t('playlist.accept')} size="sm" icon={<Check size={14} color={B.white} />}
                onPress={() => handleAcceptInvitation(pendingInvitations[0].id)} />
              <BrutalButton label={t('playlist.decline')} size="sm" tone="white" onPress={() => handleDeclineInvitation(pendingInvitations[0].id)} />
            </View>
          </View>
        )}

        {/* ── Collaborators ── */}
        {isOwner && showCollaboratorsSection && (
          <Raised style={[s.card, { marginBottom: 24 }]}>
            <View style={s.cardTitleRow}>
              <Users size={16} color={B.black} />
              <Text style={s.cardTitle}>{t('playlist.collaborators')}</Text>
            </View>
            {isLoadingCollaborators ? (
              <ActivityIndicator color={B.faint} style={{ paddingVertical: 16 }} />
            ) : (
              <View style={{ gap: 20 }}>
                <View>
                  <Text style={s.groupLabel}>{t('playlist.active', { count: collaborators.length })}</Text>
                  {collaborators.length === 0 ? (
                    <Text style={s.mutedText}>
                      {t('playlist.noCollaborators')}{' '}
                      <Text style={s.inlineLink} onPress={() => { setInvitedIds([]); setShowInviteModal(true); }}>
                        {t('playlist.inviteSomeone')}
                      </Text>
                    </Text>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {collaborators.map((c: any) => (
                        <View key={c.id} style={s.personRow}>
                          <Image source={{ uri: getAvatarUrl(c.avatar) }} style={s.personAvatar} />
                          <Text style={s.personName} numberOfLines={1}>{c.username}</Text>
                          <TouchableOpacity
                            onPress={() => handleRemoveCollaborator(c.invitationId, c.username)}
                            style={s.smallOutline}
                            accessibilityLabel={t('playlist.removeName', { name: c.username })}
                          >
                            <UserMinus size={12} color={B.redText} />
                            <Text style={[s.smallOutlineText, { color: B.redText }]}>{t('playlist.remove')}</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View>
                  <Text style={s.groupLabel}>{t('playlist.pending', { count: pendingInvitesSent.length })}</Text>
                  {pendingInvitesSent.length === 0 ? (
                    <Text style={s.mutedText}>{t('playlist.noOpen')}</Text>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {pendingInvitesSent.map((inv: any) => (
                        <View key={inv.invitationId} style={[s.personRow, s.personRowPending]}>
                          <Image source={{ uri: getAvatarUrl(inv.avatar) }} style={s.personAvatar} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={s.personName} numberOfLines={1}>{inv.username}</Text>
                            <Text style={s.personSub}>{t('playlist.invitedOn', { date: new Date(inv.createdAt).toLocaleDateString(appLocale()) })}</Text>
                          </View>
                          <TouchableOpacity onPress={() => handleCancelInvitation(inv.invitationId)} style={s.smallOutline}>
                            <Text style={s.smallOutlineText}>{t('playlist.cancel')}</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}
          </Raised>
        )}

        {/* ── Tracks ── */}
        <View style={s.tracksHeading}>
          <Text style={s.tracksHeadingTitle}>{t('playlist.tracksHeading')}</Text>
        </View>

        {tracks.length === 0 ? (
          <Raised style={[s.card, s.emptyCard]}>
            <View style={s.emptyIcon}>
              <Music2 size={26} color={B.black} />
            </View>
            <Text style={s.emptyTitle}>{t('playlist.empty')}</Text>
            <Text style={[s.mutedText, { textAlign: 'center', marginBottom: 18 }]}>
              {hasAccess ? t('playlist.emptyOwner') : t('playlist.emptyOther')}
            </Text>
            {hasAccess && (
              <BrutalButton label={t('playlist.addTracks')} tone="teal" icon={<Plus size={16} color={B.black} />} onPress={openAddTracks} />
            )}
          </Raised>
        ) : (
          <Raised style={[s.card, s.trackCard]}>
            {/* Column header, like the website's table head */}
            <View style={s.trackHead}>
              <Text style={[s.trackHeadText, s.trackIndex]}>#</Text>
              <Text style={[s.trackHeadText, { flex: 1 }]}>{t('playlist.titleCol')}</Text>
              <Clock size={13} color={B.muted} style={s.trackHeadClock} />
            </View>

            {tracks.map((track: any, index: number) => {
              const isCurrent = track.id === currentId;
              const isPlayingNow = isCurrent && player.isPlaying;
              const subtitle = [track.artist, track.album].filter(Boolean).join(' · ');
              return (
                <Pressable
                  key={track.id}
                  onPress={() => handlePlayTrack(track)}
                  onLongPress={() => openTrackMenu(track)}
                  accessibilityRole="button"
                  accessibilityLabel={isPlayingNow ? t('track.pauseTitle', { title: track.title }) : t('track.playTitle', { title: track.title })}
                  accessibilityHint={t('playlist.longPress')}
                >
                  {/* Styles live on this inner View: NativeWind's Pressable wrapper
                      drops function-form `style`, which collapsed the row layout. */}
                  {({ pressed }) => (
                    <View
                      style={[
                        s.trackRow,
                        index < tracks.length - 1 && s.trackRowDivider,
                        isCurrent && s.trackRowCurrent,
                        pressed && !isCurrent && s.trackRowPressed,
                      ]}
                    >
                      {isCurrent && <View style={s.trackAccent} />}
                      <View style={s.trackIndex}>
                        {isCurrent
                          ? <NowPlaying paused={!player.isPlaying} />
                          : <Text style={s.trackIndexText}>{index + 1}</Text>}
                      </View>
                      <Image source={{ uri: track.cover || FALLBACK_COVER }} style={s.trackCover} />
                      <View style={s.trackText}>
                        <Text style={[s.trackTitle, isCurrent && { color: B.tealText }]} numberOfLines={1}>{track.title}</Text>
                        {subtitle ? <Text style={s.trackArtist} numberOfLines={1}>{subtitle}</Text> : null}
                      </View>
                      <Text style={s.trackDuration}>{formatDuration(track.duration)}</Text>
                      <TouchableOpacity
                        onPress={() => openTrackMenu(track)}
                        disabled={removingId === track.id}
                        hitSlop={8}
                        style={s.trackMore}
                        accessibilityLabel={t('track.moreOptionsFor', { title: track.title })}
                      >
                        {removingId === track.id
                          ? <ActivityIndicator size="small" color={B.faint} />
                          : <MoreHorizontal size={18} color={B.muted} />}
                      </TouchableOpacity>
                    </View>
                  )}
                </Pressable>
              );
            })}

            {hasAccess && (
              <Pressable
                onPress={openAddTracks}
                accessibilityRole="button"
              >
                {({ pressed }) => (
                  <View style={[s.trackFooter, pressed && s.trackRowPressed]}>
                    <View style={s.trackFooterIcon}>
                      <Plus size={14} color={B.black} />
                    </View>
                    <Text style={s.trackFooterText}>{t('playlist.addMore')}</Text>
                  </View>
                )}
              </Pressable>
            )}
          </Raised>
        )}
      </ScrollView>

      {/* ── Add tracks ── */}
      <Sheet
        visible={showAddTrackModal}
        title={t('playlist.addToSheet', { name: playlist.name })}
        onClose={() => setShowAddTrackModal(false)}
        footer={<BrutalButton label={t('playlist.done')} full onPress={() => setShowAddTrackModal(false)} />}
      >
        <View style={s.searchWrap}>
          <Search size={16} color={B.faint} style={s.searchIcon} />
          <TextInput
            value={trackSearch}
            onChangeText={setTrackSearch}
            placeholder={t('playlist.searchTracks')}
            placeholderTextColor={B.faint}
            autoCapitalize="none"
            autoCorrect={false}
            style={[brutalInput, { paddingLeft: 40 }]}
          />
        </View>
        {isLoadingTracks ? (
          <ActivityIndicator color={B.faint} style={{ paddingVertical: 40 }} />
        ) : filteredAvailable.length === 0 ? (
          <Text style={[s.mutedText, { textAlign: 'center', paddingVertical: 40 }]}>
            {trackSearch ? t('playlist.noMatch', { query: trackSearch }) : t('playlist.noTracks')}
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {filteredAvailable.map((track) => {
              const added = tracks.some((t) => t.id === track.id);
              return (
                <View key={track.id} style={s.listRow}>
                  <Image source={{ uri: track.cover || FALLBACK_COVER }} style={s.listCover} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.personName} numberOfLines={1}>{track.title}</Text>
                    <Text style={s.personSub} numberOfLines={1}>{track.artist} · {formatDuration(track.duration)}</Text>
                  </View>
                  <PillAction
                    label={added ? t('playlist.added') : t('playlist.add')}
                    icon={added ? <Check size={13} color={B.black} /> : <Plus size={13} color={B.black} />}
                    disabled={added}
                    loading={addingId === track.id}
                    onPress={() => handleAddTrackToPlaylist(track)}
                  />
                </View>
              );
            })}
          </View>
        )}
      </Sheet>

      {/* ── Cover ── */}
      <Sheet visible={showCoverModal} title={t('playlist.changeCover')} onClose={() => setShowCoverModal(false)}>
        <View style={{ gap: 20 }}>
          <Pressable onPress={handleUploadCover} disabled={isChangingCover} style={s.uploadBox} accessibilityRole="button">
            <View style={s.uploadIcon}>
              {isChangingCover ? <ActivityIndicator size="small" color={B.black} /> : <ImagePlus size={18} color={B.black} />}
            </View>
            <Text style={s.uploadTitle}>{isChangingCover ? t('playlist.uploading') : t('playlist.uploadImage')}</Text>
            <Text style={s.personSub}>{t('playlist.fromPhotos', { mb: MAX_COVER_MB })}</Text>
          </Pressable>

          <View>
            <Text style={s.groupLabel}>{t('playlist.pasteUrl')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextInput
                value={coverUrlInput}
                onChangeText={setCoverUrlInput}
                placeholder="https://example.com/image.jpg"
                placeholderTextColor={B.faint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={[brutalInput, { flex: 1, paddingVertical: 9, fontSize: 14 }]}
              />
              <BrutalButton
                label={t('playlist.apply')}
                size="sm"
                disabled={isChangingCover || !coverUrlInput.trim()}
                onPress={() => coverUrlInput.trim() && handleChangeCover(coverUrlInput.trim())}
              />
            </View>
          </View>

          {tracks.length > 0 && (
            <View>
              <Text style={s.groupLabel}>{t('playlist.useTrackCover')}</Text>
              <View style={s.coverGrid}>
                {tracks.slice(0, 10).map((track: any) => {
                  const selected = playlist.cover === track.cover;
                  return (
                    <Pressable
                      key={track.id}
                      onPress={() => handleChangeCover(track.cover)}
                      disabled={isChangingCover}
                      accessibilityLabel={t('playlist.useCoverOf', { title: track.title })}
                      style={[s.coverOption, selected && s.coverOptionSelected, isChangingCover && { opacity: 0.5 }]}
                    >
                      <Image source={{ uri: track.cover }} style={{ width: '100%', height: '100%' }} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      </Sheet>

      {/* ── Invite ── */}
      <Sheet
        visible={showInviteModal}
        title={t('playlist.inviteTitle')}
        onClose={() => { setShowInviteModal(false); setInviteSearchQuery(''); setInviteSearchResults([]); }}
      >
        <Text style={[s.personSub, { marginBottom: 12 }]}>{t('playlist.inviteBody')}</Text>
        <View style={s.searchWrap}>
          <Search size={16} color={B.faint} style={s.searchIcon} />
          <TextInput
            value={inviteSearchQuery}
            onChangeText={(v) => { setInviteSearchQuery(v); handleSearchUsers(v); }}
            placeholder={t('playlist.searchUsername')}
            placeholderTextColor={B.faint}
            autoCapitalize="none"
            autoCorrect={false}
            style={[brutalInput, { paddingLeft: 40 }]}
          />
        </View>
        {isSearchingUsers ? (
          <ActivityIndicator color={B.faint} style={{ paddingVertical: 32 }} />
        ) : inviteSearchResults.length === 0 ? (
          <Text style={[s.mutedText, { textAlign: 'center', paddingVertical: 32 }]}>
            {inviteSearchQuery ? t('playlist.noUsers') : t('playlist.searchToInvite')}
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {inviteSearchResults.map((u: any) => {
              const isCollaborator = collaborators.some((c: any) => c.id === u.id);
              const isPending = invitedIds.includes(u.id) || pendingInvitesSent.some((p: any) => p.id === u.id || p.userId === u.id);
              return (
                <View key={u.id} style={s.listRow}>
                  <Image source={{ uri: getAvatarUrl(u.avatar) }} style={[s.personAvatar, { width: 36, height: 36, borderRadius: 18 }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.personName} numberOfLines={1}>{u.username}</Text>
                    {u.artistName ? <Text style={s.personSub} numberOfLines={1}>{u.artistName}</Text> : null}
                  </View>
                  <PillAction
                    label={isCollaborator ? t('playlist.collaborator') : isPending ? t('playlist.invited') : t('playlist.inviteShort')}
                    icon={isCollaborator ? undefined : isPending ? <Check size={13} color={B.black} /> : <UserPlus size={13} color={B.black} />}
                    disabled={isCollaborator || isPending}
                    onPress={() => handleInviteUser(u.id)}
                  />
                </View>
              );
            })}
          </View>
        )}
      </Sheet>
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: B.cream },
  page: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 140 },

  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 18 },
  backText: { color: B.muted, fontSize: 14, fontFamily: FONTS.bold },

  header: { alignItems: 'center', marginBottom: 28 },
  coverFrame: {
    width: 192,
    height: 192,
    borderWidth: 2,
    borderColor: B.black,
    overflow: 'hidden',
    backgroundColor: B.white,
  },
  cover: { width: '100%', height: '100%' },
  coverButtonWrap: { position: 'absolute', left: 8, right: 8, bottom: 6, alignItems: 'center' },
  coverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: B.black,
    backgroundColor: B.white,
  },
  coverButtonText: { color: B.black, fontSize: 12, fontFamily: FONTS.bold },

  kicker: { color: B.muted, fontSize: 12, fontFamily: FONTS.bold, letterSpacing: 2, marginTop: 22, marginBottom: 4 },
  title: { color: B.black, fontSize: 34, fontFamily: FONTS.display, lineHeight: 38, textAlign: 'center' },
  description: { color: B.label, fontSize: 14, textAlign: 'center', marginTop: 8 },

  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 10,
    rowGap: 8,
    marginTop: 12,
  },
  metaStrong: { color: B.black, fontSize: 14, fontFamily: FONTS.bold },
  metaText: { color: B.label, fontSize: 14, fontFamily: FONTS.medium },
  visibility: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: B.black,
    backgroundColor: B.white,
  },
  visibilityText: { color: B.black, fontSize: 12, fontFamily: FONTS.bold },
  collabMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  collabAvatar: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: B.black, backgroundColor: B.white },

  actions: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
  },
  actionsLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconAction: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: B.black,
    backgroundColor: B.white,
  },
  iconBadge: {
    position: 'absolute', top: -7, right: -7, minWidth: 20, height: 20, paddingHorizontal: 4,
    borderRadius: 10, borderWidth: 2, borderColor: B.black, backgroundColor: B.teal,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBadgeText: { color: B.black, fontSize: 10, fontFamily: FONTS.bold },
  playButton: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: B.black,
    backgroundColor: B.black,
  },

  inviteBanner: {
    gap: 12,
    padding: 14,
    marginBottom: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: B.black,
    backgroundColor: B.yellowSoft,
  },
  inviteBannerText: { flex: 1, color: B.black, fontSize: 14, fontFamily: FONTS.bold },

  card: {
    backgroundColor: B.white,
    borderWidth: 2,
    borderColor: B.black,
    padding: 18,
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  cardTitle: { color: B.black, fontSize: 16, fontFamily: FONTS.bold },
  groupLabel: { color: B.muted, fontSize: 12, fontFamily: FONTS.bold, letterSpacing: 0.6, marginBottom: 8 },
  mutedText: { color: B.muted, fontSize: 14, lineHeight: 20 },
  inlineLink: { color: B.black, fontFamily: FONTS.bold, textDecorationLine: 'underline' },

  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  personRowPending: { borderStyle: 'dashed', borderColor: 'rgba(0,0,0,0.3)' },
  personAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: B.black, backgroundColor: B.white },
  personName: { flex: 1, color: B.black, fontSize: 14, fontFamily: FONTS.bold },
  personSub: { color: B.muted, fontSize: 12 },
  smallOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: B.black,
    backgroundColor: B.white,
  },
  smallOutlineText: { color: B.black, fontSize: 12, fontFamily: FONTS.bold },

  emptyCard: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyIcon: {
    width: 52, height: 52, borderRadius: 14, borderWidth: 2, borderColor: B.black,
    backgroundColor: B.teal, alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  emptyTitle: { color: B.black, fontSize: 17, fontFamily: FONTS.bold, marginTop: 4 },

  tracksHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  tracksHeadingTitle: { color: B.black, fontSize: 24, fontFamily: FONTS.display },

  trackCard: { padding: 0, overflow: 'hidden' },
  trackHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 14,
    paddingRight: 14,
    paddingVertical: 9,
    borderBottomWidth: 2,
    borderBottomColor: B.black,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  trackHeadText: { color: B.muted, fontSize: 11, fontFamily: FONTS.bold, letterSpacing: 1 },
  // Lines up with the duration column (duration + menu button widths).
  trackHeadClock: { marginRight: 44 },

  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 12,
    backgroundColor: B.white,
  },
  trackRowDivider: { borderBottomWidth: 1, borderBottomColor: B.hairline },
  trackRowCurrent: { backgroundColor: B.tealSoft },
  trackRowPressed: { backgroundColor: 'rgba(0,0,0,0.04)' },
  trackAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: B.tealDark },
  trackIndex: { width: 22, alignItems: 'center', justifyContent: 'center' },
  trackIndexText: { color: 'rgba(0,0,0,0.45)', fontSize: 14, fontFamily: FONTS.semibold, fontVariant: ['tabular-nums'] },
  trackCover: {
    width: 48, height: 48, borderRadius: 10,
    borderWidth: 2, borderColor: B.black, backgroundColor: 'rgba(0,0,0,0.05)',
  },
  trackText: { flex: 1, minWidth: 0, gap: 3 },
  trackTitle: { color: B.black, fontSize: 15, fontFamily: FONTS.bold },
  trackArtist: { color: B.muted, fontSize: 13, fontFamily: FONTS.medium },
  trackDuration: { color: B.muted, fontSize: 13, fontFamily: FONTS.semibold, fontVariant: ['tabular-nums'] },
  trackMore: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  trackFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderTopWidth: 2,
    borderTopColor: B.black,
    backgroundColor: B.white,
  },
  trackFooterIcon: {
    width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: B.black,
    backgroundColor: B.teal, alignItems: 'center', justifyContent: 'center',
  },
  trackFooterText: { color: B.black, fontSize: 14, fontFamily: FONTS.bold },

  npBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 14 },
  npBar: { width: 3, height: 14, borderRadius: 1, backgroundColor: B.tealDark, transformOrigin: 'bottom' },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: B.black,
  },
  pillDisabled: { backgroundColor: B.white, opacity: 0.6 },
  pillText: { color: B.black, fontSize: 12, fontFamily: FONTS.bold },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: B.black,
    backgroundColor: B.white,
  },
  listCover: { width: 40, height: 40, borderRadius: 8, borderWidth: 2, borderColor: B.black },

  searchWrap: { justifyContent: 'center', marginBottom: 12 },
  searchIcon: { position: 'absolute', left: 14, zIndex: 1 },

  uploadBox: {
    alignItems: 'center',
    gap: 8,
    padding: 22,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.4)',
    backgroundColor: B.white,
  },
  uploadIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: B.black,
    backgroundColor: B.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTitle: { color: B.black, fontSize: 14, fontFamily: FONTS.bold },

  coverGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  coverOption: {
    width: '18%',
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.3)',
    overflow: 'hidden',
  },
  coverOptionSelected: { borderColor: B.black, borderWidth: 3 },

  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '85%',
    backgroundColor: B.cream,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: B.black,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sheetTitle: { flex: 1, color: B.black, fontSize: 18, fontFamily: FONTS.bold },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: B.black,
    backgroundColor: B.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBody: { paddingHorizontal: 20, paddingBottom: 24 },
  sheetFooter: { paddingHorizontal: 20, paddingBottom: 34, paddingTop: 4 },

  stateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  stateCard: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    padding: 28,
    gap: 12,
    borderWidth: 2,
    borderColor: B.black,
    backgroundColor: B.white,
  },
  stateIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: B.black,
    backgroundColor: B.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stateTitle: { color: B.black, fontSize: 28, fontFamily: FONTS.display, textAlign: 'center' },
  stateBody: { color: B.muted, fontSize: 14, textAlign: 'center', marginBottom: 10 },
  stateActions: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
});

export default PlaylistTracksPage;
