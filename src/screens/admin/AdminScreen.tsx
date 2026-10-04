import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text as RNText,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  RefreshControl,
  Linking,
  type TextProps,
} from 'react-native';
import { Image } from 'expo-image';
import { FONTS } from '../../utils/fonts';
import { colors } from '../../theme';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ProfileStackParamList } from '../../navigation/stacks/ProfileStack';
import {
  ArrowLeft,
  Shield,
  CheckCircle,
  Clock,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Flag,
  Play,
  Pause,
  UserCircle2,
  FileText,
} from 'lucide-react-native';
import type { AudioPlayer } from 'expo-audio';
import { createPreviewPlayer, releasePlayer } from '../../services/audio';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../services/supabase';
import { useStore } from '../../store/useStore';
import { getAvatarUrl } from '../../utils/avatar';

const Text = ({ style, ...props }: TextProps) => (
  <RNText style={[{ fontFamily: FONTS.body }, style]} {...props} />
);

// Set by the website's copyright system; 'disabled' = under a DMCA takedown.
type Status = 'published' | 'pending_review' | 'removed' | 'disabled';
type FilterTab = 'all' | 'pending_review' | 'removed';

interface AdminTrack {
  id: string;
  title: string;
  artist?: string;
  cover?: string;
  audio_url?: string | null;
  status: Status;
  removed_reason?: string | null;
  removed_at?: string | null;
  created_at?: string;
  reportCount?: number;
  reportReasons?: string[];
  uploaderId?: string | null;
  uploaderUsername?: string | null;
  uploaderAvatar?: string | null;
  uploaderArtistName?: string | null;
  uploaderRemovedCount?: number;
}

const STATUS_COLOR: Record<Status, string> = {
  published:      '#22c55e',
  disabled:       '#6b7280',
  pending_review: '#f59e0b',
  removed:        '#ef4444',
};

const STATUS_LABEL: Record<Status, string> = {
  published:      'Live',
  disabled:       'Takedown',
  pending_review: 'Pending',
  removed:        'Removed',
};

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',            label: 'All' },
  { key: 'pending_review', label: 'Pending' },
  { key: 'removed',        label: 'Removed' },
];

const DEFAULT_COVER = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop';

const AdminScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { user } = useStore();

  const [tracks, setTracks] = useState<AdminTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<AdminTrack | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Open user/message/concert reports, shown on the Reports button.
  const [openReportCount, setOpenReportCount] = useState(0);

  // ── Audio preview ──────────────────────────────────────────────────────────
  const soundRef = useRef<AudioPlayer | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  useEffect(() => {
    if (user && !user.isAdmin) navigation.goBack();
  }, [user]);

  const loadTracks = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('tracks')
        .select(`
          id, title, artist, cover, audio_url, status, removed_reason, removed_at, created_at, user_id,
          users!tracks_user_id_fkey ( username, avatar, artist_name )
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rawList = (data as any[]) ?? [];
      const trackList: AdminTrack[] = rawList.map(row => {
        const uploader = Array.isArray(row.users) ? row.users[0] : row.users;
        return {
          id: row.id,
          title: row.title,
          artist: row.artist,
          cover: row.cover,
          audio_url: row.audio_url,
          status: row.status,
          removed_reason: row.removed_reason,
          removed_at: row.removed_at,
          created_at: row.created_at,
          uploaderId: row.user_id,
          uploaderUsername: uploader?.username ?? null,
          uploaderAvatar: uploader?.avatar ?? null,
          uploaderArtistName: uploader?.artist_name ?? null,
        };
      });

      // Fetch report summaries for pending tracks
      const pendingIds = trackList.filter(t => t.status === 'pending_review').map(t => t.id);
      const reportMap: Record<string, { count: number; reasons: string[] }> = {};
      if (pendingIds.length > 0) {
        const { data: reports } = await supabase
          .from('track_reports')
          .select('track_id, reason')
          .in('track_id', pendingIds);
        if (reports) {
          for (const r of reports as { track_id: string; reason: string }[]) {
            if (!reportMap[r.track_id]) reportMap[r.track_id] = { count: 0, reasons: [] };
            reportMap[r.track_id].count++;
            if (!reportMap[r.track_id].reasons.includes(r.reason)) {
              reportMap[r.track_id].reasons.push(r.reason);
            }
          }
        }
      }

      // Count prior removed tracks per uploader — surfaces repeat offenders
      const removedCountByUploader: Record<string, number> = {};
      for (const t of trackList) {
        if (t.status === 'removed' && t.uploaderId) {
          removedCountByUploader[t.uploaderId] = (removedCountByUploader[t.uploaderId] ?? 0) + 1;
        }
      }

      setTracks(trackList.map(t => ({
        ...t,
        reportCount:   reportMap[t.id]?.count   ?? 0,
        reportReasons: reportMap[t.id]?.reasons ?? [],
        uploaderRemovedCount: t.uploaderId ? (removedCountByUploader[t.uploaderId] ?? 0) : 0,
      })));
    } catch {
      Alert.alert('Error', 'Failed to load tracks. Make sure you have admin access.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { loadTracks(); }, []);

  const loadReportCount = useCallback(async () => {
    const { count } = await supabase
      .from('user_reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open');
    setOpenReportCount(count ?? 0);
  }, []);

  // Refresh on focus so the count drops after resolving reports and coming back.
  useFocusEffect(useCallback(() => { loadReportCount(); }, [loadReportCount]));

  useEffect(() => {
    return () => {
      releasePlayer(soundRef.current);
    };
  }, []);

  const togglePreview = useCallback(async (track: AdminTrack) => {
    if (!track.audio_url) return;

    // Tapping the playing track — stop it
    if (playingId === track.id) {
      releasePlayer(soundRef.current);
      soundRef.current = null;
      setPlayingId(null);
      setPreviewProgress(0);
      return;
    }

    // Stop whatever was previously playing
    if (soundRef.current) {
      releasePlayer(soundRef.current);
      soundRef.current = null;
    }
    setPlayingId(null);
    setPreviewProgress(0);
    setIsLoadingPreview(true);

    try {
      const sound = createPreviewPlayer(track.audio_url, (status) => {
        if (!status.isLoaded) return;
        if (status.duration > 0) {
          setPreviewProgress(status.currentTime / status.duration);
        }
        if (status.didJustFinish) {
          setPlayingId(null);
          setPreviewProgress(0);
        }
      });
      sound.play();
      soundRef.current = sound;
      setPlayingId(track.id);
    } catch {
      Alert.alert('Playback Error', 'Could not load audio preview.');
    } finally {
      setIsLoadingPreview(false);
    }
  }, [playingId]);

  // tracks.status can only be changed server-side, via admin-review-action.
  const reviewTrack = async (trackId: string, action: 'approve' | 'flag' | 'remove' | 'restore', reason?: string) => {
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-review-action', {
        body: { trackId, action, reason },
      });
      if (error) {
        const payload = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
        throw new Error(payload?.error ?? error.message);
      }
      const status = data.status as Status;
      setTracks(prev => prev.map(t => t.id === trackId
        ? {
            ...t,
            status,
            removed_reason: status === 'removed' ? (reason ?? null) : null,
            removed_at: status === 'removed' ? new Date().toISOString() : null,
          }
        : t));
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to update track status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openRemoveModal = (track: AdminTrack) => {
    setSelectedTrack(track);
    setRemoveReason('');
    setShowRemoveModal(true);
  };

  const confirmRemove = async () => {
    if (!selectedTrack) return;
    await reviewTrack(selectedTrack.id, 'remove', removeReason.trim() || undefined);
    setShowRemoveModal(false);
    setSelectedTrack(null);
  };

  const handleMarkPending = (track: AdminTrack) => {
    Alert.alert(
      'Flag for Review',
      `Mark "${track.title}" as pending review?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Flag', onPress: () => reviewTrack(track.id, 'flag') },
      ],
    );
  };

  const handleApprove = (track: AdminTrack) => {
    Alert.alert(
      'Approve Track',
      `Publish "${track.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Approve', onPress: () => reviewTrack(track.id, 'approve') },
      ],
    );
  };

  const OWNERSHIP_LABEL: Record<string, string> = {
    original: 'Original',
    on_behalf: 'On behalf of an artist / label',
    remix: 'Remix or edit',
  };

  const handleViewRights = async (track: AdminTrack) => {
    const { data: r, error } = await supabase
      .from('track_rights')
      .select('*')
      .eq('track_id', track.id)
      .maybeSingle();
    if (error) {
      Alert.alert('Error', 'Failed to load the rights declaration.');
      return;
    }
    if (!r) {
      Alert.alert('No declaration', 'This track was uploaded before rights declarations were required.');
      return;
    }

    let proofUrl: string | null = null;
    if (r.permission_proof_path) {
      const { data } = await supabase.storage
        .from('rights-proofs')
        .createSignedUrl(r.permission_proof_path, 60 * 10);
      proofUrl = data?.signedUrl ?? null;
    }

    const lines = [
      `Ownership: ${OWNERSHIP_LABEL[r.ownership_type] ?? r.ownership_type}`,
      `Legal name: ${r.legal_name}`,
      `Verification: ${String(r.verification_status).replace('_', ' ')}`,
      `Songwriters: ${(r.songwriters ?? []).join(', ')}`,
      `Samples: ${String(r.samples).replace('_', '-')}${r.sample_source ? ` (${r.sample_source})` : ''}`,
      r.isrc && `ISRC: ${r.isrc}`,
      `Already released: ${r.already_released ? 'yes' : 'no'}`,
      r.distributor && `Distributor: ${r.distributor}`,
      r.release_url && `Release: ${r.release_url}`,
      r.p_line && r.p_line,
      r.c_line && r.c_line,
      r.pro && `PRO: ${r.pro}`,
      r.ipi && `IPI: ${r.ipi}`,
      r.copyright_reg_number && `Copyright reg.: ${r.copyright_reg_number}`,
      `Attested: ${new Date(r.attested_at).toLocaleString()} (${r.attestation_version})`,
      r.permission_proof_path ? 'Permission proof attached' : null,
    ].filter(Boolean);

    Alert.alert(
      'Rights declaration',
      lines.join('\n'),
      proofUrl
        ? [
            { text: 'Close', style: 'cancel' },
            { text: 'Open proof', onPress: () => Linking.openURL(proofUrl!) },
          ]
        : [{ text: 'Close' }],
    );
  };

  const handleViewUploader = (track: AdminTrack) => {
    if (!track.uploaderId) return;
    navigation.navigate('ProfileById', { userId: track.uploaderId });
  };

  const handleRestore = (track: AdminTrack) => {
    Alert.alert(
      'Restore Track',
      `Restore "${track.title}" and make it live again?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', onPress: () => reviewTrack(track.id, 'restore') },
      ],
    );
  };

  const filtered = activeTab === 'all'
    ? tracks
    : tracks.filter(t => t.status === activeTab);

  const counts = {
    all:            tracks.length,
    pending_review: tracks.filter(t => t.status === 'pending_review').length,
    removed:        tracks.filter(t => t.status === 'removed').length,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.dark900 }} edges={['top']}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>

        {/* Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          gap: 12,
        }}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
            <ArrowLeft size={22} color={colors.text} />
          </TouchableOpacity>
          <Shield size={20} color="#ef4444" />
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, flex: 1 }}>
            Track Moderation
          </Text>
          {isSubmitting && <ActivityIndicator size="small" color={colors.text} />}
          <TouchableOpacity
            onPress={() => navigation.navigate('AdminReports')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: '#fef2f2',
              borderWidth: 1,
              borderColor: '#fca5a5',
            }}
          >
            <Flag size={12} color="#ef4444" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#ef4444' }}>Reports</Text>
            {openReportCount > 0 && (
              <View style={{
                minWidth: 18,
                height: 18,
                paddingHorizontal: 5,
                borderRadius: 999,
                backgroundColor: '#ef4444',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{openReportCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Filter tabs */}
        <View style={{
          flexDirection: 'row',
          paddingHorizontal: 16,
          paddingVertical: 12,
          gap: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}>
          {TABS.map(tab => {
            const active = activeTab === tab.key;
            const count = counts[tab.key];
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 999,
                  backgroundColor: active ? colors.text : colors.surface,
                  borderWidth: 1,
                  borderColor: active ? colors.text : colors.border,
                }}
              >
                <Text style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: active ? colors.surface : colors.text,
                }}>
                  {tab.label}
                </Text>
                {count > 0 && (
                  <View style={{
                    backgroundColor: active ? colors.surface : colors.text,
                    borderRadius: 999,
                    minWidth: 18,
                    height: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 4,
                  }}>
                    <Text style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: active ? colors.text : colors.surface,
                    }}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Track list */}
        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={colors.text} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <CheckCircle size={40} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>
              {activeTab === 'all' ? 'No tracks yet' : `No ${STATUS_LABEL[activeTab as Status]?.toLowerCase()} tracks`}
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadTracks(true)}
                tintColor={colors.text}
              />
            }
          >
            {filtered.map(track => (
              <View
                key={track.id}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  overflow: 'hidden',
                }}
              >
                {/* Track info row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 }}>
                  <Image
                    source={{ uri: track.cover || DEFAULT_COVER }}
                    style={{ width: 48, height: 48, borderRadius: 8, flexShrink: 0 }}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 14, fontWeight: '600', color: colors.text }}
                    >
                      {track.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}
                    >
                      {track.artist ?? 'Unknown artist'}
                    </Text>
                  </View>
                  {/* Status badge */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <View style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: STATUS_COLOR[track.status] + '20',
                      borderWidth: 1,
                      borderColor: STATUS_COLOR[track.status] + '60',
                    }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: STATUS_COLOR[track.status] }}>
                        {STATUS_LABEL[track.status]}
                      </Text>
                    </View>
                    {track.status === 'pending_review' && (track.reportCount ?? 0) > 0 && (
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 3,
                        paddingHorizontal: 7,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: '#fef2f2',
                        borderWidth: 1,
                        borderColor: '#fca5a5',
                      }}>
                        <Flag size={10} color="#ef4444" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#ef4444' }}>
                          {track.reportCount}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Uploader info */}
                <TouchableOpacity
                  onPress={() => handleViewUploader(track)}
                  disabled={!track.uploaderId}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    marginHorizontal: 12,
                    marginBottom: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: 8,
                    backgroundColor: colors.background,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  {track.uploaderAvatar ? (
                    <Image
                      source={{ uri: getAvatarUrl(track.uploaderAvatar) }}
                      style={{ width: 22, height: 22, borderRadius: 11 }}
                    />
                  ) : (
                    <UserCircle2 size={22} color={colors.textMuted} />
                  )}
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 12, fontWeight: '600', color: colors.text, flex: 1 }}
                  >
                    {track.uploaderArtistName || track.uploaderUsername || 'Unknown uploader'}
                  </Text>
                  {(track.uploaderRemovedCount ?? 0) > 0 && (
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 3,
                      paddingHorizontal: 7,
                      paddingVertical: 3,
                      borderRadius: 999,
                      backgroundColor: '#fef2f2',
                      borderWidth: 1,
                      borderColor: '#fca5a5',
                    }}>
                      <AlertTriangle size={10} color="#ef4444" />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#ef4444' }}>
                        {track.uploaderRemovedCount === 1
                          ? '1 prior removal'
                          : `${track.uploaderRemovedCount} prior removals`}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Audio preview bar */}
                {track.audio_url && (
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    paddingBottom: 10,
                    gap: 10,
                  }}>
                    <TouchableOpacity
                      onPress={() => togglePreview(track)}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: playingId === track.id ? '#7c3aed' : colors.background,
                        borderWidth: 1,
                        borderColor: playingId === track.id ? '#7c3aed' : colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isLoadingPreview && playingId !== track.id && playingId === null ? (
                        <ActivityIndicator size="small" color={colors.textSecondary} />
                      ) : playingId === track.id ? (
                        <Pause size={13} color="#fff" />
                      ) : (
                        <Play size={13} color={colors.textSecondary} />
                      )}
                    </TouchableOpacity>

                    <View style={{ flex: 1, height: 3, backgroundColor: colors.border, borderRadius: 2 }}>
                      <View style={{
                        width: `${playingId === track.id ? previewProgress * 100 : 0}%`,
                        height: '100%',
                        backgroundColor: '#7c3aed',
                        borderRadius: 2,
                      }} />
                    </View>

                    <Text style={{ fontSize: 10, color: colors.textMuted, width: 42, textAlign: 'right' }}>
                      {playingId === track.id ? 'playing' : 'preview'}
                    </Text>
                  </View>
                )}

                {/* Report reasons (if pending_review) */}
                {track.status === 'pending_review' && track.reportReasons && track.reportReasons.length > 0 && (
                  <View style={{
                    marginHorizontal: 12,
                    marginBottom: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    backgroundColor: '#fffbeb',
                    borderRadius: 8,
                    borderLeftWidth: 3,
                    borderLeftColor: '#f59e0b',
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 6,
                  }}>
                    <Flag size={13} color="#b45309" style={{ marginTop: 1 }} />
                    <Text style={{ fontSize: 12, color: '#92400e', flex: 1 }}>
                      {`Reported for: ${track.reportReasons.join(', ')}`}
                    </Text>
                  </View>
                )}

                {/* Removal reason (if removed) */}
                {track.status === 'removed' && track.removed_reason && (
                  <View style={{
                    marginHorizontal: 12,
                    marginBottom: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    backgroundColor: '#fef2f2',
                    borderRadius: 8,
                    borderLeftWidth: 3,
                    borderLeftColor: '#ef4444',
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 6,
                  }}>
                    <AlertTriangle size={13} color="#ef4444" style={{ marginTop: 1 }} />
                    <Text style={{ fontSize: 12, color: '#991b1b', flex: 1 }}>
                      {track.removed_reason}
                    </Text>
                  </View>
                )}

                {/* Rights declaration */}
                <TouchableOpacity
                  onPress={() => handleViewRights(track)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    marginHorizontal: 12,
                    marginBottom: 10,
                  }}
                >
                  <FileText size={13} color={colors.textSecondary} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
                    View rights declaration
                  </Text>
                </TouchableOpacity>

                {/* Action buttons */}
                <View style={{
                  flexDirection: 'row',
                  paddingHorizontal: 12,
                  paddingBottom: 12,
                  gap: 8,
                }}>
                  {track.status === 'published' && (
                    <>
                      <TouchableOpacity
                        onPress={() => handleMarkPending(track)}
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          paddingVertical: 8,
                          borderRadius: 8,
                          backgroundColor: '#fef3c7',
                          borderWidth: 1,
                          borderColor: '#fcd34d',
                        }}
                      >
                        <Clock size={13} color="#92400e" />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#92400e' }}>Flag</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => openRemoveModal(track)}
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          paddingVertical: 8,
                          borderRadius: 8,
                          backgroundColor: '#fef2f2',
                          borderWidth: 1,
                          borderColor: '#fca5a5',
                        }}
                      >
                        <Trash2 size={13} color="#991b1b" />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#991b1b' }}>Remove</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {track.status === 'pending_review' && (
                    <>
                      <TouchableOpacity
                        onPress={() => handleApprove(track)}
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          paddingVertical: 8,
                          borderRadius: 8,
                          backgroundColor: '#f0fdf4',
                          borderWidth: 1,
                          borderColor: '#86efac',
                        }}
                      >
                        <CheckCircle size={13} color="#15803d" />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#15803d' }}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => openRemoveModal(track)}
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          paddingVertical: 8,
                          borderRadius: 8,
                          backgroundColor: '#fef2f2',
                          borderWidth: 1,
                          borderColor: '#fca5a5',
                        }}
                      >
                        <Trash2 size={13} color="#991b1b" />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#991b1b' }}>Remove</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {track.status === 'removed' && (
                    <TouchableOpacity
                      onPress={() => handleRestore(track)}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: '#f0fdf4',
                        borderWidth: 1,
                        borderColor: '#86efac',
                      }}
                    >
                      <RotateCcw size={13} color="#15803d" />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#15803d' }}>Restore</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Remove confirmation modal */}
      <Modal
        visible={showRemoveModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRemoveModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          padding: 24,
        }}>
          <View style={{
            backgroundColor: colors.surface,
            borderRadius: 16,
            padding: 24,
            gap: 16,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Trash2 size={20} color="#ef4444" />
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>
                Remove Track
              </Text>
            </View>

            {selectedTrack && (
              <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                "{selectedTrack.title}" will be hidden from all users immediately.
              </Text>
            )}

            <View>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 }}>
                REASON (optional)
              </Text>
              <TextInput
                value={removeReason}
                onChangeText={setRemoveReason}
                placeholder="e.g. Copyright claim — DMCA takedown"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={3}
                style={{
                  backgroundColor: colors.background,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 14,
                  color: colors.text,
                  textAlignVertical: 'top',
                  minHeight: 80,
                }}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setShowRemoveModal(false)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: colors.background,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: 14, color: colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmRemove}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: isSubmitting ? '#fca5a5' : '#ef4444',
                  alignItems: 'center',
                }}
              >
                {isSubmitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Remove</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default AdminScreen;
