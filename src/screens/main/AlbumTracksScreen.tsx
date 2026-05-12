import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { Play, Clock, ArrowLeft } from 'lucide-react-native';
import { useStore, Track } from '../../store/useStore';
import { MusicService } from '../../services/musicService';
import { AlbumService, Album } from '../../services/albumService';
import { HomeStackParamList } from '../../navigation/stacks/HomeStack';

type AlbumTracksRoute = RouteProp<HomeStackParamList, 'AlbumTracks'>;

const FALLBACK_COVER = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(date: Date | string | undefined): string {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const AlbumTracksScreen: React.FC = () => {
  const route = useRoute<AlbumTracksRoute>();
  const navigation = useNavigation();
  const { albumId } = route.params;
  const { playTrack, playQueue } = useStore();

  const [album, setAlbum] = useState<Album | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const [albumData, albumTracks] = await Promise.all([
          AlbumService.getAlbumById(albumId),
          MusicService.getTracksByAlbum(albumId),
        ]);
        if (!cancelled) {
          setAlbum(albumData || null);
          setTracks(albumTracks || []);
        }
      } catch (error) {
        console.error('Failed to load album:', error);
        if (!cancelled) { setAlbum(null); setTracks([]); }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [albumId]);

  const albumCover =
    album?.cover ||
    (tracks.length > 0 ? tracks[0].cover : null) ||
    FALLBACK_COVER;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#7c3aed" />
          <Text style={styles.loadingText}>Loading album…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!album) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.notFoundTitle}>Album not found</Text>
          <TouchableOpacity style={styles.goBackButton} onPress={() => navigation.goBack()}>
            <Text style={styles.goBackText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderTrack = ({ item: track, index }: { item: Track; index: number }) => (
    <TouchableOpacity style={styles.trackRow} onPress={() => playTrack(track)} activeOpacity={0.7}>
      <Text style={styles.trackIndex}>{index + 1}</Text>

      <View style={styles.trackCoverWrapper}>
        <Image
          source={{ uri: track.cover || FALLBACK_COVER }}
          style={styles.trackCover}
          resizeMode="cover"
        />
      </View>

      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
        <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
      </View>

      <Text style={styles.trackDuration}>{formatDuration(track.duration)}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        renderItem={renderTrack}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No tracks in this album yet.</Text>
        }
        ListHeaderComponent={
          <>
            {/* Album header */}
            <View style={styles.header}>
              <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                <ArrowLeft size={24} color="#fff" />
              </TouchableOpacity>

              <Image
                source={{ uri: albumCover }}
                style={styles.albumCover}
                resizeMode="cover"
              />

              <Text style={styles.albumType}>Album</Text>
              <Text style={styles.albumTitle}>{album.title}</Text>
              <Text style={styles.albumArtist}>{album.artist}</Text>
              <View style={styles.albumMeta}>
                <Text style={styles.albumMetaText}>{album.genre}</Text>
                <Text style={styles.albumMetaDot}>·</Text>
                <Text style={styles.albumMetaText}>
                  {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
                </Text>
              </View>
            </View>

            {/* Controls */}
            <View style={styles.controls}>
              <TouchableOpacity
                style={[styles.playButton, tracks.length === 0 && styles.playButtonDisabled]}
                onPress={() => tracks.length > 0 && playTrack(tracks[0])}
                disabled={tracks.length === 0}
              >
                <Play size={24} color="#fff" fill="#fff" />
              </TouchableOpacity>

              {tracks.length > 1 && (
                <TouchableOpacity onPress={() => playQueue(tracks)}>
                  <Text style={styles.playAllText}>Play all ({tracks.length} tracks)</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Column header */}
            <View style={styles.colHeader}>
              <Text style={[styles.colHeaderText, styles.colIndex]}>#</Text>
              <Text style={[styles.colHeaderText, styles.colTitle]}>Title</Text>
              <Clock size={14} color="#6b7280" />
            </View>
          </>
        }
      />
    </SafeAreaView>
  );
};

const DARK = '#0a0a14';
const DARK2 = '#1a1a28';
const BORDER = '#2a2a3a';
const MUTED = '#6b6b8a';
const PURPLE = '#7c3aed';

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: DARK },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: MUTED, fontSize: 14, marginTop: 8 },
  notFoundTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  goBackButton: {
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: PURPLE, borderRadius: 10,
  },
  goBackText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Album header
  header: {
    alignItems: 'center',
    padding: 20,
    paddingTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: 'rgba(109,40,217,0.12)',
    gap: 6,
  },
  backButton: {
    alignSelf: 'flex-start',
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  albumCover: {
    width: 180, height: 180, borderRadius: 12,
    marginBottom: 8,
    backgroundColor: DARK2,
  },
  albumType: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, textTransform: 'uppercase' },
  albumTitle: { fontSize: 26, fontWeight: '700', color: '#fff', textAlign: 'center' },
  albumArtist: { fontSize: 14, color: '#d1d5db', textAlign: 'center' },
  albumMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  albumMetaText: { fontSize: 13, color: MUTED },
  albumMetaDot: { color: MUTED, fontSize: 13 },

  // Controls
  controls: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
    backgroundColor: DARK,
  },
  playButton: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: PURPLE,
    alignItems: 'center', justifyContent: 'center',
  },
  playButtonDisabled: { opacity: 0.4 },
  playAllText: { fontSize: 13, color: '#d1d5db' },

  // Column header
  colHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  colHeaderText: { fontSize: 11, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase' },
  colIndex: { width: 36 },
  colTitle: { flex: 1 },

  // Track rows
  trackRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, gap: 12,
    borderBottomWidth: 1, borderBottomColor: `${BORDER}80`,
  },
  trackIndex: { width: 24, textAlign: 'center', fontSize: 13, color: '#6b7280' },
  trackCoverWrapper: { width: 40, height: 40, borderRadius: 6, overflow: 'hidden', backgroundColor: DARK2 },
  trackCover: { width: 40, height: 40 },
  trackInfo: { flex: 1, minWidth: 0 },
  trackTitle: { fontSize: 14, fontWeight: '500', color: '#fff' },
  trackArtist: { fontSize: 12, color: MUTED, marginTop: 2 },
  trackDuration: { fontSize: 12, color: '#6b7280', minWidth: 40, textAlign: 'right' },

  emptyText: { textAlign: 'center', color: MUTED, fontSize: 14, paddingVertical: 40 },
});

export default AlbumTracksScreen;
