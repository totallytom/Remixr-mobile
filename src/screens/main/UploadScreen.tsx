/**
 * UploadScreen — React Native
 *
 * Two steps: (1) audio files, cover art and track details, (2) Rights & Ownership.
 * Publishing is handled by trackUploadService.publishRelease().
 */
import React, { useState, useEffect, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { UploadStackParamList } from '../../navigation/stacks/UploadStack';
import {
  Music,
  X,
  Play,
  Pause,
  Save,
  Lock,
  CloudUpload,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ArrowRight,
} from 'lucide-react-native';
import type { AudioPlayer } from 'expo-audio';
import { createPreviewPlayer, releasePlayer } from '../../services/audio';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../../store/useStore';
import { checkCopyright } from '../../services/copyrightService';
import { BoostService } from '../../services/boostService';
import {
  ACCEPTED_AUDIO_MIME,
  FREE_ALBUM_LIMIT,
  FREE_TRACK_LIMIT,
  MAX_AUDIO_MB,
  MAX_TRACKS_PER_UPLOAD as MAX_TRACKS,
  emptyRightsDeclaration,
  fetchUploadCounts,
  freePlanLimitError,
  hasUnlimitedUploads,
  formatDuration,
  getAudioDuration,
  publishRelease,
  validateRights,
  type PickedFile,
  type RightsDeclaration,
  type UploadCounts,
} from '../../services/trackUploadService';
import RightsOwnershipStep from '../../components/upload/RightsOwnershipStep';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { genreLabel } from '../../utils/genres';

const GENRES = [
  'Electronic', 'Pop', 'Rock', 'Hip Hop', 'R&B', 'Jazz', 'Classical',
  'Country', 'Folk', 'Alternative', 'Experimental', 'Reggae', 'Blues',
];

export interface TrackEntry {
  id: string;
  file: PickedFile;
  title: string;
  duration: number;
  order: number;
  isrc: string;
}

function createTrackEntry(file: PickedFile, order: number): TrackEntry {
  const baseName = file.name.replace(/\.[^.]+$/, '') || `Track ${order}`;
  return {
    id: `track-${Date.now()}-${order}-${Math.random().toString(36).slice(2)}`,
    file,
    title: baseName,
    duration: 0,
    order,
    isrc: '',
  };
}

const AppText: React.FC<React.ComponentProps<typeof Text>> = ({ style, ...props }) => (
  <Text
    style={[
      { fontFamily: 'MaruMinyaHangul' },
      ...(Array.isArray(style) ? style : style ? [style] : []),
    ]}
    {...props}
  />
);

// ─── Unified upload content ───────────────────────────────────────────────────

const UnifiedUploadContent: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<UploadStackParamList, 'Upload'>>();
  const { user } = useStore();

  const [step, setStep] = useState<'details' | 'rights'>('details');
  const [tracks, setTracks] = useState<TrackEntry[]>([]);
  const [albumTitle, setAlbumTitle] = useState('');
  const [artist, setArtist] = useState(user?.username || '');
  const [genre, setGenre] = useState('');
  const [coverImage, setCoverImage] = useState<PickedFile | null>(null);
  const [singleTitle, setSingleTitle] = useState('');
  const [singleAlbumName, setSingleAlbumName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isCheckingDetails, setIsCheckingDetails] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dropError, setDropError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sound, setSound] = useState<AudioPlayer | null>(null);
  const [uploadCounts, setUploadCounts] = useState<UploadCounts | null>(null);
  const [challengesOpen, setChallengesOpen] = useState(false);
  const [isExplicit, setIsExplicit] = useState(false);
  const [rights, setRights] = useState<RightsDeclaration>(() =>
    emptyRightsDeclaration(user?.artistName || user?.username || ''),
  );

  const isPro = hasUnlimitedUploads(user?.subscriptionTier);
  const atTrackLimit = !isPro && (uploadCounts?.trackCount ?? 0) >= FREE_TRACK_LIMIT;
  const atAlbumLimit = !isPro && (uploadCounts?.albumCount ?? 0) >= FREE_ALBUM_LIMIT;
  const isSingle = tracks.length === 1;
  const isAlbum = tracks.length > 1;

  useEffect(() => {
    setArtist(user?.username || '');
  }, [user?.username]);

  const refreshUploadCounts = useCallback(async () => {
    if (!user?.id) return null;
    try {
      const counts = await fetchUploadCounts(user.id);
      setUploadCounts(counts);
      return counts;
    } catch {
      return null;
    }
  }, [user?.id]);

  // Refetch on every tab focus so uploads/removals made elsewhere are reflected.
  useFocusEffect(
    useCallback(() => {
      refreshUploadCounts();
    }, [refreshUploadCounts]),
  );

  // Unload preview audio on unmount / when replaced
  useEffect(() => {
    return () => {
      releasePlayer(sound);
    };
  }, [sound]);

  const setTrackTitle = (id: string, title: string) =>
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));

  const setTrackIsrc = (id: string, isrc: string) =>
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, isrc } : t)));

  const stopPreview = () => {
    sound?.pause();
    setSound(null); // the effect above releases it
    setIsPlaying(false);
  };

  const removeTrack = (id: string) => {
    const next = tracks.filter((t) => t.id !== id);
    if (next.length === 0) {
      clearAll();
    } else {
      if (tracks[0]?.id === id) stopPreview();
      setTracks(next.map((t, i) => ({ ...t, order: i + 1 })));
    }
  };

  const clearAll = () => {
    setStep('details');
    setTracks([]);
    setAlbumTitle('');
    setSingleTitle('');
    setSingleAlbumName('');
    setCoverImage(null);
    setDropError(null);
    setUploadProgress(0);
    setIsExplicit(false);
    setChallengesOpen(false);
    setRights(emptyRightsDeclaration(user?.artistName || user?.username || ''));
    stopPreview();
  };

  const moveTrack = (id: string, direction: 'up' | 'down') => {
    setTracks((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((t, i) => ({ ...t, order: i + 1 }));
    });
  };

  const pickAudioFiles = async () => {
    if (atTrackLimit) {
      Alert.alert(t('upload.trackLimitTitle'), t('upload.trackLimitBody', { limit: FREE_TRACK_LIMIT }));
      return;
    }
    setDropError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED_AUDIO_MIME,
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const files: PickedFile[] = result.assets.map((a) => ({
        uri: a.uri,
        name: a.name,
        size: a.size ?? 0,
        mimeType: a.mimeType,
      }));

      if (files.some((f) => f.size > MAX_AUDIO_MB * 1024 * 1024)) {
        setDropError(t('upload.audioTooBig', { mb: MAX_AUDIO_MB }));
        return;
      }
      if (!isPro) {
        const alreadyUploaded = uploadCounts?.trackCount ?? 0;
        const wouldTotal = alreadyUploaded + tracks.length + files.length;
        if (wouldTotal > FREE_TRACK_LIMIT) {
          const remaining = Math.max(0, FREE_TRACK_LIMIT - alreadyUploaded - tracks.length);
          setDropError(
            remaining === 0
              ? t('upload.reachedLimit', { limit: FREE_TRACK_LIMIT })
              : t('upload.canAdd', { count: remaining })
          );
          return;
        }
      }
      if (tracks.length + files.length > MAX_TRACKS) {
        setDropError(t('upload.maxPerUpload', { max: MAX_TRACKS }));
        return;
      }

      const nextOrder = tracks.length + 1;
      const newEntries = files.map((f, i) => createTrackEntry(f, nextOrder + i));
      const combined = [...tracks, ...newEntries];
      setTracks(combined);
      if (combined.length === 1) setSingleTitle(combined[0].title);

      // Resolve durations in background
      newEntries.forEach((entry) => {
        getAudioDuration(entry.file.uri).then((dur) => {
          setTracks((prev) => prev.map((t) => (t.id === entry.id ? { ...t, duration: dur } : t)));
        });
      });
    } catch {
      setDropError(t('upload.pickFailed'));
    }
  };

  const pickCoverImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setCoverImage({
        uri: asset.uri,
        name: asset.fileName ?? `cover-${Date.now()}.jpg`,
        size: asset.fileSize ?? 0,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
    } catch {
      Alert.alert(t('common.error'), t('upload.pickImageFailed'));
    }
  };

  const handlePlayPause = async () => {
    if (!tracks[0]) return;
    try {
      if (sound) {
        if (isPlaying) {
          sound.pause();
          setIsPlaying(false);
        } else {
          sound.play();
          setIsPlaying(true);
        }
      } else {
        const newSound = createPreviewPlayer(tracks[0].file.uri, (status) => {
          if (status.didJustFinish) setIsPlaying(false);
        });
        newSound.play();
        setSound(newSound);
        setIsPlaying(true);
      }
    } catch {
      Alert.alert(t('upload.playbackErrorTitle'), t('upload.playbackError'));
    }
  };

  // Step 1 → 2: check required details, limits and copyright before asking for rights.
  const continueToRights = async () => {
    if (!user || tracks.length === 0) return;
    if (isSingle) {
      if (!singleTitle.trim() || !artist.trim() || !genre) {
        Alert.alert(t('upload.missingFields'), t('upload.missingSingle'));
        return;
      }
    } else {
      if (!albumTitle.trim() || !artist.trim() || !genre) {
        Alert.alert(t('upload.missingFields'), t('upload.missingAlbum'));
        return;
      }
      if (tracks.some((t) => !t.title.trim())) {
        Alert.alert(t('upload.missingFields'), t('upload.missingTrackTitle'));
        return;
      }
      if (!coverImage) {
        Alert.alert(t('upload.missingCoverTitle'), t('upload.missingCover'));
        return;
      }
    }

    setIsCheckingDetails(true);
    try {
      if (!isPro) {
        // Fresh counts, not the ones loaded on focus: another device may have uploaded since.
        const counts = await refreshUploadCounts();
        if (!counts) {
          Alert.alert(t('common.error'), t('upload.limitsCheckFailed'));
          return;
        }
        const limitError = freePlanLimitError(counts, tracks.length, isAlbum);
        if (limitError) {
          Alert.alert(t('upload.limitReachedTitle'), limitError);
          return;
        }
      }
      for (const track of tracks) {
        const result = await checkCopyright({ title: isSingle ? singleTitle : track.title, artist });
        if (result.blocked) {
          Alert.alert(t('upload.copyright'), result.reason || t('upload.blocked', { title: track.title }));
          return;
        }
      }
    } finally {
      setIsCheckingDetails(false);
    }
    stopPreview();
    setStep('rights');
  };

  const submit = async () => {
    if (!user || tracks.length === 0) return;
    const rightsError = validateRights(rights, tracks);
    if (rightsError) {
      Alert.alert(t('rights.heading'), rightsError);
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    try {
      const { trackIds, status } = await publishRelease({
        userId: user.id,
        artist,
        genre,
        cover: coverImage,
        album: isAlbum ? { title: albumTitle.trim() } : null,
        singleAlbumName: isSingle ? singleAlbumName : undefined,
        tracks: isSingle ? [{ ...tracks[0], title: singleTitle }] : tracks,
        rights,
        challengesOpen: isSingle ? challengesOpen : false,
        isExplicit,
        onProgress: setUploadProgress,
      });

      if (isPro && status === 'published') {
        trackIds.forEach((id) => BoostService.boostTrack(id, user.id).catch(() => {}));
      }

      Alert.alert(
        t(isAlbum ? 'upload.albumUploaded' : 'upload.trackUploaded'),
        status === 'published'
          ? t(isAlbum ? 'upload.albumLive' : 'upload.trackLive')
          : t(isAlbum ? 'upload.albumReview' : 'upload.trackReview'),
      );
      clearAll();
      refreshUploadCounts();
    } catch (error) {
      Alert.alert(t('upload.failed'), error instanceof Error ? error.message : t('upload.unknownError'));
    } finally {
      setIsUploading(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (step === 'rights') {
    return (
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-4">
          <TouchableOpacity
            onPress={() => setStep('details')}
            disabled={isUploading}
            className="flex-row items-center gap-1 self-start"
          >
            <ChevronLeft size={18} color={colors.textSecondary} />
            <AppText className="text-sm" style={{ color: colors.textSecondary }}>{t('upload.backToDetails')}</AppText>
          </TouchableOpacity>

          <View
            className="flex-row items-center gap-3 rounded-xl p-3 border"
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            {coverImage ? (
              <Image source={{ uri: coverImage.uri }} className="w-12 h-12 rounded-lg" />
            ) : (
              <View className="w-12 h-12 rounded-lg items-center justify-center" style={{ backgroundColor: colors.primary + '33' }}>
                <Music size={20} color={colors.textSecondary} />
              </View>
            )}
            <View className="flex-1 min-w-0">
              <AppText className="font-medium" numberOfLines={1} style={{ color: colors.text }}>
                {isAlbum ? albumTitle : singleTitle}
              </AppText>
              <AppText className="text-xs" style={{ color: colors.textMuted }}>
                {artist} · {isAlbum ? t('upload.albumMeta', { count: tracks.length }) : t('upload.single')}
              </AppText>
            </View>
          </View>

          <View
            className="rounded-2xl border p-5"
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            <RightsOwnershipStep
              value={rights}
              onChange={setRights}
              isrcTracks={tracks.map((t) => ({ id: t.id, title: isSingle ? singleTitle : t.title, isrc: t.isrc }))}
              onIsrcChange={setTrackIsrc}
            />
          </View>

          {isUploading && <ProgressBar progress={uploadProgress} label={t('upload.uploading')} />}

          <TouchableOpacity
            onPress={submit}
            disabled={isUploading || rights.samplesStatus === 'uncleared'}
            className="flex-row items-center justify-center gap-2 px-6 py-3.5 rounded-xl"
            style={{
              backgroundColor: colors.accent,
              opacity: isUploading || rights.samplesStatus === 'uncleared' ? 0.4 : 1,
            }}
          >
            {isUploading ? <ActivityIndicator size="small" color="#fff" /> : <Save size={18} color="#fff" />}
            <AppText className="font-medium text-black">
              {isUploading ? t('upload.uploading') : isAlbum ? t('upload.uploadAlbum') : t('upload.uploadTrack')}
            </AppText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const continueButton = (
    <TouchableOpacity
      onPress={continueToRights}
      disabled={isCheckingDetails || (isAlbum && atAlbumLimit)}
      className="flex-row items-center justify-center gap-2 px-6 py-3.5 rounded-xl"
      style={{ backgroundColor: colors.accent, opacity: isCheckingDetails || (isAlbum && atAlbumLimit) ? 0.4 : 1 }}
    >
      {isCheckingDetails ? <ActivityIndicator size="small" color="#fff" /> : null}
      <AppText className="font-medium text-black">{t('upload.continueRights')}</AppText>
      {!isCheckingDetails ? <ArrowRight size={18} color="#000" /> : null}
    </TouchableOpacity>
  );

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-6">
        {/* Upload limits bar */}
        {!isPro && uploadCounts && (
          <View
            className="flex-row items-center justify-between rounded-xl px-4 py-3 border"
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            <AppText className="text-xs" style={{ color: colors.textSecondary }}>
              <AppText className={atTrackLimit ? 'text-amber-500 font-medium' : ''} style={atTrackLimit ? {} : { color: colors.text }}>
                {t('upload.tracksCount', { count: uploadCounts.trackCount, limit: FREE_TRACK_LIMIT })}
              </AppText>
              {'  ·  '}
              <AppText className={atAlbumLimit ? 'text-amber-500 font-medium' : ''} style={atAlbumLimit ? {} : { color: colors.text }}>
                {t('upload.albumsCount', { count: uploadCounts.albumCount, limit: FREE_ALBUM_LIMIT })}
              </AppText>
            </AppText>
            <TouchableOpacity onPress={() => (navigation.getParent() as any)?.navigate('ProfileTab')}>
              <AppText className="text-xs font-medium" style={{ color: colors.primary }}>{t('upload.goArtist')}</AppText>
            </TouchableOpacity>
          </View>
        )}

        {/* File picker area */}
        {atTrackLimit ? (
          <View className="rounded-2xl border-2 border-amber-600/40 bg-amber-950/30 p-8 items-center">
            <Lock size={36} color="#f59e0b" />
            <AppText className="font-semibold mt-3 mb-1" style={{ color: colors.text }}>{t('upload.trackLimitTitle')}</AppText>
            <AppText className="text-sm text-center mb-4" style={{ color: colors.textSecondary }}>
              {t('upload.trackLimitBody', { limit: FREE_TRACK_LIMIT })}
            </AppText>
            <TouchableOpacity
              onPress={() => (navigation.getParent() as any)?.navigate('ProfileTab')}
              className="px-5 py-2.5 rounded-xl"
              style={{ backgroundColor: colors.accent }}
            >
              <AppText className="text-black text-sm font-medium">{t('upload.upgrade')}</AppText>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={pickAudioFiles}
            className="rounded-2xl border-2 border-dashed p-8 items-center"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <CloudUpload size={40} color={colors.textMuted} />
            <AppText className="font-medium mt-3 mb-1" style={{ color: colors.text }}>{t('upload.selectFiles')}</AppText>
            <AppText className="text-sm text-center" style={{ color: colors.textMuted }}>
              {t('upload.formats', { mb: MAX_AUDIO_MB })}
              {!isPro && uploadCounts
                ? t('upload.remaining', { count: FREE_TRACK_LIMIT - uploadCounts.trackCount })
                : t('upload.upTo', { max: MAX_TRACKS })}
            </AppText>
            <AppText className="text-xs mt-2" style={{ color: colors.textMuted }}>
              {t('upload.singleVsAlbum')}
            </AppText>
          </TouchableOpacity>
        )}

        {dropError && (
          <AppText className="text-red-500 text-sm px-1">{dropError}</AppText>
        )}

        {/* Track list summary */}
        {tracks.length > 0 && (
          <View className="flex-row items-center justify-between">
            <AppText className="text-sm" style={{ color: colors.textSecondary }}>
              {t('upload.filesSelected', { count: tracks.length })}
            </AppText>
            <TouchableOpacity onPress={clearAll}>
              <AppText className="text-sm font-medium" style={{ color: colors.primary }}>{t('upload.clearAll')}</AppText>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Single track form ── */}
        {isSingle && (
          <View
            className="rounded-2xl border p-5 gap-4"
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            <AppText
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: colors.textMuted }}
            >
              {t('upload.singleTrack')}
            </AppText>

            {/* File row */}
            <View
              className="flex-row items-center gap-3 rounded-xl p-3"
              style={{ backgroundColor: colors.surfaceElevated }}
            >
              <View
                className="w-10 h-10 rounded-lg items-center justify-center"
                style={{ backgroundColor: colors.primary + '33' }}
              >
                <Music size={20} color={colors.textSecondary} />
              </View>
              <View className="flex-1 min-w-0">
                <AppText className="font-medium" numberOfLines={1} style={{ color: colors.text }}>
                  {tracks[0].file.name}
                </AppText>
                <AppText className="text-xs" style={{ color: colors.textMuted }}>
                  {formatDuration(tracks[0].duration)}
                </AppText>
              </View>
              <TouchableOpacity
                onPress={handlePlayPause}
                className="p-2 rounded-lg"
                style={{ backgroundColor: colors.accent }}
              >
                {isPlaying ? <Pause size={18} color="#fff" /> : <Play size={18} color="#fff" />}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeTrack(tracks[0].id)} className="p-2 rounded-lg">
                <X size={18} color="#ef4444" />
              </TouchableOpacity>
            </View>

            <View className="gap-1">
              <AppText className="text-sm font-medium" style={{ color: colors.text }}>{t('upload.titleReq')}</AppText>
              <TextInput
                value={singleTitle}
                onChangeText={(v) => {
                  setSingleTitle(v);
                  setTrackTitle(tracks[0].id, v);
                }}
                placeholder={t('upload.trackTitle')}
                placeholderTextColor={colors.textMuted}
                className="px-4 py-3 rounded-xl border"
                style={{ backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.text }}
              />
            </View>

            <View className="gap-1">
              <AppText className="text-sm font-medium" style={{ color: colors.text }}>{t('upload.artistReq')}</AppText>
              <TextInput
                value={artist}
                onChangeText={setArtist}
                placeholder={t('upload.artistName')}
                placeholderTextColor={colors.textMuted}
                className="px-4 py-3 rounded-xl border"
                style={{ backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.text }}
              />
            </View>

            <View className="gap-1">
              <AppText className="text-sm font-medium" style={{ color: colors.text }}>{t('upload.album')}</AppText>
              <TextInput
                value={singleAlbumName}
                onChangeText={setSingleAlbumName}
                placeholder={t('upload.albumOptional')}
                placeholderTextColor={colors.textMuted}
                className="px-4 py-3 rounded-xl border"
                style={{ backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.text }}
              />
            </View>

            <GenreSelector value={genre} onChange={setGenre} />

            <ToggleRow
              label={t('upload.allowChallenges')}
              hint={t('upload.allowChallengesHint')}
              value={challengesOpen}
              onChange={setChallengesOpen}
            />

            <ToggleRow
              label={t('upload.explicit')}
              hint={t('upload.explicitHint')}
              value={isExplicit}
              onChange={setIsExplicit}
            />

            <CoverPicker coverImage={coverImage} onPick={pickCoverImage} onClear={() => setCoverImage(null)} />

            {continueButton}
          </View>
        )}

        {/* ── Album form ── */}
        {isAlbum && (
          <View
            className="rounded-2xl border p-5 gap-4"
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            <AppText
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: colors.textMuted }}
            >
              {t('upload.albumHeading')}
            </AppText>

            <View className="gap-1">
              <AppText className="text-sm font-medium" style={{ color: colors.text }}>{t('upload.albumTitleReq')}</AppText>
              <TextInput
                value={albumTitle}
                onChangeText={setAlbumTitle}
                placeholder={t('upload.albumTitle')}
                placeholderTextColor={colors.textMuted}
                className="px-4 py-3 rounded-xl border"
                style={{ backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.text }}
              />
            </View>

            <View className="gap-1">
              <AppText className="text-sm font-medium" style={{ color: colors.text }}>{t('upload.artistReq')}</AppText>
              <TextInput
                value={artist}
                onChangeText={setArtist}
                placeholder={t('upload.artistName')}
                placeholderTextColor={colors.textMuted}
                className="px-4 py-3 rounded-xl border"
                style={{ backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.text }}
              />
            </View>

            <GenreSelector value={genre} onChange={setGenre} />

            <ToggleRow
              label={t('upload.explicit')}
              hint={t('upload.explicitHint')}
              value={isExplicit}
              onChange={setIsExplicit}
            />

            <CoverPicker coverImage={coverImage} required onPick={pickCoverImage} onClear={() => setCoverImage(null)} />

            {/* Track list */}
            <View className="gap-1">
              <AppText className="text-sm font-medium mb-1" style={{ color: colors.text }}>{t('upload.tracks')}</AppText>
              <View className="gap-2">
                {tracks.map((track, idx) => (
                  <View
                    key={track.id}
                    className="flex-row items-center gap-2 rounded-xl p-3 border"
                    style={{ backgroundColor: colors.surfaceElevated, borderColor: colors.border }}
                  >
                    <AppText className="w-5 text-sm text-right" style={{ color: colors.textMuted }}>{track.order}</AppText>
                    <TextInput
                      value={track.title}
                      onChangeText={(v) => setTrackTitle(track.id, v)}
                      placeholder={t('upload.trackTitle')}
                      placeholderTextColor={colors.textMuted}
                      className="flex-1 px-3 py-2 rounded-lg text-sm"
                      style={{ backgroundColor: colors.surface, color: colors.text }}
                    />
                    <AppText className="text-xs w-10 text-right" style={{ color: colors.textMuted }}>
                      {formatDuration(track.duration)}
                    </AppText>
                    <View className="flex-row gap-1">
                      <TouchableOpacity
                        onPress={() => moveTrack(track.id, 'up')}
                        disabled={idx === 0}
                        className="p-1.5 rounded"
                      >
                        <ChevronUp size={16} color={idx === 0 ? colors.border : colors.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => moveTrack(track.id, 'down')}
                        disabled={idx === tracks.length - 1}
                        className="p-1.5 rounded"
                      >
                        <ChevronDown
                          size={16}
                          color={idx === tracks.length - 1 ? colors.border : colors.textSecondary}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeTrack(track.id)} className="p-1.5 rounded">
                        <X size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                onPress={pickAudioFiles}
                className="mt-2 py-2.5 rounded-xl border border-dashed items-center"
                style={{ borderColor: colors.border }}
              >
                <AppText className="text-sm" style={{ color: colors.textSecondary }}>{t('upload.addMore')}</AppText>
              </TouchableOpacity>
            </View>

            {atAlbumLimit && (
              <View className="rounded-xl border border-amber-600/40 bg-amber-950/30 p-4 items-center">
                <AppText className="text-black text-sm font-medium mb-1">{t('upload.albumLimitTitle')}</AppText>
                <AppText className="text-amber-200 text-xs mb-2">
                  {t('upload.albumLimitBody', { limit: FREE_ALBUM_LIMIT })}
                </AppText>
                <TouchableOpacity onPress={() => (navigation.getParent() as any)?.navigate('ProfileTab')}>
                  <AppText className="text-amber-400 text-sm font-medium">{t('upload.upgradeArrow')}</AppText>
                </TouchableOpacity>
              </View>
            )}

            {continueButton}
          </View>
        )}

        {/* Empty state */}
        {tracks.length === 0 && (
          <View className="items-center py-12 px-6">
            <Music size={48} color={colors.textBlack} />
            <AppText className="font-medium mt-4 mb-2" style={{ color: colors.textBlack }}>{t('upload.noFiles')}</AppText>
            <AppText className="text-sm text-center" style={{ color: colors.textBlack }}>
              {t('upload.noFilesBody')}
            </AppText>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

// ─── Helper sub-components ───────────────────────────────────────────────────

const ToggleRow: React.FC<{ label: string; hint: string; value: boolean; onChange: (v: boolean) => void }> = ({
  label,
  hint,
  value,
  onChange,
}) => (
  <View className="flex-row items-center justify-between py-1">
    <View className="flex-1 mr-4">
      <AppText className="text-sm font-medium" style={{ color: colors.text }}>{label}</AppText>
      <AppText className="text-xs mt-0.5" style={{ color: colors.textMuted }}>{hint}</AppText>
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: colors.border, true: colors.primary }}
      thumbColor="#fff"
    />
  </View>
);

const GenreSelector: React.FC<{ value: string; onChange: (g: string) => void }> = ({
  value,
  onChange,
}) => (
  <View className="gap-2">
    <AppText className="text-sm font-medium" style={{ color: colors.text }}>{i18n.t('upload.genreReq')}</AppText>
    <View className="flex-row flex-wrap gap-2">
      {GENRES.map((g) => {
        const selected = value === g;
        return (
          <TouchableOpacity
            key={g}
            onPress={() => onChange(g === value ? '' : g)}
            className="px-3 py-1.5 rounded-full border"
            style={{
              backgroundColor: selected ? colors.primary + '33' : colors.surfaceElevated,
              borderColor: selected ? colors.primary : colors.border,
            }}
          >
            <AppText
              className="text-xs font-medium"
              style={{ color: selected ? colors.text : colors.textSecondary }}
            >
              {genreLabel(g)}
            </AppText>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);

const CoverPicker: React.FC<{
  coverImage: PickedFile | null;
  required?: boolean;
  onPick: () => void;
  onClear: () => void;
}> = ({ coverImage, required, onPick, onClear }) => (
  <View className="gap-1">
    <AppText className="text-sm font-medium" style={{ color: colors.text }}>{i18n.t('upload.cover')}{required ? ' *' : ''}</AppText>
    {!coverImage ? (
      <TouchableOpacity
        onPress={onPick}
        className="rounded-xl border-2 border-dashed py-4 items-center"
        style={{ borderColor: colors.border }}
      >
        <AppText className="text-sm" style={{ color: colors.textMuted }}>{i18n.t('upload.tapCover')}</AppText>
      </TouchableOpacity>
    ) : (
      <View className="flex-row items-center gap-3">
        <Image source={{ uri: coverImage.uri }} className="w-14 h-14 rounded-lg" />
        <AppText className="flex-1 text-sm" numberOfLines={1} style={{ color: colors.textSecondary }}>
          {coverImage.name}
        </AppText>
        <TouchableOpacity onPress={onClear}>
          <AppText className="text-red-500 text-sm">{i18n.t('upload.remove')}</AppText>
        </TouchableOpacity>
      </View>
    )}
  </View>
);

const ProgressBar: React.FC<{ progress: number; label: string }> = ({ progress, label }) => (
  <View className="gap-1.5">
    <View className="flex-row justify-between">
      <AppText className="text-sm" style={{ color: colors.textSecondary }}>{label}</AppText>
      <AppText className="text-sm" style={{ color: colors.textSecondary }}>{Math.round(progress)}%</AppText>
    </View>
    <View className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: colors.border }}>
      <View
        className="h-full rounded-full"
        style={{ width: `${progress}%`, backgroundColor: colors.primary }}
      />
    </View>
  </View>
);

// ─── Root component ───────────────────────────────────────────────────────────

const Upload: React.FC = () => {
  // Signed-in users can upload straight away; there's no email-confirmation gate.
  const { isAuthenticated } = useStore();

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <View className="flex-1 items-center justify-center px-6 gap-6">
          <View className="rounded-2xl p-6" style={{ backgroundColor: colors.surfaceElevated }}>
            <Lock size={48} color={colors.primary} />
          </View>
          <AppText className="text-xl font-semibold" style={{ color: colors.text }}>{i18n.t('upload.authTitle')}</AppText>
          <AppText className="text-center max-w-xs" style={{ color: colors.textSecondary }}>
            {i18n.t('upload.authBody')}
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <View
          className="px-4 pt-4 pb-2 border-b"
          style={{ borderColor: colors.border }}
        >
          <AppText className="text-2xl font-bold" style={{ color: colors.text }}>{i18n.t('upload.title')}</AppText>
        </View>
        <UnifiedUploadContent />
      </View>
    </SafeAreaView>
  );
};

export default Upload;
