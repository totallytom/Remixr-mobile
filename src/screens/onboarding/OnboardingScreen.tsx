import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStack';
import {
  Camera,
  AtSign,
  ArrowRight,
  Check,
  X,
  Mic2,
  Music2,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useStore } from '../../store/useStore';
import { supabase } from '../../services/supabase';
import { getAvatarUrl } from '../../utils/avatar';
import { isMusicianRole } from '../../utils/userRole';
import { setOnboardingPending, clearOnboardingPending } from '../../utils/onboardingPending';

const GENRES = [
  'Electronic', 'Pop', 'Rock', 'Hip Hop', 'R&B', 'Jazz', 'Classical',
  'Country', 'Folk', 'Alternative', 'Experimental', 'Reggae', 'Blues',
];
const MAX_GENRES = 3;
const HANDLE_RE = /^[a-zA-Z0-9_]{3,24}$/;

type HandleStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

// ─── Live profile preview ────────────────────────────────────────────────────

const ProfilePreview: React.FC<{
  avatarPreview: string | null;
  displayName: string;
  handle: string;
  bio: string;
  genres: string[];
}> = ({ avatarPreview, displayName, handle, bio, genres }) => {
  const name = displayName.trim() || 'Your Name';
  const slug = handle.trim() || 'yourhandle';

  return (
    <View>
      <Text className="text-xs font-medium text-white/30 uppercase tracking-widest mb-3 text-center">
        Public profile preview
      </Text>

      <View className="rounded-2xl overflow-hidden bg-dark-800 border border-dark-700">
        {/* Banner */}
        <View className="h-24" style={{ backgroundColor: 'rgba(124, 58, 237, 0.4)' }} />

        {/* Avatar + identity */}
        <View className="px-5 pb-5" style={{ marginTop: -40 }}>
          <View className="flex-row items-end gap-4 mb-4">
            <View className="w-20 h-20 rounded-full border-4 border-dark-800 bg-dark-700 overflow-hidden">
              {avatarPreview ? (
                <Image
                  source={{ uri: avatarPreview }}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              ) : (
                <View className="flex-1 items-center justify-center">
                  <Mic2 size={28} color="#4b5563" />
                </View>
              )}
            </View>
            <View className="pb-1 min-w-0 flex-1">
              <Text className="font-bold text-white text-lg" numberOfLines={1}>
                {name}
              </Text>
              <Text className="text-sm text-white/40">@{slug}</Text>
            </View>
          </View>

          {bio.trim() ? (
            <Text className="text-sm text-white/60 mb-4" numberOfLines={3}>
              {bio}
            </Text>
          ) : (
            <Text className="text-sm text-white/20 italic mb-4">
              Your bio will appear here
            </Text>
          )}

          {/* Genre tags */}
          <View className="flex-row flex-wrap gap-1.5">
            {genres.length > 0
              ? genres.map((g) => (
                  <View
                    key={g}
                    className="px-2.5 py-1 rounded-full border border-primary-500/20 bg-primary-500/15"
                  >
                    <Text className="text-xs text-primary-300">{g}</Text>
                  </View>
                ))
              : ['Genre', 'Tags'].map((g) => (
                  <View key={g} className="px-2.5 py-1 rounded-full border border-dark-600 bg-dark-700">
                    <Text className="text-xs text-dark-500">{g}</Text>
                  </View>
                ))}
          </View>

          {/* Stub stats */}
          <View className="flex-row gap-5 mt-5 pt-4 border-t border-white/5">
            {([['0', 'Tracks'], ['0', 'Followers'], ['0', 'Following']] as const).map(([n, l]) => (
              <View key={l} className="items-center">
                <Text className="text-sm font-bold text-white">{n}</Text>
                <Text className="text-[10px] text-white/30">{l}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* URL hint */}
      <View className="mt-3 flex-row items-center gap-2">
        <View className="flex-1 h-px bg-white/5" />
        <Text className="text-[10px] text-white/25 px-2">remixr.app/@{slug}</Text>
        <View className="flex-1 h-px bg-white/5" />
      </View>
    </View>
  );
};

// ─── Handle status icon ───────────────────────────────────────────────────────

const HandleIcon: React.FC<{ status: HandleStatus }> = ({ status }) => {
  if (status === 'checking') return <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />;
  if (status === 'available') return <Check size={14} color="#34d399" />;
  if (status === 'taken') return <X size={14} color="#f87171" />;
  return null;
};

// ─── Main screen ──────────────────────────────────────────────────────────────

const Onboarding: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList, 'Onboarding'>>();
  const { user, isAuthenticated, updateProfile, setUserAvatar } = useStore();

  // Mark identity step as in-progress (persists across logouts via AsyncStorage)
  useEffect(() => {
    if (user && isMusicianRole(user.role)) {
      setOnboardingPending(user.id);
    }
  }, [user?.id, user?.role]);

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [handleStatus, setHandleStatus] = useState<HandleStatus>('idle');
  const handleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-populate from store
  useEffect(() => {
    if (user) {
      setHandle(user.username || '');
      setDisplayName(user.artistName || '');
      setAvatarUri(
        user.avatar && user.avatar !== '/default-avatar.jpg' ? user.avatar : null
      );
    }
  }, [user?.id]);

  // ── Avatar pick ────────────────────────────────────────────────────────────

  const pickAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled || !result.assets?.[0]) return;
      setAvatarUri(result.assets[0].uri);
      setError('');
    } catch {
      setError('Failed to pick image.');
    }
  };

  // ── Handle validation + uniqueness check ───────────────────────────────────

  const checkHandle = useCallback(
    async (value: string) => {
      if (!HANDLE_RE.test(value)) {
        setHandleStatus('invalid');
        return;
      }
      if (user && value === user.username) {
        setHandleStatus('available');
        return;
      }
      setHandleStatus('checking');
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('username', value)
        .maybeSingle();
      setHandleStatus(data ? 'taken' : 'available');
    },
    [user]
  );

  const onHandleChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setHandle(sanitized);
    setHandleStatus('idle');
    if (handleDebounceRef.current) clearTimeout(handleDebounceRef.current);
    if (sanitized.length >= 3) {
      handleDebounceRef.current = setTimeout(() => checkHandle(sanitized), 500);
    }
  };

  // ── Genre toggle ───────────────────────────────────────────────────────────

  const toggleGenre = (g: string) => {
    setGenres((prev) =>
      prev.includes(g)
        ? prev.filter((x) => x !== g)
        : prev.length < MAX_GENRES
        ? [...prev, g]
        : prev
    );
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const onSubmit = async () => {
    if (!user) return;
    if (!displayName.trim()) { setError('Display name is required.'); return; }
    if (handleStatus === 'taken') { setError('That handle is taken — choose another.'); return; }
    if (handleStatus === 'invalid' || !HANDLE_RE.test(handle)) {
      setError('Handle must be 3–24 characters: letters, numbers, underscores only.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      let avatarUrl = user.avatar;

      if (avatarUri && avatarUri !== user.avatar) {
        const ext = avatarUri.split('.').pop()?.split('?')[0] || 'jpg';
        const path = `avatars/${user.id}/${Date.now()}.${ext}`;
        const response = await fetch(avatarUri);
        const blob = await response.blob();
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('music-files')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
        if (uploadErr) throw new Error(uploadErr.message);
        avatarUrl = supabase.storage
          .from('music-files')
          .getPublicUrl(uploadData.path).data.publicUrl;
        setUserAvatar(avatarUrl);
      }

      await updateProfile({
        artistName: displayName.trim(),
        username: handle,
        bio: bio.trim(),
        genres,
        ...(avatarUrl ? { avatar: avatarUrl } : {}),
      });

      if (user) await clearOnboardingPending(user.id);
      navigation.navigate('OnboardingUpload');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const onSkip = async () => {
    if (user) await clearOnboardingPending(user.id);
    navigation.navigate('OnboardingUpload');
  };

  // ── Loading state while auth resolves ──────────────────────────────────────

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['top']}>
      <View className="flex-1 bg-dark-900 items-center justify-center gap-3">
        <ActivityIndicator size="large" color="rgba(255,255,255,0.4)" />
        <Text className="text-sm text-white/40">Setting up your account…</Text>
      </View>
      </SafeAreaView>
    );
  }

  const handleBorderColor =
    handleStatus === 'taken'
      ? 'border-red-500/60'
      : handleStatus === 'available'
      ? 'border-emerald-500/60'
      : 'border-dark-600';

  const handleHintColor =
    handleStatus === 'taken' || handleStatus === 'invalid'
      ? 'text-red-400'
      : handleStatus === 'available'
      ? 'text-emerald-400'
      : 'text-transparent';

  const handleHintText =
    handleStatus === 'taken'
      ? 'Handle already taken'
      : handleStatus === 'available'
      ? 'Handle is available'
      : handleStatus === 'invalid'
      ? '3–24 chars · letters, numbers, underscores'
      : '.';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['top']}>
    <ScrollView
      className="flex-1 bg-dark-900"
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View className="items-center mb-8">
        <View className="flex-row items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 mb-4">
          <Music2 size={12} color="#a78bfa" />
          <Text className="text-xs text-violet-300 font-medium">
            Step 2 of 3 · Build your identity
          </Text>
        </View>
        <Text className="text-3xl font-extrabold text-white tracking-tight mb-2 text-center">
          Set up your artist profile
        </Text>
        <Text className="text-sm text-white/40 text-center">
          This becomes your public page. Takes 60 seconds.
        </Text>
      </View>

      {/* Form card */}
      <View className="bg-dark-800 rounded-2xl p-5 border border-dark-700 gap-6 mb-6">

        {/* Error */}
        {error ? (
          <View className="p-3 bg-red-500/10 border border-red-500/25 rounded-lg">
            <Text className="text-sm text-red-400">{error}</Text>
          </View>
        ) : null}

        {/* Avatar */}
        <View className="flex-row items-center gap-4">
          <TouchableOpacity
            onPress={pickAvatar}
            className="w-20 h-20 rounded-full bg-dark-700 border-2 border-dashed border-dark-500 overflow-hidden items-center justify-center"
            style={{ flexShrink: 0 }}
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} className="w-full h-full" resizeMode="cover" />
            ) : (
              <Mic2 size={24} color="#4b5563" />
            )}
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-sm font-medium text-white">Profile photo</Text>
            <Text className="text-xs text-white/40 mt-0.5">
              Optional · JPG, PNG · Max 5 MB
            </Text>
            {avatarUri ? (
              <TouchableOpacity
                onPress={() => setAvatarUri(null)}
                className="mt-1"
              >
                <Text className="text-xs text-red-400">Remove</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={pickAvatar} className="mt-1">
                <View className="flex-row items-center gap-1">
                  <Camera size={12} color="#a78bfa" />
                  <Text className="text-xs text-violet-400">Choose photo</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Display name */}
        <View className="gap-1.5">
          <Text className="text-sm font-medium text-white">
            Display name <Text className="text-red-400">*</Text>
          </Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your artist or stage name"
            placeholderTextColor="#4b5563"
            maxLength={60}
            className="px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white"
          />
        </View>

        {/* Handle */}
        <View className="gap-1.5">
          <Text className="text-sm font-medium text-white">
            Handle <Text className="text-red-400">*</Text>
            <Text className="text-xs font-normal text-white/30"> · remixr.app/@handle</Text>
          </Text>
          <View className={`flex-row items-center bg-dark-700 border rounded-lg px-3 gap-2 ${handleBorderColor}`}>
            <AtSign size={16} color="#6b7280" />
            <TextInput
              value={handle}
              onChangeText={onHandleChange}
              placeholder="yourhandle"
              placeholderTextColor="#4b5563"
              maxLength={24}
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 py-3 text-white"
            />
            <HandleIcon status={handleStatus} />
          </View>
          <View className="flex-row justify-between">
            <Text className={`text-xs ${handleHintColor}`}>{handleHintText}</Text>
            <Text className="text-xs text-white/25">{handle.length}/24</Text>
          </View>
        </View>

        {/* Bio */}
        <View className="gap-1.5">
          <Text className="text-sm font-medium text-white">
            Bio <Text className="text-xs font-normal text-white/30"> · optional</Text>
          </Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="One or two lines about your sound…"
            placeholderTextColor="#4b5563"
            multiline
            numberOfLines={3}
            maxLength={200}
            textAlignVertical="top"
            className="px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white"
            style={{ minHeight: 80 }}
          />
          <Text className="text-xs text-white/25 text-right">{bio.length}/200</Text>
        </View>

        {/* Genres */}
        <View className="gap-2">
          <Text className="text-sm font-medium text-white">
            Genres{' '}
            <Text className="text-xs font-normal text-white/30">· pick up to {MAX_GENRES}</Text>
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {GENRES.map((g) => {
              const selected = genres.includes(g);
              const disabled = !selected && genres.length >= MAX_GENRES;
              return (
                <TouchableOpacity
                  key={g}
                  onPress={() => !disabled && toggleGenre(g)}
                  activeOpacity={disabled ? 1 : 0.7}
                  className={`px-3 py-1.5 rounded-full border ${
                    selected
                      ? 'border-primary-500 bg-primary-500/15'
                      : disabled
                      ? 'border-dark-700'
                      : 'border-dark-600'
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      selected
                        ? 'text-primary-300'
                        : disabled
                        ? 'text-dark-600'
                        : 'text-gray-400'
                    }`}
                  >
                    {g}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          onPress={onSubmit}
          disabled={isSaving || handleStatus === 'taken' || handleStatus === 'checking'}
          activeOpacity={0.85}
          className={`flex-row items-center justify-center gap-2 bg-primary-600 py-3.5 px-6 rounded-lg ${
            isSaving || handleStatus === 'taken' || handleStatus === 'checking' ? 'opacity-50' : ''
          }`}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text className="text-white font-semibold">Save &amp; upload your first track</Text>
              <ArrowRight size={16} color="#fff" />
            </>
          )}
        </TouchableOpacity>

        {/* Skip */}
        <TouchableOpacity onPress={onSkip} className="items-center py-1">
          <Text className="text-xs text-white/25 underline">Skip for now</Text>
        </TouchableOpacity>
      </View>

      {/* Live profile preview */}
      <ProfilePreview
        avatarPreview={avatarUri}
        displayName={displayName}
        handle={handle}
        bio={bio}
        genres={genres}
      />
    </ScrollView>
    </SafeAreaView>
  );
};

export default Onboarding;
