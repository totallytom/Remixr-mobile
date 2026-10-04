import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text as RNText,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  ActivityIndicator,
  TextInput,
  Share,
  Platform,
  Linking,
  Alert,
  AppState,
  type TextProps,
} from 'react-native';
import { profileShareUrl, SITE_URL } from '../../utils/shareLinks';
import { Image } from 'expo-image';
import { FONTS } from '../../utils/fonts';
import { colors } from '../../theme'

const Text = ({ style, ...props }: TextProps) => (
  <RNText style={[{ fontFamily: FONTS.body }, style]} {...props} />
);
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { MaterialTopTabNavigationProp } from '@react-navigation/material-top-tabs';
import {
  Play,
  Clock,
  Star,
  List,
  Lock,
  FolderOpen,
  Search,
  Share2,
  Accessibility,
} from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import TrackCard from '../../components/music/TrackCard';
import type { Track } from '../../store/useStore';
import { MusicService } from '../../services/musicService';
import { AlbumService } from '../../services/albumService';
import type { Album } from '../../services/albumService';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '../../services/supabase';
import { isMusicianRole } from '../../utils/userRole';
import SubscriptionModal from '../../components/subscriptions/SubscriptionModal';
import { openSubscriptionManagement } from '../../services/revenueCatService';
import type { HomePagerParamList } from '../../navigation/HomePager';
import PagerHeader from '../../components/layout/PagerHeader';
import { setReduceMotion, useReduceMotion } from '../../hooks/useReduceMotion';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '../../utils/dateLocale';
import { requireAuth } from '../../components/auth/GuestPrompt';
import MoreAppsBanner from '../../components/promo/MoreAppsBanner';

type HomeNavProp = MaterialTopTabNavigationProp<HomePagerParamList, 'HomeMain'>;

const Home: React.FC = () => {
  const { playTrack, addToQueue, player, user } = useStore();
  const navigation = useNavigation<HomeNavProp>();
  const { t } = useTranslation();

  const [recentTracks, setRecentTracks] = useState<{ track: Track; playedAt: string }[]>([]);
  const [mostPlayedTracks, setMostPlayedTracks] = useState<{ track: Track; playCount: number }[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [subscriptionModalVisible, setSubscriptionModalVisible] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const eqBars = useRef(Array.from({ length: 7 }, () => new Animated.Value(0.15))).current;
  const reelRotation = useRef(new Animated.Value(0)).current;
  const tickerX = useRef(new Animated.Value(300)).current;
  const [tickerContainerW, setTickerContainerW] = useState(300);
  const logoX = useRef(new Animated.Value(20)).current;
  const logoY = useRef(new Animated.Value(20)).current;
  const bounceRef = useRef({ x: 20, y: 20, vx: 2, vy: 1.3 });
  const [tvScreenW, setTvScreenW] = useState(300);
  // Settings → Appearance → Reduce motion: the TV, ticker, reels and EQ hold still.
  const reduceMotion = useReduceMotion();


  // Load user-specific data
  useEffect(() => {
    if (!user) {
      setRecentTracks([]);
      setMostPlayedTracks([]);
      return;
    }

    let cancelled = false;

    const loadUserData = async () => {
      try {
        const [{ data: playHistory, error: playHistoryError }] = await Promise.all([
          supabase.from('user_play_history').select(`played_at, tracks:track_id (id, title, artist, album, cover, genre, audio_url, duration)`).eq('user_id', user.id).order('played_at', { ascending: false }).limit(50),
        ]);

        if (cancelled) return;

        if (playHistoryError) {
          console.error('Error fetching playHistory:', playHistoryError);
        } else {
          const uniqueRecent: { track: Track; playedAt: string }[] = [];
          const seen = new Set();
          for (const entry of playHistory || []) {
            const t = entry.tracks;
            if (t && !seen.has(t.id)) {
              uniqueRecent.push({
                track: {
                  id: t.id, title: t.title, artist: t.artist, album: t.album,
                  duration: t.duration ?? 0, cover: t.cover, genre: t.genre,
                  audioUrl: t.audio_url, boosted: false,
                },
                playedAt: entry.played_at,
              });
              seen.add(t.id);
            }
            if (uniqueRecent.length >= 8) break;
          }
          setRecentTracks(uniqueRecent);

          const playCountMap = new Map<string, { track: Track; playCount: number }>();
          for (const entry of playHistory || []) {
            const t = entry.tracks;
            if (t) {
              const id = t.id;
              if (!playCountMap.has(id)) {
                playCountMap.set(id, {
                  track: {
                    id: t.id, title: t.title, artist: t.artist, album: t.album,
                    duration: t.duration ?? 0, cover: t.cover, genre: t.genre,
                    audioUrl: t.audio_url, boosted: false,
                  },
                  playCount: 1,
                });
              } else {
                playCountMap.get(id)!.playCount += 1;
              }
            }
          }
          setMostPlayedTracks(
            Array.from(playCountMap.values()).sort((a, b) => b.playCount - a.playCount).slice(0, 8)
          );
        }
      } catch (err) {
        console.error('Failed to load user home data:', err);
        setRecentTracks([]);
        setMostPlayedTracks([]);
      }
    };

    loadUserData();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Load albums for musicians
  useEffect(() => {
    const loadAlbums = async () => {
      if (!user || !isMusicianRole(user.role)) {
        setAlbums([]);
        return;
      }
      try {
        const userAlbums = await AlbumService.getUserAlbums(user.id);
        setAlbums(userAlbums);
      } catch (err) {
        console.error('Failed to load albums:', err);
        setAlbums([]);
      }
    };
    loadAlbums();
  }, [user?.id]);

  // EQ bars animation
  useEffect(() => {
    if (!player.isPlaying) {
      eqBars.forEach(b => Animated.timing(b, { toValue: 0.15, duration: 300, useNativeDriver: false }).start());
      return;
    }
    if (reduceMotion) {
      // Still shows that something is playing, as a fixed level meter.
      eqBars.forEach((b, i) => b.setValue(0.35 + (i % 3) * 0.15));
      return;
    }
    const anims = eqBars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(bar, { toValue: 0.3 + (i % 3) * 0.15, duration: 100 + i * 40, useNativeDriver: false }),
          Animated.timing(bar, { toValue: 0.75 + (i % 2) * 0.2, duration: 80 + i * 25, useNativeDriver: false }),
          Animated.timing(bar, { toValue: 0.2 + (i % 4) * 0.12, duration: 110 + i * 20, useNativeDriver: false }),
        ]),
      ),
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, [player.isPlaying, reduceMotion]);

  // Cassette reel rotation
  useEffect(() => {
    if (player.isPlaying && !reduceMotion) {
      const anim = Animated.loop(
        Animated.timing(reelRotation, { toValue: 1, duration: 2500, easing: Easing.linear, useNativeDriver: true }),
      );
      reelRotation.setValue(0);
      anim.start();
      return () => anim.stop();
    }
  }, [player.isPlaying, reduceMotion]);

  // LED ticker scroll
  useEffect(() => {
    if (reduceMotion) {
      tickerX.setValue(8);
      return;
    }
    tickerX.setValue(tickerContainerW);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(tickerX, { toValue: -900, duration: 14000, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(tickerX, { toValue: tickerContainerW, duration: 0, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [tickerContainerW, reduceMotion]);

  // Bouncing DVD-style logo screensaver. Moves by elapsed time on animation
  // frames (capped per frame) and pauses whenever the app isn't active: the old
  // fixed-step 16ms setInterval got its ticks throttled while the app was being
  // swiped away / backgrounded, then fired them in a burst — the logo raced.
  useEffect(() => {
    if (player.currentTrack) return;
    const LOGO = 60;
    const maxX = tvScreenW - LOGO;
    const maxY = 200 - LOGO;
    // Reduce motion: the logo isn't shown at all (see render).
    if (reduceMotion) return;
    // px per ms — same speed as the old 2px / 1.3px per 16ms tick.
    bounceRef.current = { x: 20, y: 20, vx: 0.125, vy: 0.08 };
    logoX.setValue(20);
    logoY.setValue(20);

    let frame: number | null = null;
    let last: number | null = null;
    const step = (now: number) => {
      // Cap dt so a late frame can't jump the logo across the screen.
      const dt = last === null ? 0 : Math.min(now - last, 32);
      last = now;
      const b = bounceRef.current;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x <= 0 || b.x >= maxX) { b.vx *= -1; b.x = Math.max(0, Math.min(b.x, maxX)); }
      if (b.y <= 0 || b.y >= maxY) { b.vy *= -1; b.y = Math.max(0, Math.min(b.y, maxY)); }
      logoX.setValue(b.x);
      logoY.setValue(b.y);
      frame = requestAnimationFrame(step);
    };
    const start = () => {
      if (frame !== null) return;
      last = null;
      frame = requestAnimationFrame(step);
    };
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };

    if (AppState.currentState === 'active') start();
    // 'inactive' covers the app switcher / swipe-up gesture on iOS.
    const sub = AppState.addEventListener('change', (state) => (state === 'active' ? start() : stop()));
    return () => { stop(); sub.remove(); };
  }, [player.currentTrack, tvScreenW, reduceMotion]);

  const handlePlayTrack = (track: Track) => {
    playTrack(track);
    if (user) {
      const now = new Date().toISOString();
      setRecentTracks(prev => {
        const filtered = prev.filter(r => r.track.id !== track.id);
        return [{ track, playedAt: now }, ...filtered].slice(0, 8);
      });
      MusicService.recordPlayHistory(user.id, track.id, 0, false).catch(console.error);
    }
  };

  const handleAddToQueue = (track: Track) => {
    addToQueue(track);
  };

  // App subscribers manage through the App Store/Play Store; web (Stripe)
  // subscribers are told to manage it on the website.
  const handleManageSubscription = async () => {
    setSubscriptionError(null);
    try {
      const result = await openSubscriptionManagement();
      if (!result.handled && result.message) Alert.alert(t('home.manageSubscription'), result.message);
    } catch (err) {
      setSubscriptionError(err instanceof Error ? err.message : 'Could not open subscription settings');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }} edges={['top']}>
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32, backgroundColor: colors.background }}>

       <PagerHeader />

      {/* ── TV ── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
        {/* Outer shell */}
        <View style={{ backgroundColor: '#9ca3af', borderRadius: 14, borderWidth: 4, borderColor: '#374151', padding: 7 }}>
          {/* Screen bezel */}
          <View style={{ backgroundColor: '#6b7280', borderRadius: 9, padding: 3, marginBottom: 7 }}>
            {/* Screen */}
            <View style={{ backgroundColor: 'blue', borderRadius: 7, height: 200, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }} onLayout={e => setTvScreenW(e.nativeEvent.layout.width)}>
              {player.currentTrack ? (
                <>
                  <Image
                    source={{ uri: player.currentTrack.cover }}
                    style={{ position: 'absolute', width: '100%', height: '100%' }}
                    contentFit="cover"
                    accessibilityLabel={player.currentTrack.title}
                  />
                  <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }} numberOfLines={1}>{player.currentTrack.title}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }} numberOfLines={1}>{player.currentTrack.artist}</Text>
                  </View>
                  {player.isPlaying && (
                    <View style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#ef4444' }} />
                      <Text style={{ color: 'white', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>LIVE</Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  {/* Bouncing logo — hidden entirely with reduce motion */}
                  {!reduceMotion && <Animated.Image
                    source={require('../../../assets/logo.png')}
                    style={{ position: 'absolute', top: 0, left: 0, width: 60, height: 60, transform: [{ translateX: logoX }, { translateY: logoY }] }}
                    resizeMode="contain"
                  />}
                  {/* No track label */}
                  <Text style={{ color: 'white', fontSize: 11, fontWeight: '600', letterSpacing: 1, opacity: 0.5, position: 'absolute', bottom: 18 }}>
                    {t('home.noTrackLoaded')}
                  </Text>
                  {/* Color bars */}
                  <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row' }}>
                    {(['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'] as const).map((c, i) => (
                      <View key={i} style={{ flex: 1, height: 10, backgroundColor: c, opacity: 0.8 }} />
                    ))}
                  </View>
                </>
              )}
              {/* CRT scanlines overlay */}
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                {Array.from({ length: 50 }).map((_, i) => (
                  <View key={i} style={{ height: 2, backgroundColor: '#000', opacity: 0.07, marginBottom: 2 }} />
                ))}
              </View>
            </View>
          </View>

          {/* Control panel */}
          <View style={{ backgroundColor: '#9ca3af', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 6, gap: 5 }}>
            {/* Top row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                onPress={() => recentTracks.length > 0 && handlePlayTrack(recentTracks[0].track)}
                style={{ width: 30, height: 30, backgroundColor: '#6b7280', borderRadius: 5, borderWidth: 1.5, borderColor: '#4b5563', alignItems: 'center', justifyContent: 'center' }}
              >
                <List size={13} color="#d1d5db" />
              </TouchableOpacity>
              <View style={{ flex: 1, height: 28, backgroundColor: '#6b7280', borderRadius: 4, borderWidth: 1.5, borderColor: '#4b5563', justifyContent: 'center', paddingHorizontal: 8, overflow: 'hidden' }}>
                <View style={{ height: 1.5, backgroundColor: '#4b5563', marginBottom: 4 }} />
                <Text style={{ fontSize: 8, color: '#d1d5db', letterSpacing: 0.5 }} numberOfLines={1}>
                  {player.currentTrack ? `${player.currentTrack.title} — ${player.currentTrack.artist}` : '— — — — — — — — — — — — — — — —'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => player.currentTrack && playTrack(player.currentTrack)}
                style={{ width: 30, height: 30, backgroundColor: player.isPlaying ? '#4b5563' : '#6b7280', borderRadius: 5, borderWidth: 1.5, borderColor: '#4b5563', alignItems: 'center', justifyContent: 'center' }}
              >
                <Play size={13} color="#d1d5db" fill="#d1d5db" />
              </TouchableOpacity>
            </View>
            {/* EQ bars */}
            <View style={{ height: 22, backgroundColor: '#4b5563', borderRadius: 4, borderWidth: 1.5, borderColor: '#374151', marginHorizontal: 2, flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 3, paddingBottom: 2, gap: 2 }}>
              {eqBars.map((bar, i) => (
                <Animated.View
                  key={i}
                  style={{
                    flex: 1,
                    borderRadius: 1,
                    backgroundColor: (['#22c55e', '#4ade80', '#a3e635', '#eab308', '#f97316', '#ef4444', '#dc2626'] as const)[i],
                    height: bar.interpolate({ inputRange: [0, 1], outputRange: [3, 18] }),
                  }}
                />
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* ── LED Ticker ── */}
      <View
        style={{ marginHorizontal: 16, backgroundColor: '#0a0000', borderWidth: 1.5, borderTopWidth: 0, borderColor: '#374151', borderBottomLeftRadius: 8, borderBottomRightRadius: 8, height: 26, overflow: 'hidden', justifyContent: 'center' }}
        onLayout={e => setTickerContainerW(e.nativeEvent.layout.width)}
      >
        <Animated.View style={{ flexDirection: 'row', alignSelf: 'flex-start', transform: [{ translateX: tickerX }] }}>
          <Text style={{ color: '#ff3300', fontSize: 11, letterSpacing: 0.5 }}>
            {`   ★  ${player.currentTrack
              ? t('home.tickerNowPlaying', { title: player.currentTrack.title.toUpperCase(), artist: player.currentTrack.artist.toUpperCase() })
              : t('home.tickerWelcome')}   ★   `}
          </Text>
        </Animated.View>
      </View>

      {/* Reduce motion shortcut (same setting as Settings → Appearance) */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, alignItems: 'flex-end' }}>
        <TouchableOpacity
          onPress={() => setReduceMotion(!reduceMotion)}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityRole="switch"
          accessibilityState={{ checked: reduceMotion }}
          accessibilityLabel={t('settings.reduceMotion.title')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5, borderColor: reduceMotion ? '#111' : '#9ca3af', backgroundColor: reduceMotion ? '#111' : 'transparent' }}
        >
          <Accessibility size={13} color={reduceMotion ? '#fff' : '#4b5563'} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: reduceMotion ? '#fff' : '#4b5563' }}>
            {t(reduceMotion ? 'home.reduceMotionOn' : 'home.reduceMotionOff')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Cassette ── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
        <View style={{ backgroundColor: '#1c1917', borderRadius: 14, borderWidth: 2, borderColor: '#44403c', paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {/* Reel left */}
          <Animated.View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 3, borderColor: '#57534e', backgroundColor: '#292524', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: reelRotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
            {([0, 60, 120] as const).map(deg => (
              <View key={deg} style={{ position: 'absolute', width: 2, height: 20, backgroundColor: '#78716c', borderRadius: 1, transform: [{ rotate: `${deg}deg` }] }} />
            ))}
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#44403c', borderWidth: 1.5, borderColor: '#78716c' }} />
          </Animated.View>
          {/* Label */}
          <View style={{ flex: 1, backgroundColor: '#f5f0dc', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#d6c9a0' }}>
            <View style={{ height: 3, backgroundColor: '#ef4444', borderRadius: 2, marginBottom: 6 }} />
            <Text style={{ fontSize: 8, fontWeight: '700', color: '#1c1917', letterSpacing: 1.5 }} numberOfLines={1}>
              {(player.currentTrack?.title ?? t('home.noTrackLoaded')).toUpperCase()}
            </Text>
            <Text style={{ fontSize: 7, color: '#57534e', marginTop: 2, letterSpacing: 0.5 }} numberOfLines={1}>
              {player.currentTrack?.artist ?? '— — — —'}
            </Text>
            <View style={{ height: 2, backgroundColor: '#3b82f6', borderRadius: 1, marginTop: 6 }} />
          </View>
          {/* Reel right */}
          <Animated.View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 3, borderColor: '#57534e', backgroundColor: '#292524', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: reelRotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
            {([0, 60, 120] as const).map(deg => (
              <View key={deg} style={{ position: 'absolute', width: 2, height: 20, backgroundColor: '#78716c', borderRadius: 1, transform: [{ rotate: `${deg}deg` }] }} />
            ))}
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#44403c', borderWidth: 1.5, borderColor: '#78716c' }} />
          </Animated.View>
        </View>
      </View>

      {/* ── Menu ── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Recently Played */}
          <TouchableOpacity
            onPress={() => recentTracks.length > 0 && handlePlayTrack(recentTracks[0].track)}
            activeOpacity={0.75}
            style={{ flex: 1, backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: 'black', padding: 16, gap: 6 }}
          >
            <View style={{ width: 40, height: 40, backgroundColor: '#dbeafe', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
              <Clock size={20} color="#2563eb" />
            </View>
            <Text style={{ fontWeight: '700', fontSize: 14, color: '#111' }}>{t('home.recentlyPlayed')}</Text>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>{recentTracks.length > 0 ? t('home.tracks', { count: recentTracks.length }) : t('home.nothingYet')}</Text>
          </TouchableOpacity>

          {/* Search */}
          <TouchableOpacity
            onPress={() => navigation.navigate('Search')}
            activeOpacity={0.75}
            style={{ flex: 1, backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: 'black', padding: 16, gap: 6 }}
          >
            <View style={{ width: 40, height: 40, backgroundColor: '#fce7f3', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
              <Search size={20} color="#db2777" />
            </View>
            <Text style={{ fontWeight: '700', fontSize: 14, color: '#111' }}>{t('home.search')}</Text>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>{t('home.searchSubtitle')}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* Subscription CTA */}
          <TouchableOpacity
            onPress={user?.subscriptionTier && user.subscriptionTier !== 'free'
              ? handleManageSubscription
              : () => { if (requireAuth('subscribe')) setSubscriptionModalVisible(true); }}
            activeOpacity={0.75}
            style={{ flex: 1, backgroundColor: user?.subscriptionTier === 'artist' ? 'yellow' : 'white', borderRadius: 16, borderWidth: 1, borderColor: 'black', padding: 16, gap: 6 }}
          >
            <View style={{ width: 40, height: 40, backgroundColor: user?.subscriptionTier === 'artist' ? 'rgba(0,0,0,0.08)' : '#fef9c3', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
              <Star size={20} color={user?.subscriptionTier === 'artist' ? '#111' : '#ca8a04'} fill={user?.subscriptionTier === 'artist' ? '#111' : 'none'} />
            </View>
            <Text style={{ fontWeight: '700', fontSize: 14, color: '#111' }}>
              {user?.subscriptionTier === 'artist' ? t('home.artistActive')
                : user?.subscriptionTier === 'fan' ? t('home.fanActive')
                : t('home.subscribe')}
            </Text>
            <Text style={{ fontSize: 11, color: user?.subscriptionTier === 'artist' ? '#374151' : '#6b7280' }}>
              {user?.subscriptionTier && user.subscriptionTier !== 'free' ? t('home.manageSubscription') : t('home.subscribeSubtitle')}
            </Text>
            {subscriptionError ? (
              <Text style={{ fontSize: 10, color: '#ef4444', marginTop: 2 }} numberOfLines={1}>{subscriptionError}</Text>
            ) : null}
          </TouchableOpacity>

          {/* Share Profile */}
          <TouchableOpacity
            onPress={async () => {
              if (!requireAuth('profile')) return;
              try {
                const url = user ? profileShareUrl(user as any) : SITE_URL;
                const text = user?.username
                  ? t('home.shareMessage', { username: user.username })
                  : t('home.shareMessageNoName');
                // `url` gives iOS a link preview; Android only reads `message`.
                await Share.share(Platform.OS === 'ios' ? { message: text, url } : { message: `${text}
${url}` });
              } catch {}
            }}
            activeOpacity={0.75}
            style={{ flex: 1, backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: 'black', padding: 16, gap: 6 }}
          >
            <View style={{ width: 40, height: 40, backgroundColor: '#ede9fe', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
              <Share2 size={20} color="#7c3aed" />
            </View>
            <Text style={{ fontWeight: '700', fontSize: 14, color: '#111' }}>{t('home.shareProfile')}</Text>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>{t('home.shareProfileSubtitle')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Recently Played list ── */}
      {recentTracks.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
          <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: 'white', borderWidth: 1, borderColor: 'black' }}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: 'rgba(59,130,246,0.5)' }} />
            <View style={{ padding: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                  <Clock size={22} color="#60a5fa" strokeWidth={2} />
                </View>
                <View>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: 'black' }}>{t('home.recentlyPlayed')}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{t('home.recentlyPlayedSubtitle')}</Text>
                </View>
              </View>
              <View style={{ gap: 8 }}>
                {recentTracks.map(({ track, playedAt }) => (
                  <TouchableOpacity
                    key={track.id}
                    onPress={() => handlePlayTrack(track)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: 'rgba(17,17,17,0.04)', borderRadius: 12 }}
                  >
                    <Image
                      source={{ uri: track.cover }}
                      style={{ width: 48, height: 48, borderRadius: 10, flexShrink: 0 }}
                      contentFit="cover"
                      accessibilityLabel={track.title}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: 'black' }} numberOfLines={1}>{track.title}</Text>
                      <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }} numberOfLines={1}>
                        {track.artist}{track.album ? ` • ${track.album}` : ''}
                      </Text>
                      <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                        {t('home.played', { time: formatDistanceToNow(new Date(playedAt), { addSuffix: true, locale: dateLocale() }) })}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <TouchableOpacity
                        onPress={() => handlePlayTrack(track)}
                        style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Play size={13} color="white" fill="white" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleAddToQueue(track)} style={{ padding: 6 }}>
                        <List size={14} color="#9ca3af" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ── Top Album Chart (musicians only) ── */}
      {user?.role === 'musician' && albums.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <FolderOpen size={20} color="#fbbf24" />
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111' }}>{t('home.topAlbumChart')}</Text>
          </View>
          <Text style={{ color: '#6b7280', fontSize: 13, marginBottom: 14 }}>{t('home.latestReleases')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 12, paddingRight: 4 }}>
              {albums.map((album) => (
                <TouchableOpacity
                  key={album.id}
                  onPress={() => navigation.navigate('AlbumTracks', { albumId: album.id })}
                  style={{ width: 140, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1f2937', borderWidth: 1, borderColor: '#374151' }}
                >
                  <View style={{ paddingTop: 8, paddingHorizontal: 8 }}>
                    <View style={{ height: 8, width: 48, borderRadius: 4, backgroundColor: '#374151' }} />
                  </View>
                  <View style={{ margin: 8, borderRadius: 8, overflow: 'hidden', aspectRatio: 1 }}>
                    <Image source={{ uri: album.cover }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel={album.title} />
                  </View>
                  <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                    <Text style={{ color: 'white', fontWeight: '600' }} numberOfLines={1}>{album.title}</Text>
                    <Text style={{ color: '#9ca3af', fontSize: 12 }} numberOfLines={1}>{album.artist}</Text>
                    <Text style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>{t('home.tracks', { count: album.trackCount ?? 0 })}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── Our other apps ── */}
      <MoreAppsBanner style={{ marginHorizontal: 16, marginTop: 28 }} />

      <View style={{ height: 8 }} />

      <SubscriptionModal
        visible={subscriptionModalVisible}
        onClose={() => setSubscriptionModalVisible(false)}
      />
    </ScrollView>
    </SafeAreaView>
  );
};

export default Home;
