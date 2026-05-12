import React, { useState, useRef, useCallback, useEffect } from 'react';
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
import { Audio } from 'expo-av';
import {
  UploadCloud, Music2, X, Globe, ArrowRight,
  Disc3, Mic2, Loader2, Image as ImageIcon,
} from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { supabase } from '../../services/supabase';
import { checkCopyright } from '../../services/copyrightService';
import { isMusicianRole } from '../../utils/userRole';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStack';

// ─── Constants ─────────────────────────────────────────────────────────────
const GENRES = [
  'Electronic', 'Pop', 'Rock', 'Hip Hop', 'R&B', 'Jazz', 'Classical',
  'Country', 'Folk', 'Alternative', 'Experimental', 'Reggae', 'Blues',
];
const MAX_MB = 50;

const AUDIO_MIME_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
  'audio/aiff', 'audio/x-aiff', 'audio/mp4', 'audio/m4a',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function audioContentType(name: string, mimeType?: string): string {
  if (mimeType && mimeType.startsWith('audio/')) return mimeType;
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'm4a') return 'audio/mp4';
  if (ext === 'aiff' || ext === 'aif') return 'audio/aiff';
  return 'audio/mpeg';
}

function imageContentType(name: string, mimeType?: string): string {
  if (mimeType?.startsWith('image/')) return mimeType;
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

async function getAudioDuration(uri: string): Promise<number> {
  try {
    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false });
    const status = await sound.getStatusAsync();
    await sound.unloadAsync();
    if (status.isLoaded && status.durationMillis) {
      return Math.floor(status.durationMillis / 1000);
    }
    return 0;
  } catch {
    return 0;
  }
}

function fmtDuration(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function fileSizeMB(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

type ReleaseType = 'single' | 'album';

interface TrackFile {
  uri: string;
  name: string;
  size: number;
  mimeType?: string;
  title: string;
  duration: number;
  order: number;
}

type NavProp = NativeStackNavigationProp<OnboardingStackParamList, 'OnboardingUpload'>;

// ─── File row ─────────────────────────────────────────────────────────────────
const FileRow: React.FC<{ track: TrackFile; onRemove: () => void }> = ({ track, onRemove }) => (
  <View className="flex-row items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5">
    <View className="w-8 h-8 rounded-lg bg-primary-500/15 items-center justify-center">
      <Music2 size={14} color="#a78bfa" />
    </View>
    <View className="flex-1 min-w-0">
      <Text className="text-sm text-white" numberOfLines={1}>{track.name}</Text>
      <Text className="text-xs text-white/35">
        {track.duration ? fmtDuration(track.duration) : '—'} · {fileSizeMB(track.size)} MB
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
  const navigation = useNavigation<NavProp>();

  useEffect(() => {
    if (isAuthenticated && !user) return;
    if (!isAuthenticated) { navigation.navigate('Onboarding'); return; }
    if (user && !isMusicianRole(user.role)) navigation.navigate('Onboarding');
  }, [isAuthenticated, user, navigation]);

  // ── File state ─────────────────────────────────────────────────────────────
  const [files, setFiles] = useState<TrackFile[]>([]);
  const [dropError, setDropError] = useState('');

  // ── Metadata ───────────────────────────────────────────────────────────────
  const [releaseType, setReleaseType] = useState<ReleaseType>('single');
  const [trackTitle, setTrackTitle] = useState('');
  const [albumTitle, setAlbumTitle] = useState('');
  const [genre, setGenre] = useState('');
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [coverName, setCoverName] = useState<string | null>(null);
  const [coverMime, setCoverMime] = useState<string | null>(null);

  // ── Upload state ───────────────────────────────────────────────────────────
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
        type: AUDIO_MIME_TYPES,
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const picked = result.assets;
      const tooBig = picked.filter(a => a.size != null && a.size > MAX_MB * 1024 * 1024);
      if (tooBig.length) { setDropError(`Files must be under ${MAX_MB} MB each.`); return; }

      const newEntries: TrackFile[] = picked.map((a, i) => ({
        uri: a.uri,
        name: a.name,
        size: a.size ?? 0,
        mimeType: a.mimeType,
        title: a.name.replace(/\.[^.]+$/, ''),
        duration: 0,
        order: files.length + i + 1,
      }));

      if (files.length === 0 && newEntries.length === 1) {
        setTrackTitle(newEntries[0].title);
      }

      setFiles(prev => [...prev, ...newEntries]);

      // Load durations in background
      newEntries.forEach(async entry => {
        const dur = await getAudioDuration(entry.uri);
        setFiles(prev => prev.map(t => t.uri === entry.uri ? { ...t, duration: dur } : t));
      });
    } catch (err) {
      setDropError('Could not open file picker.');
    }
  }, [files.length]);

  const removeFile = (i: number) => {
    setFiles(prev => {
      const next = prev.filter((_, idx) => idx !== i).map((t, idx) => ({ ...t, order: idx + 1 }));
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
      Alert.alert('Permission required', 'Please allow access to your photo library.');
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
    setCoverUri(asset.uri);
    setCoverName(asset.fileName ?? `cover_${Date.now()}.jpg`);
    setCoverMime(asset.mimeType ?? 'image/jpeg');
  };

  // ── Upload ─────────────────────────────────────────────────────────────────
  const canSubmit = hasFiles && trackTitle.trim() && genre && (!isAlbumMode || albumTitle.trim());

  const uploadBlob = async (uri: string, storagePath: string, contentType: string) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const { data, error } = await supabase.storage
      .from('music-files')
      .upload(storagePath, blob, { contentType, upsert: false });
    if (error || !data?.path) throw new Error(error?.message || 'Upload failed');
    return supabase.storage.from('music-files').getPublicUrl(data.path).data.publicUrl;
  };

  const handleUpload = async () => {
    if (!user || !canSubmit) return;
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError('');

    const tick = setInterval(
      () => setUploadProgress(p => (p >= 85 ? 85 : p + 8)),
      300,
    );

    try {
      if (releaseType === 'single') {
        const track = files[0];

        try {
          const r = await checkCopyright(
            { name: track.name, size: track.size } as File,
            { title: trackTitle, artist: user.artistName || user.username },
          );
          if (r.blocked) {
            Alert.alert('Copyright', r.reason || 'Blocked by copyright policy.');
            return;
          }
        } catch { /* proceed if check unavailable */ }

        const sanitized = track.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const audioPath = `audio-files/${user.id}/${Date.now()}-${sanitized}`;
        const audioUrl = await uploadBlob(track.uri, audioPath, audioContentType(track.name, track.mimeType));

        let coverUrl = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop';
        if (coverUri && coverName) {
          const coverSanitized = coverName.replace(/[^a-zA-Z0-9.-]/g, '_');
          const coverPath = `playlist-covers/${user.id}/${Date.now()}-${coverSanitized}`;
          coverUrl = await uploadBlob(coverUri, coverPath, imageContentType(coverName, coverMime ?? undefined));
        }

        const { error: trackErr } = await supabase.from('tracks').insert({
          title: trackTitle.trim(),
          artist: user.artistName || user.username,
          duration: track.duration,
          cover: coverUrl,
          audio_url: audioUrl,
          genre,
          user_id: user.id,
          preview_start_sec: 0,
          preview_duration_sec: 20,
        });
        if (trackErr) throw new Error(trackErr.message);

      } else {
        if (!coverUri || !coverName) {
          setUploadError('A cover image is required for albums.');
          clearInterval(tick);
          setIsUploading(false);
          return;
        }

        const coverSanitized = coverName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const coverPath = `playlist-covers/${user.id}/${Date.now()}-${coverSanitized}`;
        const coverUrl = await uploadBlob(coverUri, coverPath, imageContentType(coverName, coverMime ?? undefined));

        const uploadedTracks: { title: string; duration: number; audio_url: string; order: number }[] = [];
        for (let i = 0; i < files.length; i++) {
          const t = files[i];
          const san = t.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const p = `audio-files/${user.id}/${Date.now()}-${i}-${san}`;
          const audioUrl = await uploadBlob(t.uri, p, audioContentType(t.name, t.mimeType));
          uploadedTracks.push({ title: t.title, duration: t.duration, audio_url: audioUrl, order: t.order });
          setUploadProgress(20 + ((i + 1) / files.length) * 55);
        }

        const { data: albumData, error: albumErr } = await supabase
          .from('albums')
          .insert({
            title: albumTitle.trim(),
            artist: user.artistName || user.username,
            cover: coverUrl,
            genre,
            user_id: user.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (albumErr) throw new Error(albumErr.message);

        const { error: tracksErr } = await supabase.from('tracks').insert(
          uploadedTracks.map(t => ({
            title: t.title,
            artist: user.artistName || user.username,
            album: albumTitle.trim(),
            duration: t.duration,
            cover: coverUrl,
            audio_url: t.audio_url,
            genre,
            user_id: user.id,
            album_id: albumData.id,
            preview_start_sec: 0,
            preview_duration_sec: 20,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })),
        );
        if (tracksErr) throw new Error(tracksErr.message);
      }

      clearInterval(tick);
      setUploadProgress(100);
      navigation.navigate('OnboardingLive');

    } catch (err) {
      clearInterval(tick);
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // ── Loading guard ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <View className="flex-1 bg-dark-900 items-center justify-center">
        <ActivityIndicator size="large" color="#a78bfa" />
        <Text className="text-white/40 text-sm mt-3">Loading…</Text>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      className="flex-1 bg-dark-900"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View className="items-center mb-10 mt-4">
        <View className="flex-row items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 mb-4">
          <Mic2 size={12} color="#c4b5fd" />
          <Text className="text-xs text-violet-300 font-medium">Step 3 of 3 · Release your first track</Text>
        </View>
        <Text className="text-2xl font-bold text-white mb-2">Upload your music</Text>
        <Text className="text-sm text-white/40">Pick a file, fill in the details, hit publish.</Text>
      </View>

      {/* Pick audio button / file list */}
      {!hasFiles ? (
        <TouchableOpacity
          onPress={pickAudioFiles}
          className="rounded-2xl border-2 border-dashed border-dark-600 bg-dark-800/30 p-12 items-center gap-4"
          activeOpacity={0.7}
        >
          <View className="w-16 h-16 rounded-2xl bg-dark-700 items-center justify-center">
            <UploadCloud size={28} color="#6b7280" />
          </View>
          <View className="items-center">
            <Text className="font-semibold text-white mb-1">Tap to pick your track</Text>
            <Text className="text-sm text-white/40">MP3, WAV, AIFF · Max {MAX_MB} MB</Text>
          </View>
          <View className="px-3 py-1.5 rounded-full bg-dark-700">
            <Text className="text-xs text-white/50">Browse files</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View className="rounded-2xl border-2 border-dark-600 bg-dark-800/50 p-4 gap-2">
          {files.map((t, i) => (
            <FileRow key={`${t.uri}-${i}`} track={t} onRemove={() => removeFile(i)} />
          ))}
          <TouchableOpacity
            onPress={pickAudioFiles}
            className="w-full py-2 items-center justify-center flex-row gap-1.5"
            activeOpacity={0.6}
          >
            <UploadCloud size={12} color="#6b7280" />
            <Text className="text-xs text-white/30">Add more tracks</Text>
          </TouchableOpacity>
        </View>
      )}

      {dropError ? (
        <Text className="text-sm text-red-400 px-1 mt-2">{dropError}</Text>
      ) : null}

      {/* Metadata — visible when files are picked */}
      {hasFiles && (
        <View className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-6 gap-5">

          {/* Release type */}
          <View>
            <Text className="text-sm font-medium text-white mb-3">Release type</Text>
            <View className="flex-row gap-2">
              {(['single', 'album'] as ReleaseType[]).map(type => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setReleaseType(type)}
                  className={`flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-xl border-2 ${
                    releaseType === type
                      ? 'border-primary-500 bg-primary-500/10'
                      : 'border-dark-600'
                  }`}
                  activeOpacity={0.7}
                >
                  {type === 'single'
                    ? <Music2 size={15} color={releaseType === type ? '#fff' : '#6b7280'} />
                    : <Disc3 size={15} color={releaseType === type ? '#fff' : '#6b7280'} />
                  }
                  <Text className={`text-sm font-medium ${releaseType === type ? 'text-white' : 'text-dark-400'}`}>
                    {type === 'single' ? 'Single' : 'Album'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Track / album title */}
          <View>
            <Text className="text-sm font-medium text-white mb-2">
              {isAlbumMode ? 'Album title' : 'Track title'}
              <Text className="text-red-400"> *</Text>
            </Text>
            <TextInput
              value={isAlbumMode ? albumTitle : trackTitle}
              onChangeText={isAlbumMode ? setAlbumTitle : setTrackTitle}
              placeholder={isAlbumMode ? 'Album name' : 'Track name'}
              placeholderTextColor="rgba(255,255,255,0.25)"
              maxLength={100}
              className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white"
            />
          </View>

          {/* Genre */}
          <View>
            <Text className="text-sm font-medium text-white mb-2">
              Genre <Text className="text-red-400">*</Text>
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
                    {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Cover art */}
          <View>
            <Text className="text-sm font-medium text-white mb-2">
              Cover art
              {isAlbumMode
                ? <Text className="text-red-400"> *</Text>
                : <Text className="text-xs font-normal text-white/30"> · optional</Text>
              }
            </Text>
            {!coverUri ? (
              <TouchableOpacity
                onPress={pickCoverImage}
                className="w-full flex-row items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-dark-600"
                activeOpacity={0.7}
              >
                <ImageIcon size={16} color="rgba(255,255,255,0.4)" />
                <Text className="text-sm text-white/40">
                  {isAlbumMode ? 'Add album cover' : 'Add cover art'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View className="flex-row items-center gap-3">
                <Image
                  source={{ uri: coverUri }}
                  className="w-14 h-14 rounded-lg"
                  resizeMode="cover"
                />
                <View className="flex-1 min-w-0">
                  <Text className="text-sm text-white" numberOfLines={1}>{coverName}</Text>
                  <TouchableOpacity
                    onPress={() => { setCoverUri(null); setCoverName(null); setCoverMime(null); }}
                    activeOpacity={0.7}
                  >
                    <Text className="text-xs text-red-400 mt-0.5">Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Upload error */}
          {uploadError ? (
            <Text className="text-sm text-red-400">{uploadError}</Text>
          ) : null}

          {/* Progress bar */}
          {isUploading && (
            <View className="gap-1.5">
              <View className="flex-row justify-between">
                <Text className="text-xs text-white/40">Uploading…</Text>
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

          {/* Public note + submit */}
          <View className="pt-2 gap-3">
            <View className="flex-row items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/15">
              <Globe size={13} color="#34d399" />
              <Text className="text-xs text-emerald-300/80 font-medium">
                Your track is public immediately.
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleUpload}
              disabled={isUploading || !canSubmit}
              className={`w-full flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-primary-600 ${
                isUploading || !canSubmit ? 'opacity-40' : ''
              }`}
              activeOpacity={0.85}
            >
              {isUploading ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text className="text-white font-semibold">Publishing…</Text>
                </>
              ) : (
                <>
                  <Text className="text-white font-semibold">Publish</Text>
                  <ArrowRight size={16} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>
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
            Skip for now — go to my profile
          </Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
};

export default OnboardingUpload;
