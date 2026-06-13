/**
 * UploadScreen — React Native
 *
 * Requires two Expo packages not yet in package.json:
 *   expo install expo-document-picker expo-image-picker
 *
 * Note: UploadStack.tsx imports from 'UploaddScreen' (double-d typo) — fix that import to 'UploadScreen'.
 */
import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
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
} from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../../store/useStore';
import { supabase } from '../../services/supabase';
import { checkCopyright } from '../../services/copyrightService';
import { BoostService } from '../../services/boostService';

const GENRES = [
  'Electronic', 'Pop', 'Rock', 'Hip Hop', 'R&B', 'Jazz', 'Classical',
  'Country', 'Folk', 'Alternative', 'Experimental', 'Reggae', 'Blues',
];

const MAX_TRACKS = 20;
const FREE_TRACK_LIMIT = 10;
const FREE_ALBUM_LIMIT = 2;

const ACCEPTED_AUDIO_MIME = [
  'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aiff',
  'audio/x-aiff', 'audio/mp4', 'audio/x-m4a',
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface RNFile {
  uri: string;
  name: string;
  size: number;
  mimeType?: string;
}

export interface TrackEntry {
  id: string;
  file: RNFile;
  title: string;
  duration: number;
  order: number;
}

function createTrackEntry(file: RNFile, order: number): TrackEntry {
  const baseName = file.name.replace(/\.[^.]+$/, '') || `Track ${order}`;
  return {
    id: `track-${Date.now()}-${order}-${Math.random().toString(36).slice(2)}`,
    file,
    title: baseName,
    duration: 0,
    order,
  };
}

async function getAudioDurationFromUri(uri: string): Promise<number> {
  try {
    const { sound, status } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false }
    );
    await sound.unloadAsync();
    if (status.isLoaded && status.durationMillis != null) {
      return Math.floor(status.durationMillis / 1000);
    }
  } catch {
    // Duration stays 0
  }
  return 0;
}

async function uploadToSupabase(
  uri: string,
  path: string,
  contentType: string
): Promise<{ data: { path: string } | null; error: { message: string } | null }> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return supabase.storage.from('music-files').upload(path, blob, { contentType, upsert: false });
}

// ─── Unified upload content ───────────────────────────────────────────────────

const UnifiedUploadContent: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<UploadStackParamList, 'Upload'>>();
  const { user } = useStore();

  const [tracks, setTracks] = useState<TrackEntry[]>([]);
  const [albumTitle, setAlbumTitle] = useState('');
  const [artist, setArtist] = useState(user?.username || '');
  const [genre, setGenre] = useState('');
  const [coverImage, setCoverImage] = useState<RNFile | null>(null);
  const [singleTitle, setSingleTitle] = useState('');
  const [singleAlbumName, setSingleAlbumName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dropError, setDropError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [uploadCounts, setUploadCounts] = useState<{ trackCount: number; albumCount: number } | null>(null);
  const [challengesOpen, setChallengesOpen] = useState(false);
  const [copyrightAcknowledged, setCopyrightAcknowledged] = useState(false);

  const isPro = user?.subscriptionTier === 'pro';
  const atTrackLimit = !isPro && (uploadCounts?.trackCount ?? 0) >= FREE_TRACK_LIMIT;
  const atAlbumLimit = !isPro && (uploadCounts?.albumCount ?? 0) >= FREE_ALBUM_LIMIT;
  const isSingle = tracks.length === 1;
  const isAlbum = tracks.length > 1;

  useEffect(() => {
    setArtist(user?.username || '');
  }, [user?.username]);

  // Unload audio on unmount
  useEffect(() => {
    return () => {
      sound?.unloadAsync();
    };
  }, [sound]);

  const setTrackTitle = (id: string, title: string) =>
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));

  const removeTrack = (id: string) => {
    const next = tracks.filter((t) => t.id !== id);
    if (next.length === 0) {
      clearAll();
    } else {
      setTracks(next.map((t, i) => ({ ...t, order: i + 1 })));
    }
  };

  const clearAll = () => {
    setTracks([]);
    setAlbumTitle('');
    setSingleTitle('');
    setSingleAlbumName('');
    setCoverImage(null);
    setDropError(null);
    setUploadProgress(0);
    setCopyrightAcknowledged(false);
    sound?.pauseAsync().catch(() => {});
    setIsPlaying(false);
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
      Alert.alert(
        'Track limit reached',
        `Free plan is capped at ${FREE_TRACK_LIMIT} tracks. Upgrade to Pro for unlimited uploads.`
      );
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

      const files: RNFile[] = result.assets.map((a) => ({
        uri: a.uri,
        name: a.name,
        size: a.size ?? 0,
        mimeType: a.mimeType,
      }));

      if (!isPro) {
        const alreadyUploaded = uploadCounts?.trackCount ?? 0;
        const wouldTotal = alreadyUploaded + tracks.length + files.length;
        if (wouldTotal > FREE_TRACK_LIMIT) {
          const remaining = Math.max(0, FREE_TRACK_LIMIT - alreadyUploaded - tracks.length);
          setDropError(
            remaining === 0
              ? `You've reached the free plan limit of ${FREE_TRACK_LIMIT} tracks.`
              : `You can add ${remaining} more track${remaining === 1 ? '' : 's'} on the free plan.`
          );
          return;
        }
      }
      if (tracks.length + files.length > MAX_TRACKS) {
        setDropError(`Maximum ${MAX_TRACKS} tracks per upload.`);
        return;
      }

      const nextOrder = tracks.length + 1;
      const newEntries = files.map((f, i) => createTrackEntry(f, nextOrder + i));
      const combined = [...tracks, ...newEntries];
      setTracks(combined);
      if (combined.length === 1) setSingleTitle(combined[0].title);

      // Resolve durations in background
      newEntries.forEach((entry) => {
        getAudioDurationFromUri(entry.file.uri).then((dur) => {
          setTracks((prev) =>
            prev.map((t) => (t.id === entry.id ? { ...t, duration: dur } : t))
          );
        });
      });
    } catch (error) {
      setDropError('Failed to pick files. Please try again.');
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
      Alert.alert('Error', 'Failed to pick image.');
    }
  };

  const handlePlayPause = async () => {
    if (!tracks[0]) return;
    try {
      if (sound) {
        if (isPlaying) {
          await sound.pauseAsync();
          setIsPlaying(false);
        } else {
          await sound.playAsync();
          setIsPlaying(true);
        }
      } else {
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: tracks[0].file.uri },
          { shouldPlay: true }
        );
        newSound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) setIsPlaying(false);
        });
        setSound(newSound);
        setIsPlaying(true);
      }
    } catch {
      Alert.alert('Playback error', 'Could not play the selected file.');
    }
  };

  const submitSingle = async () => {
    if (!user || tracks.length !== 1) return;
    if (!isPro && (uploadCounts?.trackCount ?? 0) >= FREE_TRACK_LIMIT) {
      Alert.alert('Upload limit reached', `Free plan is limited to ${FREE_TRACK_LIMIT} tracks. Upgrade to Pro for unlimited uploads.`);
      return;
    }
    if (!singleTitle.trim() || !artist.trim() || !genre) {
      Alert.alert('Missing fields', 'Please fill in Title, Artist, and Genre.');
      return;
    }
    // Copyright check passes file metadata only (no actual File object on mobile)
    try {
      const result = await checkCopyright(tracks[0].file as any, { title: singleTitle, artist });
      if (result.blocked) {
        Alert.alert('Copyright', result.reason || 'This upload was blocked by our copyright policy.');
        return;
      }
    } catch {
      Alert.alert('Error', 'Copyright check failed. Please try again.');
      return;
    }
    setIsUploading(true);
    setUploadProgress(0);
    const interval = setInterval(() => setUploadProgress((p) => (p >= 90 ? 90 : p + 10)), 200);
    try {
      const sanitized = tracks[0].file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `audio-files/${user.id}/${Date.now()}-${sanitized}`;
      const contentType = tracks[0].file.mimeType ?? 'audio/mpeg';
      const { data: audioData, error: audioError } = await uploadToSupabase(
        tracks[0].file.uri,
        fileName,
        contentType
      );
      if (audioError || !audioData?.path) throw new Error(audioError?.message ?? 'Audio upload failed');
      const { data: audioUrlData } = supabase.storage.from('music-files').getPublicUrl(audioData.path);
      const audioUrl = audioUrlData.publicUrl;

      let imageUrl = '';
      if (coverImage) {
        const sanitizedCover = coverImage.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const coverPath = `playlist-covers/${user.id}/${Date.now()}-${sanitizedCover}`;
        const { data: imgData, error: imgErr } = await uploadToSupabase(
          coverImage.uri,
          coverPath,
          coverImage.mimeType ?? 'image/jpeg'
        );
        if (imgErr || !imgData?.path) throw new Error(imgErr?.message ?? 'Cover upload failed');
        imageUrl = supabase.storage.from('music-files').getPublicUrl(imgData.path).data.publicUrl;
      }

      const { data: trackData, error: trackError } = await supabase
        .from('tracks')
        .insert({
          title: singleTitle,
          artist,
          album: singleAlbumName,
          duration: tracks[0].duration,
          cover: imageUrl || 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop',
          audio_url: audioUrl,
          genre,
          user_id: user.id,
          preview_start_sec: 0,
          preview_duration_sec: 20,
          challenges_open: challengesOpen,
        })
        .select('id')
        .single();
      if (trackError) throw new Error(`Failed to save track: ${trackError.message}`);

      if (isPro && trackData?.id) {
        BoostService.boostTrack(trackData.id, user.id).catch(() => {});
      }

      clearInterval(interval);
      setUploadProgress(100);
      setIsUploading(false);
      Alert.alert('Track uploaded', 'Your track is now live.');
      clearAll();
    } catch (error) {
      clearInterval(interval);
      setIsUploading(false);
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const submitAlbum = async () => {
    if (!user || tracks.length < 2) return;
    if (!isPro) {
      if ((uploadCounts?.albumCount ?? 0) >= FREE_ALBUM_LIMIT) {
        Alert.alert('Album limit reached', `Free plan is limited to ${FREE_ALBUM_LIMIT} albums. Upgrade to Pro.`);
        return;
      }
      if ((uploadCounts?.trackCount ?? 0) + tracks.length > FREE_TRACK_LIMIT) {
        Alert.alert('Track limit reached', `This album would exceed your free plan track limit of ${FREE_TRACK_LIMIT}. Upgrade to Pro.`);
        return;
      }
    }
    if (!albumTitle.trim() || !artist.trim() || !genre) {
      Alert.alert('Missing fields', 'Please fill in Album Title, Artist, and Genre.');
      return;
    }
    if (!coverImage) {
      Alert.alert('Missing cover', 'Please select an album cover image.');
      return;
    }
    setIsUploading(true);
    setUploadProgress(0);
    const interval = setInterval(() => setUploadProgress((p) => (p >= 90 ? 90 : p + 10)), 200);
    try {
      const sanitizedCover = coverImage.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const coverPath = `playlist-covers/${user.id}/${Date.now()}-${sanitizedCover}`;
      const { data: coverData, error: coverErr } = await uploadToSupabase(
        coverImage.uri,
        coverPath,
        coverImage.mimeType ?? 'image/jpeg'
      );
      if (coverErr || !coverData?.path) throw new Error(coverErr?.message ?? 'Cover upload failed');
      const coverUrl = supabase.storage.from('music-files').getPublicUrl(coverData.path).data.publicUrl;
      setUploadProgress(20);

      const sortedTracks = [...tracks].sort((a, b) => a.order - b.order);
      const uploadedTracks: {
        title: string; duration: number; audio_url: string;
        order: number; preview_start_sec: number; preview_duration_sec: number;
      }[] = [];

      for (let i = 0; i < sortedTracks.length; i++) {
        const track = sortedTracks[i];
        const sanitized = track.file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `audio-files/${user.id}/${Date.now()}-${i}-${sanitized}`;
        const { data: tData, error: tErr } = await uploadToSupabase(
          track.file.uri,
          fileName,
          track.file.mimeType ?? 'audio/mpeg'
        );
        if (tErr || !tData?.path) throw new Error(`Failed to upload track ${i + 1}: ${tErr?.message}`);
        const audioUrl = supabase.storage.from('music-files').getPublicUrl(tData.path).data.publicUrl;
        uploadedTracks.push({
          title: track.title,
          duration: track.duration,
          audio_url: audioUrl,
          order: track.order,
          preview_start_sec: 0,
          preview_duration_sec: 20,
        });
        setUploadProgress(20 + ((i + 1) / sortedTracks.length) * 50);
      }

      const { data: albumData, error: albumError } = await supabase
        .from('albums')
        .insert({
          title: albumTitle,
          artist,
          cover: coverUrl,
          genre,
          user_id: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (albumError) throw new Error(`Failed to create album: ${albumError.message}`);
      setUploadProgress(70);

      const { data: insertedTracks, error: tracksError } = await supabase
        .from('tracks')
        .insert(
          uploadedTracks.map((t) => ({
            title: t.title,
            artist,
            album: albumTitle,
            duration: t.duration,
            cover: coverUrl,
            audio_url: t.audio_url,
            genre,
            user_id: user.id,
            album_id: albumData.id,
            preview_start_sec: t.preview_start_sec,
            preview_duration_sec: t.preview_duration_sec,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }))
        )
        .select('id');
      if (tracksError) throw new Error(`Failed to create tracks: ${tracksError.message}`);

      if (isPro && insertedTracks?.length) {
        insertedTracks.forEach((t) => BoostService.boostTrack(t.id, user.id).catch(() => {}));
      }

      clearInterval(interval);
      setUploadProgress(100);
      setIsUploading(false);
      Alert.alert('Album uploaded', 'Your album is now live.');
      clearAll();
    } catch (error) {
      clearInterval(interval);
      setIsUploading(false);
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Failed to upload album');
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View className="gap-6">
        {/* Upload limits bar */}
        {!isPro && uploadCounts && (
          <View className="flex-row items-center justify-between bg-dark-800 rounded-xl px-4 py-3 border border-dark-700">
            <Text className="text-xs text-gray-400">
              <Text className={atTrackLimit ? 'text-amber-400 font-medium' : 'text-gray-300'}>
                {uploadCounts.trackCount}/{FREE_TRACK_LIMIT} tracks
              </Text>
              {'  ·  '}
              <Text className={atAlbumLimit ? 'text-amber-400 font-medium' : 'text-gray-300'}>
                {uploadCounts.albumCount}/{FREE_ALBUM_LIMIT} albums
              </Text>
            </Text>
            <TouchableOpacity
              onPress={() => (navigation.getParent() as any)?.navigate('ProfileTab')}
            >
              <Text className="text-violet-400 text-xs font-medium">Go Pro →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* File picker area */}
        {atTrackLimit ? (
          <View className="rounded-2xl border-2 border-amber-600/40 bg-amber-950/30 p-8 items-center">
            <Lock size={36} color="#f59e0b" />
            <Text className="text-white font-semibold mt-3 mb-1">Track limit reached</Text>
            <Text className="text-gray-400 text-sm text-center mb-4">
              Free plan is capped at {FREE_TRACK_LIMIT} tracks. Upgrade to Pro for unlimited uploads.
            </Text>
            <TouchableOpacity
              onPress={() => (navigation.getParent() as any)?.navigate('ProfileTab')}
              className="px-5 py-2.5 rounded-xl bg-violet-600"
            >
              <Text className="text-white text-sm font-medium">Upgrade to Pro</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={pickAudioFiles}
            className="rounded-2xl border-2 border-dashed border-dark-600 bg-dark-800/50 p-8 items-center"
          >
            <CloudUpload size={40} color="#6b7280" />
            <Text className="text-white font-medium mt-3 mb-1">Select audio files</Text>
            <Text className="text-gray-500 text-sm text-center">
              MP3, WAV, AIFF, M4A
              {!isPro && uploadCounts
                ? ` · ${FREE_TRACK_LIMIT - uploadCounts.trackCount} track${FREE_TRACK_LIMIT - uploadCounts.trackCount === 1 ? '' : 's'} remaining`
                : ` · Up to ${MAX_TRACKS} tracks`}
            </Text>
            <Text className="text-gray-600 text-xs mt-2">
              1 file = single track · 2+ files = album
            </Text>
          </TouchableOpacity>
        )}

        {dropError && (
          <Text className="text-red-400 text-sm px-1">{dropError}</Text>
        )}

        {/* Track list summary */}
        {tracks.length > 0 && (
          <View className="flex-row items-center justify-between">
            <Text className="text-gray-400 text-sm">
              {tracks.length} file{tracks.length > 1 ? 's' : ''} selected
            </Text>
            <TouchableOpacity onPress={clearAll}>
              <Text className="text-violet-400 text-sm">Clear all</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Single track form ── */}
        {isSingle && (
          <View className="rounded-2xl bg-dark-800 border border-dark-700 p-5 gap-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Single Track
            </Text>

            {/* File row */}
            <View className="flex-row items-center gap-3 bg-dark-700 rounded-xl p-3">
              <View className="w-10 h-10 rounded-lg bg-violet-900/60 items-center justify-center">
                <Music size={20} color="#7c3aed" />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-white font-medium" numberOfLines={1}>
                  {tracks[0].file.name}
                </Text>
                <Text className="text-gray-500 text-xs">
                  {formatDuration(tracks[0].duration)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handlePlayPause}
                className="p-2 rounded-lg bg-violet-600"
              >
                {isPlaying ? (
                  <Pause size={18} color="#fff" />
                ) : (
                  <Play size={18} color="#fff" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => removeTrack(tracks[0].id)}
                className="p-2 rounded-lg"
              >
                <X size={18} color="#ef4444" />
              </TouchableOpacity>
            </View>

            <View className="gap-1">
              <Text className="text-sm font-medium text-gray-300">Title *</Text>
              <TextInput
                value={singleTitle}
                onChangeText={(v) => {
                  setSingleTitle(v);
                  setTrackTitle(tracks[0].id, v);
                }}
                placeholder="Track title"
                placeholderTextColor="#6b7280"
                className="px-4 py-3 rounded-xl bg-dark-700 border border-dark-600 text-white"
              />
            </View>

            <View className="gap-1">
              <Text className="text-sm font-medium text-gray-300">Artist *</Text>
              <TextInput
                value={artist}
                onChangeText={setArtist}
                placeholder="Artist name"
                placeholderTextColor="#6b7280"
                className="px-4 py-3 rounded-xl bg-dark-700 border border-dark-600 text-white"
              />
            </View>

            <View className="gap-1">
              <Text className="text-sm font-medium text-gray-300">Album</Text>
              <TextInput
                value={singleAlbumName}
                onChangeText={setSingleAlbumName}
                placeholder="Album name (optional)"
                placeholderTextColor="#6b7280"
                className="px-4 py-3 rounded-xl bg-dark-700 border border-dark-600 text-white"
              />
            </View>

            <GenreSelector value={genre} onChange={setGenre} />

            <View className="flex-row items-center justify-between py-1">
              <View className="flex-1 mr-4">
                <Text className="text-sm font-medium text-gray-300">Allow Challenges</Text>
                <Text className="text-xs text-gray-500 mt-0.5">Let other artists record responses to this track</Text>
              </View>
              <Switch
                value={challengesOpen}
                onValueChange={setChallengesOpen}
                trackColor={{ false: '#374151', true: '#7c3aed' }}
                thumbColor="#fff"
              />
            </View>

            <CoverPicker coverImage={coverImage} onPick={pickCoverImage} onClear={() => setCoverImage(null)} />

            {isUploading && <ProgressBar progress={uploadProgress} label="Uploading..." />}

            <CopyrightCheckbox
              value={copyrightAcknowledged}
              onChange={setCopyrightAcknowledged}
            />

            <TouchableOpacity
              onPress={submitSingle}
              disabled={isUploading || !copyrightAcknowledged}
              className={`flex-row items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-violet-600 ${isUploading || !copyrightAcknowledged ? 'opacity-40' : ''}`}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Save size={18} color="#fff" />
              )}
              <Text className="text-white font-medium">
                {isUploading ? 'Uploading...' : 'Upload Track'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Album form ── */}
        {isAlbum && (
          <View className="rounded-2xl bg-dark-800 border border-dark-700 p-5 gap-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Album
            </Text>

            <View className="gap-1">
              <Text className="text-sm font-medium text-gray-300">Album title *</Text>
              <TextInput
                value={albumTitle}
                onChangeText={setAlbumTitle}
                placeholder="Album title"
                placeholderTextColor="#6b7280"
                className="px-4 py-3 rounded-xl bg-dark-700 border border-dark-600 text-white"
              />
            </View>

            <View className="gap-1">
              <Text className="text-sm font-medium text-gray-300">Artist *</Text>
              <TextInput
                value={artist}
                onChangeText={setArtist}
                placeholder="Artist name"
                placeholderTextColor="#6b7280"
                className="px-4 py-3 rounded-xl bg-dark-700 border border-dark-600 text-white"
              />
            </View>

            <GenreSelector value={genre} onChange={setGenre} />

            <CoverPicker coverImage={coverImage} onPick={pickCoverImage} onClear={() => setCoverImage(null)} />

            {/* Track list */}
            <View className="gap-1">
              <Text className="text-sm font-medium text-gray-300 mb-1">
                Tracks
              </Text>
              <View className="gap-2">
                {tracks.map((track, idx) => (
                  <View
                    key={track.id}
                    className="flex-row items-center gap-2 bg-dark-700 rounded-xl p-3 border border-dark-600"
                  >
                    <Text className="w-5 text-sm text-gray-500 text-right">{track.order}</Text>
                    <TextInput
                      value={track.title}
                      onChangeText={(v) => setTrackTitle(track.id, v)}
                      placeholder="Track title"
                      placeholderTextColor="#6b7280"
                      className="flex-1 px-3 py-2 rounded-lg bg-dark-800 text-sm text-white"
                    />
                    <Text className="text-xs text-gray-500 w-10 text-right">
                      {formatDuration(track.duration)}
                    </Text>
                    <View className="flex-row gap-1">
                      <TouchableOpacity
                        onPress={() => moveTrack(track.id, 'up')}
                        disabled={idx === 0}
                        className="p-1.5 rounded"
                      >
                        <ChevronUp size={16} color={idx === 0 ? '#374151' : '#9ca3af'} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => moveTrack(track.id, 'down')}
                        disabled={idx === tracks.length - 1}
                        className="p-1.5 rounded"
                      >
                        <ChevronDown
                          size={16}
                          color={idx === tracks.length - 1 ? '#374151' : '#9ca3af'}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => removeTrack(track.id)}
                        className="p-1.5 rounded"
                      >
                        <X size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                onPress={pickAudioFiles}
                className="mt-2 py-2.5 rounded-xl bg-dark-700 border border-dashed border-dark-500 items-center"
              >
                <Text className="text-violet-400 text-sm">+ Add more tracks</Text>
              </TouchableOpacity>
            </View>

            {atAlbumLimit && (
              <View className="rounded-xl border border-amber-600/40 bg-amber-950/30 p-4 items-center">
                <Text className="text-white text-sm font-medium mb-1">Album limit reached</Text>
                <Text className="text-gray-400 text-xs mb-2">
                  Free plan is capped at {FREE_ALBUM_LIMIT} albums.
                </Text>
                <TouchableOpacity onPress={() => (navigation.getParent() as any)?.navigate('ProfileTab')}>
                  <Text className="text-violet-400 text-sm font-medium">Upgrade to Pro →</Text>
                </TouchableOpacity>
              </View>
            )}

            {isUploading && <ProgressBar progress={uploadProgress} label="Uploading album..." />}

            <CopyrightCheckbox
              value={copyrightAcknowledged}
              onChange={setCopyrightAcknowledged}
            />

            <TouchableOpacity
              onPress={submitAlbum}
              disabled={isUploading || atAlbumLimit || !copyrightAcknowledged}
              className={`flex-row items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-violet-600 ${isUploading || atAlbumLimit || !copyrightAcknowledged ? 'opacity-40' : ''}`}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Save size={18} color="#fff" />
              )}
              <Text className="text-white font-medium">
                {isUploading ? 'Uploading...' : 'Upload Album'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Empty state */}
        {tracks.length === 0 && (
          <View className="items-center py-12 px-6">
            <Music size={48} color="#374151" />
            <Text className="text-gray-500 font-medium mt-4 mb-2">No files yet</Text>
            <Text className="text-gray-600 text-sm text-center">
              Tap the area above to select MP3, WAV, AIFF, or M4A files.{'\n'}
              1 file uploads as a single · 2+ files upload as an album.
            </Text>
          </View>
        )}

        {/* Image lightbox */}
        <Modal
          transparent
          visible={!!expandedImage}
          animationType="fade"
          onRequestClose={() => setExpandedImage(null)}
        >
          <Pressable
            className="flex-1 bg-black items-center justify-center p-4"
            onPress={() => setExpandedImage(null)}
          >
            {expandedImage && (
              <Image
                source={{ uri: expandedImage }}
                className="w-full rounded-xl"
                style={{ height: 320 }}
                resizeMode="contain"
              />
            )}
            <TouchableOpacity
              onPress={() => setExpandedImage(null)}
              className="absolute top-10 right-4 p-2 rounded-full bg-white/20"
            >
              <X size={24} color="#fff" />
            </TouchableOpacity>
          </Pressable>
        </Modal>
      </View>
    </ScrollView>
  );
};

// ─── Helper sub-components ───────────────────────────────────────────────────

const GenreSelector: React.FC<{ value: string; onChange: (g: string) => void }> = ({
  value,
  onChange,
}) => (
  <View className="gap-2">
    <Text className="text-sm font-medium text-gray-300">Genre *</Text>
    <View className="flex-row flex-wrap gap-2">
      {GENRES.map((g) => (
        <TouchableOpacity
          key={g}
          onPress={() => onChange(g === value ? '' : g)}
          className={`px-3 py-1.5 rounded-full border ${
            value === g
              ? 'bg-violet-600/30 border-violet-500'
              : 'bg-dark-700 border-dark-600'
          }`}
        >
          <Text
            className={`text-xs font-medium ${value === g ? 'text-violet-300' : 'text-gray-400'}`}
          >
            {g}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>
);

const CoverPicker: React.FC<{
  coverImage: RNFile | null;
  onPick: () => void;
  onClear: () => void;
}> = ({ coverImage, onPick, onClear }) => (
  <View className="gap-1">
    <Text className="text-sm font-medium text-gray-300">Cover</Text>
    {!coverImage ? (
      <TouchableOpacity
        onPress={onPick}
        className="rounded-xl border-2 border-dashed border-dark-600 py-4 items-center"
      >
        <Text className="text-gray-500 text-sm">Tap to add cover image</Text>
      </TouchableOpacity>
    ) : (
      <View className="flex-row items-center gap-3">
        <Image source={{ uri: coverImage.uri }} className="w-14 h-14 rounded-lg" />
        <Text className="flex-1 text-gray-400 text-sm" numberOfLines={1}>
          {coverImage.name}
        </Text>
        <TouchableOpacity onPress={onClear}>
          <Text className="text-red-400 text-sm">Remove</Text>
        </TouchableOpacity>
      </View>
    )}
  </View>
);

const CopyrightCheckbox: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({
  value,
  onChange,
}) => (
  <TouchableOpacity
    onPress={() => onChange(!value)}
    activeOpacity={0.7}
    className="flex-row items-start gap-3 py-1"
  >
    <View
      className={`w-5 h-5 mt-0.5 rounded border-2 flex-shrink-0 items-center justify-center ${
        value ? 'bg-violet-600 border-violet-500' : 'bg-dark-700 border-dark-500'
      }`}
    >
      {value && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 14 }}>✓</Text>}
    </View>
    <Text className="flex-1 text-xs text-gray-400 leading-5">
      I own the rights to this content or have permission to distribute it.{' '}
      <Text className="text-gray-500">
        Uploading copyrighted material without authorisation will result in automatic removal.
      </Text>
    </Text>
  </TouchableOpacity>
);

const ProgressBar: React.FC<{ progress: number; label: string }> = ({ progress, label }) => (
  <View className="gap-1.5">
    <View className="flex-row justify-between">
      <Text className="text-sm text-gray-400">{label}</Text>
      <Text className="text-sm text-gray-400">{Math.round(progress)}%</Text>
    </View>
    <View className="h-2 bg-dark-700 rounded-full overflow-hidden">
      <View
        className="h-full bg-violet-500 rounded-full"
        style={{ width: `${progress}%` }}
      />
    </View>
  </View>
);

// ─── Root component ───────────────────────────────────────────────────────────

const Upload: React.FC = () => {
  const { isAuthenticated, user } = useStore();
  const [resendStatus, setResendStatus] = React.useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }} edges={['top']}>
      <View className="flex-1 items-center justify-center px-6 gap-6">
        <View className="bg-dark-700 rounded-2xl p-6">
          <Lock size={48} color="#a855f7" />
        </View>
        <Text className="text-xl font-semibold text-white">Authentication Required</Text>
        <Text className="text-gray-400 text-center max-w-xs">
          Sign in to upload music or albums and manage your releases.
        </Text>
      </View>
      </SafeAreaView>
    );
  }

  if (user && !user.emailConfirmed) {
    const handleResend = async () => {
      if (!user.email) return;
      setResendStatus('sending');
      try {
        const { AuthService } = await import('../../services/authService');
        await AuthService.resendEmailConfirmation(user.email);
        setResendStatus('sent');
      } catch {
        setResendStatus('error');
      }
    };

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }} edges={['top']}>
      <View className="flex-1 items-center justify-center px-6 gap-6">
        <View className="bg-dark-700 rounded-2xl p-6">
          <Lock size={48} color="#a855f7" />
        </View>
        <Text className="text-xl font-semibold text-white">Confirm your email to upload</Text>
        <Text className="text-gray-400 text-center max-w-xs">
          We sent a confirmation link to{' '}
          <Text className="text-white font-medium">{user.email}</Text>.
          {'\n'}Click the link in that email to unlock uploads.
        </Text>
        <Text className="text-gray-600 text-xs">Check your spam folder if you don't see it.</Text>
        <TouchableOpacity
          onPress={handleResend}
          disabled={resendStatus === 'sending' || resendStatus === 'sent'}
          className={`px-6 py-3 rounded-xl bg-violet-600 ${resendStatus === 'sending' || resendStatus === 'sent' ? 'opacity-50' : ''}`}
        >
          <Text className="text-white font-medium">
            {resendStatus === 'sending'
              ? 'Sending…'
              : resendStatus === 'sent'
              ? 'Email sent!'
              : resendStatus === 'error'
              ? 'Failed — try again'
              : 'Resend confirmation email'}
          </Text>
        </TouchableOpacity>
      </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }} edges={['top']}>
    <View className="flex-1 bg-dark-900">
      <View className="px-4 pt-4 pb-2 border-b border-dark-700/50">
        <Text className="text-2xl font-bold text-white">Upload</Text>
      </View>
      <UnifiedUploadContent />
    </View>
    </SafeAreaView>
  );
};

export default Upload;
