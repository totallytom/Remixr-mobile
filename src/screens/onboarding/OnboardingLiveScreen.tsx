import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  Share,
  Linking,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/OnboardingStack';
import {
  Play,
  Music2,
  Mic2,
  Check,
  Twitter,
  Share2,
} from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { MusicService } from '../../services/musicService';
import { getAvatarUrl } from '../../utils/avatar';
import { isMusicianRole } from '../../utils/userRole';

// Adjust this to your production domain
const APP_BASE_URL = 'https://remixr.app';

interface TrackPreview {
  title: string;
  cover: string | null;
  genre: string;
  releaseType: 'single' | 'album';
}

const DEFAULT_COVER =
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop';

// ─── Live pulsing dot ─────────────────────────────────────────────────────────

const LiveDot: React.FC = () => {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.8, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: 'rgba(52, 211, 153, 0.55)',
          transform: [{ scale: pulse }],
        }}
      />
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: '#10b981',
        }}
      />
    </View>
  );
};

// ─── Listener's-eye profile preview ──────────────────────────────────────────

const ProfilePreview: React.FC<{
  avatar: string | null;
  displayName: string;
  handle: string;
  bio: string;
  genres: string[];
  track: TrackPreview | null;
}> = ({ avatar, displayName, handle, bio, genres, track }) => {
  const name = displayName || handle;
  const coverSrc = track?.cover || DEFAULT_COVER;

  return (
    <View className="rounded-2xl overflow-hidden bg-dark-800 border border-white/10">
      {/* Banner */}
      <View
        className="h-20"
        style={{ backgroundColor: 'rgba(124, 58, 237, 0.45)' }}
      />

      {/* Identity */}
      <View className="px-5 pb-5" style={{ marginTop: -32 }}>
        <View className="flex-row items-end gap-3 mb-3">
          <View
            className="w-16 h-16 rounded-full border-2 border-dark-800 bg-dark-700 overflow-hidden"
            style={{ flexShrink: 0 }}
          >
            {avatar && avatar !== '/default-avatar.jpg' ? (
              <Image
                source={{ uri: getAvatarUrl(avatar) }}
                className="w-full h-full"
                resizeMode="cover"
              />
            ) : (
              <View className="flex-1 items-center justify-center bg-violet-900/40">
                <Mic2 size={22} color="rgba(255,255,255,0.6)" />
              </View>
            )}
          </View>
          <View className="flex-1" />
          {/* Decorative follow button */}
          <View className="mb-1 px-4 py-1.5 rounded-full bg-white">
            <Text className="text-dark-900 text-xs font-semibold">Follow</Text>
          </View>
        </View>

        <Text className="font-bold text-white text-base leading-tight">{name}</Text>
        <Text className="text-sm text-white/40 mt-0.5 mb-3">@{handle}</Text>

        {bio ? (
          <Text className="text-sm text-white/60 mb-3" numberOfLines={2}>
            {bio}
          </Text>
        ) : null}

        {genres.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5 mb-4">
            {genres.map((g) => (
              <View
                key={g}
                className="px-2.5 py-0.5 rounded-full border border-primary-500/20 bg-primary-500/10"
              >
                <Text className="text-xs text-primary-300">{g}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Stats */}
        <View className="flex-row gap-5 py-3 border-t border-white/5 mb-4">
          {([['1', 'Track'], ['0', 'Followers'], ['0', 'Following']] as const).map(([n, l]) => (
            <View key={l} className="flex-row items-baseline gap-1">
              <Text className="text-sm font-bold text-white">{n}</Text>
              <Text className="text-xs text-white/30">{l}</Text>
            </View>
          ))}
        </View>

        {/* Track card */}
        {track && (
          <View>
            <Text className="text-[10px] uppercase tracking-widest text-white/25 font-medium mb-2.5">
              Music
            </Text>
            <View className="flex-row items-center gap-3 p-3 rounded-xl bg-dark-700/50 border border-white/5">
              <Image
                source={{ uri: coverSrc }}
                className="w-11 h-11 rounded-lg"
                resizeMode="cover"
              />
              <View className="flex-1 min-w-0">
                <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                  {track.title}
                </Text>
                <Text className="text-xs text-white/35 mt-0.5">
                  {track.releaseType === 'album' ? 'Album' : 'Single'}
                  {track.genre ? ` · ${track.genre}` : ''}
                </Text>
              </View>
              <View className="w-8 h-8 rounded-full bg-primary-500/20 items-center justify-center">
                <Play size={12} color="#a78bfa" />
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

// ─── Share button ─────────────────────────────────────────────────────────────

const ShareButton: React.FC<{ url: string; title: string }> = ({ url, title }) => {
  const [shared, setShared] = useState(false);

  const handleShare = async () => {
    try {
      await Share.share({ url, message: title });
      setShared(true);
      setTimeout(() => setShared(false), 2200);
    } catch {
      // user cancelled or error
    }
  };

  return (
    <TouchableOpacity
      onPress={handleShare}
      activeOpacity={0.85}
      className={`w-full flex-row items-center justify-center gap-2.5 py-4 rounded-2xl ${
        shared ? 'bg-emerald-500' : 'bg-primary-600'
      }`}
    >
      {shared ? (
        <>
          <Check size={18} color="#fff" strokeWidth={2.5} />
          <Text className="text-white font-semibold text-base">Link shared!</Text>
        </>
      ) : (
        <>
          <Share2 size={17} color="#fff" />
          <Text className="text-white font-semibold text-base">Share link</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

// ─── Main screen ──────────────────────────────────────────────────────────────

const OnboardingLive: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<OnboardingStackParamList, 'OnboardingLive'>>();
  const { user, isAuthenticated } = useStore();

  const [track, setTrack] = useState<TrackPreview | null>(null);
  const [isLoadingTrack, setIsLoadingTrack] = useState(true);

  // Load latest track from Supabase
  useEffect(() => {
    if (!user?.id) {
      setIsLoadingTrack(false);
      return;
    }
    MusicService.getUserTracks(user.id)
      .then((tracks) => {
        if (tracks.length > 0) {
          const t = tracks[0];
          setTrack({
            title: t.title,
            cover: t.cover ?? null,
            genre: t.genre ?? '',
            releaseType: 'single',
          });
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingTrack(false));
  }, [user?.id]);

  if (!user) {
    return (
      <View className="flex-1 bg-dark-900 items-center justify-center">
        <ActivityIndicator size="large" color="rgba(255,255,255,0.3)" />
      </View>
    );
  }

  const profileSlug = user.username?.trim()
    ? encodeURIComponent(user.username.trim())
    : user.id;
  const profileUrl = `${APP_BASE_URL}/profile/${profileSlug}`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    'Just dropped my first track on Remixr 🎵'
  )}&url=${encodeURIComponent(profileUrl)}`;

  const displayName = user.artistName || user.username || '';
  const handle = user.username || '';

  return (
    <ScrollView
      className="flex-1 bg-dark-900"
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
    >
      {/* Header */}
      <View className="items-center mb-10">
        <View className="flex-row items-center gap-2.5 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 mb-5">
          <LiveDot />
          <Text className="text-xs text-emerald-300 font-semibold tracking-wide">
            Live on Remixr
          </Text>
        </View>
        <Text className="text-4xl font-extrabold text-white tracking-tight mb-3 text-center">
          You're live.
        </Text>
        <Text className="text-white/40 text-base text-center max-w-xs">
          Your music is out there. Here's what people will see when you share the link.
        </Text>
      </View>

      {/* Profile preview */}
      <View className="mb-2">
        {/* Listener view divider */}
        <View className="flex-row items-center gap-3 mb-3">
          <View className="flex-1 h-px bg-white/5" />
          <Text className="text-[10px] uppercase tracking-widest text-white/25 font-medium">
            Listener view
          </Text>
          <View className="flex-1 h-px bg-white/5" />
        </View>

        {isLoadingTrack ? (
          <View className="rounded-2xl bg-dark-800 border border-white/8 h-64 items-center justify-center">
            <ActivityIndicator size="small" color="rgba(255,255,255,0.2)" />
          </View>
        ) : (
          <ProfilePreview
            avatar={user.avatar ?? null}
            displayName={displayName}
            handle={handle}
            bio={user.bio ?? ''}
            genres={user.genres ?? []}
            track={track}
          />
        )}
      </View>

      {/* Share panel */}
      <View className="mt-6 gap-5">
        <View className="bg-dark-800 rounded-2xl p-5 gap-4 border border-dark-700">
          {/* URL display */}
          <View>
            <Text className="text-xs text-white/30 font-medium uppercase tracking-widest mb-2">
              Your shareable link
            </Text>
            <View className="flex-row items-center gap-2.5 px-4 py-3 rounded-xl bg-dark-700 border border-white/8">
              <View className="w-2 h-2 rounded-full bg-emerald-500" />
              <Text
                className="text-sm text-white/55 font-mono flex-1"
                numberOfLines={1}
                selectable
              >
                {profileUrl}
              </Text>
            </View>
          </View>

          {/* Share button */}
          <ShareButton url={profileUrl} title={`${displayName} on Remixr`} />

          {/* Secondary actions */}
          <View className="flex-row items-center gap-3 pt-1">
            <TouchableOpacity
              onPress={() => Linking.openURL(profileUrl)}
              className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/10"
            >
              <Music2 size={14} color="rgba(255,255,255,0.5)" />
              <Text className="text-sm text-white/50">View profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => Linking.openURL(tweetUrl)}
              className="w-10 h-10 rounded-xl border border-white/10 items-center justify-center"
            >
              <Twitter size={15} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={async () => {
                try {
                  await Share.share({ url: profileUrl, message: `${displayName} on Remixr` });
                } catch {}
              }}
              className="w-10 h-10 rounded-xl border border-white/10 items-center justify-center"
            >
              <Share2 size={15} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Upload another */}
        <TouchableOpacity
          onPress={() => navigation.navigate('OnboardingUpload')}
          className="items-center py-2"
        >
          <Text className="text-xs text-white/20 underline">Upload another track</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default OnboardingLive;
