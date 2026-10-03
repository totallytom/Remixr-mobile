import React, { useState, useRef, useCallback, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {
  UploadCloud, Music2, X, Globe, ArrowRight, ChevronLeft,
  Disc3, Mic2, Image as ImageIcon, ShieldCheck,
} from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { useTranslation } from 'react-i18next';
import { genreLabel } from '../../utils/genres';
import { checkCopyright } from '../../services/copyrightService';
import {
  ACCEPTED_AUDIO_MIME,
  MAX_AUDIO_MB,
  emptyRightsDeclaration,
  fetchUploadCounts,
  formatDuration,
  freePlanLimitError,
  hasUnlimitedUploads,
  getAudioDuration,
  publishRelease,
  validateRights,
  type PickedFile,
  type RightsDeclaration,
} from '../../services/trackUploadService';
import RightsOwnershipStep, { DARK_RIGHTS_PALETTE } from '../../components/upload/RightsOwnershipStep';
import { isMusicianRole } from '../../utils/userRole';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStack';

// ─── Constants ─────────────────────────────────────────────────────────────
const GENRES = [
  'Electronic', 'Pop', 'Rock', 'Hip Hop', 'R&B', 'Jazz', 'Classical',
  'Country', 'Folk', 'Alternative', 'Experimental', 'Reggae', 'Blues',
];

function fileSizeMB(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

type ReleaseType = 'single' | 'album';

interface TrackFile {
  id: string;
  file: PickedFile;
  title: string;
  duration: number;
  order: number;
  isrc: string;
}

type NavProp = NativeStackNavigationProp<OnboardingStackParamList, 'OnboardingUpload'>;

// ─── File row ─────────────────────────────────────────────────────────────────
const FileRow: React.FC<{ track: TrackFile; onRemove: () => void }> = ({ track, onRemove }) => (
  <View className="flex-row items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5">
    <View className="w-8 h-8 rounded-lg bg-primary-500/15 items-center justify-center">
      <Music2 size={14} color="#a78bfa" />
    </View>
    <View className="flex-1 min-w-0">
      <Text className="text-sm text-white" numberOfLines={1}>{track.file.name}</Text>
      <Text className="text-xs text-white/35">
        {track.duration ? formatDuration(track.duration) : '—'} · {fileSizeMB(track.file.size)} MB
      </Text>
    </View>
    <TouchableOpacity onPress={onRemove} className="p-1">
      <X size={14} color="#6b7280" />
    </TouchableOpacity>
  </View>
);

// ─── Main screen ──────────────────────────────────────────────────────────────
const OnboardingUpload: React.FC = () => {
  const { user, isAuthenticated } = useStore();
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();

  useEffect(() => {
    if (isAuthenticated && !user) return;
    if (!isAuthenticated) { navigation.navigate('Onboarding'); return; }
    if (user && !isMusicianRole(user.role)) navigation.navigate('Onboarding');
  }, [isAuthenticated, user, navigation]);

  const [step, setStep] = useState<'details' | 'rights'>('details');

  // ── File state ─────────────────────────────────────────────────────────────
  const [files, setFiles] = useState<TrackFile[]>([]);
  const [dropError, setDropError] = useState('');

  // ── Metadata ───────────────────────────────────────────────────────────────
  const [releaseType, setReleaseType] = useState<ReleaseType>('single');
  const [trackTitle, setTrackTitle] = useState('');
  const [albumTitle, setAlbumTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [cover, setCover] = useState<PickedFile | null>(null);
  const [rights, setRights] = useState<RightsDeclaration>(() =>
    emptyRightsDeclaration(user?.artistName || user?.username || ''),
  );

  // Songwriter prefill: user may still be loading on first render.
  useEffect(() => {
    const name = user?.artistName || user?.username;
    if (!name) return;
    setRights(r => (r.songwriters.length === 1 && !r.songwriters[0] ? { ...r, songwriters: [name] } : r));
  }, [user?.artistName, user?.username]);

  // ── Upload state ───────────────────────────────────────────────────────────
  const [isCheckingDetails, setIsCheckingDetails] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');

  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: uploadProgress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [uploadProgress]);

  const hasFiles = files.length > 0;
  const isAlbumMode = releaseType === 'album';

  useEffect(() => {
    if (files.length > 1) setReleaseType('album');
  }, [files.length]);

  // ── Pick audio files ───────────────────────────────────────────────────────
  const pickAudioFiles = useCallback(async () => {
    setDropError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED_AUDIO_MIME,
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const picked = result.assets;
      const tooBig = picked.filter(a => a.size != null && a.size > MAX_AUDIO_MB * 1024 * 1024);
      if (tooBig.length) { setDropError(t('onboarding.upload.tooBig', { mb: MAX_AUDIO_MB })); return; }

      const newEntries: TrackFile[] = picked.map((a, i) => ({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
        file: { uri: a.uri, name: a.name, size: a.size ?? 0, mimeType: a.mimeType },
        title: a.name.replace(/\.[^.]+$/, ''),
        duration: 0,
        order: files.length + i + 1,
        isrc: '',
      }));

      if (files.length === 0 && newEntries.length === 1) {
        setTrackTitle(newEntries[0].title);
      }

      setFiles(prev => [...prev, ...newEntries]);

      // Load durations in background
      newEntries.forEach(async entry => {
        const dur = await getAudioDuration(entry.file.uri);
        setFiles(prev => prev.map(t => (t.id === entry.id ? { ...t, duration: dur } : t)));
      });
    } catch {
      setDropError(t('onboarding.upload.pickerFailed'));
    }
  }, [files.length]);

  const removeFile = (id: string) => {
    setFiles(prev => {
      const next = prev.filter(t => t.id !== id).map((t, idx) => ({ ...t, order: idx + 1 }));
      if (next.length === 0) { setTrackTitle(''); setAlbumTitle(''); }
      if (next.length <= 1) setReleaseType('single');
      return next;
    });
  };

  // ── Pick cover image ───────────────────────────────────────────────────────
  const pickCoverImage = async () => {
    setDropError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('onboarding.upload.permissionTitle'), t('onboarding.upload.permissionPhotos'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setCover({
      uri: asset.uri,
      name: asset.fileName ?? `cover_${Date.now()}.jpg`,
      size: asset.fileSize ?? 0,
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
  };

  // ── Step 1 → 2 ─────────────────────────────────────────────────────────────
  const canContinue = hasFiles && genre && (isAlbumMode ? albumTitle.trim() : trackTitle.trim());

  // In album mode each file keeps its own title; a single uses the title field.
  const releaseTracks = () =>
    isAlbumMode ? files : [{ ...files[0], title: trackTitle.trim() }];

  const continueToRights = async () => {
    if (!user || !canContinue) return;
    setUploadError('');
    if (isAlbumMode && !cover) {
      setUploadError(t('onboarding.upload.coverRequired'));
      return;
    }
    const artist = user.artistName || user.username;
    setIsCheckingDetails(true);
    try {
      if (!hasUnlimitedUploads(user.subscriptionTier)) {
        const counts = await fetchUploadCounts(user.id).catch(() => null);
        if (!counts) {
          setUploadError(t('onboarding.upload.limitsCheckFailed'));
          return;
        }
        const limitError = freePlanLimitError(counts, releaseTracks().length, isAlbumMode);
        if (limitError) {
          setUploadError(limitError);
          return;
        }
      }
      for (const track of releaseTracks()) {
        const result = await checkCopyright({ title: track.title, artist });
        if (result.blocked) {
          setUploadError(result.reason || t('onboarding.upload.blocked', { title: track.title }));
          return;
        }
      }
    } finally {
      setIsCheckingDetails(false);
    }
    setStep('rights');
  };

  // ── Publish ────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!user || !canContinue) return;
    const tracks = releaseTracks();
    const rightsError = validateRights(rights, tracks);
    if (rightsError) { setUploadError(rightsError); return; }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError('');
    try {
      const { status } = await publishRelease({
        userId: user.id,
        artist: user.artistName || user.username,
        genre,
        cover,
        album: isAlbumMode ? { title: albumTitle.trim() } : null,
        tracks,
        rights,
        onProgress: setUploadProgress,
      });
      if (status === 'pending_review') {
        Alert.alert(t('onboarding.upload.receivedTitle'), t('onboarding.upload.receivedBody'));
      }
      navigation.navigate('OnboardingLive');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('onboarding.upload.failed'));
    } finally {
      setIsUploading(false);
    }
  };

  // ── Loading guard ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['top']}>
      <View className="flex-1 bg-dark-900 items-center justify-center">
        <ActivityIndicator size="large" color="#000000" />
        <Text className="text-black text-sm mt-3">{t('common.loading')}</Text>
      </View>
      </SafeAreaView>
    );
  }

  const errorText = uploadError ? <Text className="text-sm text-red-400">{uploadError}</Text> : null;

  // ── Render: Rights & Ownership step ────────────────────────────────────────
  if (step === 'rights') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['top']}>
      <ScrollView
        className="flex-1 bg-dark-900"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => { setUploadError(''); setStep('details'); }}
          disabled={isUploading}
          className="flex-row items-center gap-1 self-start mt-2 mb-6"
        >
          <ChevronLeft size={18} color="rgba(255,255,255,0.5)" />
          <Text className="text-sm text-white/50">{t('onboarding.upload.backToDetails')}</Text>
        </TouchableOpacity>

        <View className="items-center mb-8">
          <View className="flex-row items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 mb-4">
            <ShieldCheck size={12} color="#c4b5fd" />
            <Text className="text-xs text-violet-300 font-medium">{t('onboarding.upload.rightsStep')}</Text>
          </View>
          <Text className="text-2xl font-bold text-white mb-2">{t('onboarding.upload.rightsTitle')}</Text>
          <Text className="text-sm text-white/40 text-center">{t('onboarding.upload.rightsSubtitle')}</Text>
        </View>

        <View className="rounded-2xl border border-white/10 bg-white/5 p-5 gap-5">
          <RightsOwnershipStep
            value={rights}
            onChange={setRights}
            isrcTracks={releaseTracks().map(t => ({ id: t.id, title: t.title, isrc: t.isrc }))}
            onIsrcChange={(id, isrc) => setFiles(prev => prev.map(t => (t.id === id ? { ...t, isrc } : t)))}
            palette={DARK_RIGHTS_PALETTE}
          />

          {errorText}

          {isUploading && (
            <View className="gap-1.5">
              <View className="flex-row justify-between">
                <Text className="text-xs text-white/40">{t('onboarding.upload.uploading')}</Text>
                <Text className="text-xs text-white/40">{uploadProgress}%</Text>
              </View>
              <View className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                <Animated.View
                  style={{
                    height: '100%',
                    backgroundColor: '#7c3aed',
                    borderRadius: 999,
                    width: progressAnim.interpolate({
                      inputRange: [0, 100],
                      outputRange: ['0%', '100%'],
                    }),
                  }}
                />
              </View>
            </View>
          )}

          <View className="pt-2 gap-3">
            <View className="flex-row items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/15">
              <Globe size={13} color="#34d399" />
              <Text className="text-xs text-emerald-300/80 font-medium">
                {rights.ownershipType && rights.ownershipType !== 'original'
                  ? t('onboarding.upload.publicAfterReview')
                  : t('onboarding.upload.publicNow')}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleUpload}
              disabled={isUploading || rights.samplesStatus === 'uncleared'}
              className={`w-full flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-primary-600 ${
                isUploading || rights.samplesStatus === 'uncleared' ? 'opacity-40' : ''
              }`}
              activeOpacity={0.85}
            >
              {isUploading ? (
                <>
                  <ActivityIndicator size="small" color="#000000" />
                  <Text className="text-white font-semibold">{t('onboarding.upload.uploading')}</Text>
                </>
              ) : (
                <>
                  <Text className="text-white font-semibold">{t('onboarding.upload.publish')}</Text>
                  <ArrowRight size={16} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Render: files + details step ───────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['top']}>
    <ScrollView
      className="flex-1 bg-dark-900"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View className="items-center mb-10 mt-4">
        <View className="flex-row items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 mb-4">
          <Mic2 size={12} color="#c4b5fd" />
          <Text className="text-xs text-violet-300 font-medium">{t('onboarding.upload.step')}</Text>
        </View>
        <Text className="text-2xl font-bold text-white mb-2">{t('onboarding.upload.title')}</Text>
        <Text className="text-sm text-white/40">{t('onboarding.upload.subtitle')}</Text>
      </View>

      {/* File picker / file list */}
      {!hasFiles ? (
        <TouchableOpacity
          onPress={pickAudioFiles}
          className="rounded-2xl border-2 border-dashed border-dark-600 bg-dark-800/30 p-10 items-center gap-4"
          activeOpacity={0.7}
        >
          <View className="w-16 h-16 rounded-2xl bg-dark-700 items-center justify-center">
            <UploadCloud size={28} color="#6b7280" />
          </View>
          <View className="items-center">
            <Text className="font-semibold text-white mb-1">{t('onboarding.upload.selectFiles')}</Text>
            <Text className="text-sm text-white/40">{t('onboarding.upload.formats', { mb: MAX_AUDIO_MB })}</Text>
            <Text className="text-xs text-white/25 mt-2">{t('onboarding.upload.singleVsAlbum')}</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View className="rounded-2xl border-2 border-dark-600 bg-dark-800/50 p-4 gap-2">
          {files.map(t => (
            <FileRow key={t.id} track={t} onRemove={() => removeFile(t.id)} />
          ))}
          <TouchableOpacity
            onPress={pickAudioFiles}
            className="flex-row items-center justify-center gap-2 mt-1 py-2 rounded-lg border border-dashed border-dark-600"
            activeOpacity={0.7}
          >
            <UploadCloud size={14} color="#a78bfa" />
            <Text className="text-sm text-violet-300">{t('onboarding.upload.addMoreFiles')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {dropError ? (
        <Text className="text-sm text-red-400 px-1 mt-2">{dropError}</Text>
      ) : null}

      {/* Metadata — visible once files are picked */}
      {hasFiles && (
        <View className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-6 gap-5">

          {/* Release type */}
          <View>
            <Text className="text-sm font-medium text-white mb-3">{t('onboarding.upload.releaseType')}</Text>
            <View className="flex-row gap-2">
              {(['single', 'album'] as ReleaseType[]).map(type => {
                const disabled = type === 'single' && files.length > 1;
                return (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setReleaseType(type)}
                    disabled={disabled}
                    className={`flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-xl border-2 ${
                      releaseType === type
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-dark-600'
                    } ${disabled ? 'opacity-40' : ''}`}
                    activeOpacity={0.7}
                  >
                    {type === 'single'
                      ? <Music2 size={15} color={releaseType === type ? '#fff' : '#6b7280'} />
                      : <Disc3 size={15} color={releaseType === type ? '#fff' : '#6b7280'} />
                    }
                    <Text className={`text-sm font-medium ${releaseType === type ? 'text-white' : 'text-dark-400'}`}>
                      {type === 'single' ? t('common.single') : t('common.album')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Track / album title */}
          <View>
            <Text className="text-sm font-medium text-white mb-2">
              {isAlbumMode ? t('onboarding.upload.albumTitle') : t('onboarding.upload.trackTitle')}
              <Text className="text-red-400"> *</Text>
            </Text>
            <TextInput
              value={isAlbumMode ? albumTitle : trackTitle}
              onChangeText={isAlbumMode ? setAlbumTitle : setTrackTitle}
              placeholder={isAlbumMode ? t('onboarding.upload.albumName') : t('onboarding.upload.trackName')}
              placeholderTextColor="rgba(255,255,255,0.25)"
              maxLength={100}
              className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white"
            />
          </View>

          {/* Per-track titles for albums */}
          {isAlbumMode && (
            <View>
              <Text className="text-sm font-medium text-white mb-2">{t('onboarding.upload.trackTitles')}</Text>
              <View className="gap-2">
                {files.map(track => (
                  <View key={track.id} className="flex-row items-center gap-2">
                    <Text className="w-5 text-xs text-white/35 text-right">{track.order}</Text>
                    <TextInput
                      value={track.title}
                      onChangeText={v => setFiles(prev => prev.map(f => (f.id === track.id ? { ...f, title: v } : f)))}
                      placeholder={t('onboarding.upload.trackTitle')}
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      maxLength={100}
                      className="flex-1 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm"
                    />
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Genre */}
          <View>
            <Text className="text-sm font-medium text-white mb-2">
              {t('onboarding.upload.genre')} <Text className="text-red-400">*</Text>
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {GENRES.map(g => (
                <TouchableOpacity
                  key={g}
                  onPress={() => setGenre(g)}
                  className={`px-3 py-1.5 rounded-full border ${
                    genre === g
                      ? 'border-primary-500 bg-primary-500/15'
                      : 'border-dark-600'
                  }`}
                  activeOpacity={0.7}
                >
                  <Text className={`text-xs ${genre === g ? 'text-primary-300' : 'text-dark-400'}`}>
                    {genreLabel(g)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Cover art */}
          <View>
            <Text className="text-sm font-medium text-white mb-2">
              {t('onboarding.upload.coverArt')}
              {isAlbumMode
                ? <Text className="text-red-400"> *</Text>
                : <Text className="text-xs font-normal text-white/30"> · {t('common.optional')}</Text>
              }
            </Text>
            {!cover ? (
              <TouchableOpacity
                onPress={pickCoverImage}
                className="w-full flex-row items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-dark-600"
                activeOpacity={0.7}
              >
                <ImageIcon size={16} color="rgba(255,255,255,0.4)" />
                <Text className="text-sm text-white/40">
                  {isAlbumMode ? t('onboarding.upload.addAlbumCover') : t('onboarding.upload.addCoverArt')}
                </Text>
              </TouchableOpacity>
            ) : (
              <View className="flex-row items-center gap-3">
                <Image source={{ uri: cover.uri }} className="w-14 h-14 rounded-lg" resizeMode="cover" />
                <View className="flex-1 min-w-0">
                  <Text className="text-sm text-white" numberOfLines={1}>{cover.name}</Text>
                  <TouchableOpacity onPress={() => setCover(null)} activeOpacity={0.7}>
                    <Text className="text-xs text-red-400 mt-0.5">{t('common.remove')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {errorText}

          <TouchableOpacity
            onPress={continueToRights}
            disabled={isCheckingDetails || !canContinue}
            className={`w-full flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-primary-600 ${
              isCheckingDetails || !canContinue ? 'opacity-40' : ''
            }`}
            activeOpacity={0.85}
          >
            {isCheckingDetails ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <>
                <Text className="text-white font-semibold">{t('common.continue')}</Text>
                <ArrowRight size={16} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Skip */}
      {!hasFiles && (
        <TouchableOpacity
          onPress={() => navigation.navigate('OnboardingLive')}
          className="mt-4 items-center"
          activeOpacity={0.6}
        >
          <Text className="text-xs text-white/20 underline">
            {t('onboarding.upload.skip')}
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
    </SafeAreaView>
  );
};

export default OnboardingUpload;
