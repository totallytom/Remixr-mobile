import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import { Music, Play, Pause, Plus, Check, X } from 'lucide-react-native';
import { useStore } from '../../store/useStore';

export interface Track {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
  audioUrl?: string;
  duration?: number;
  genre?: string;
}
import { MusicService } from '../../services/musicService';

interface ChatMusicShareProps {
  track: Track;
  onPlay?: (track: Track) => void;
}

const ChatMusicShare: React.FC<ChatMusicShareProps> = ({ track, onPlay }) => {
  const { player, playTrack, pauseTrack, user, playlists } = useStore();
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);

  const isCurrentlyPlaying = player.currentTrack?.id === track.id && player.isPlaying;
  const userPlaylists = playlists.filter((p: any) => p.createdBy === user?.id);

  const handleAddToPlaylist = async (playlistId: string) => {
    try {
      await MusicService.addTrackToPlaylist(playlistId, track.id);
      setAddedId(playlistId);
      setTimeout(() => {
        setAddedId(null);
        setShowPlaylistMenu(false);
      }, 1000);
    } catch (error: any) {
      const msg = error?.message ?? '';
      if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
        setAddedId(playlistId);
        setTimeout(() => { setAddedId(null); setShowPlaylistMenu(false); }, 1000);
      } else {
        console.error('Failed to add to playlist:', error);
      }
    }
  };

  const handlePlayPause = () => {
    if (isCurrentlyPlaying) {
      pauseTrack();
      return;
    }
    if (onPlay) {
      onPlay(track);
    } else {
      if (!track.audioUrl) {
        Alert.alert('Unavailable', 'No audio file available for this track.');
        return;
      }
      try {
        playTrack(track);
        if (user) {
          MusicService.recordPlayHistory(user.id, track.id, 0, false).catch(console.error);
        }
      } catch (error) {
        console.error('Failed to play track:', error);
        Alert.alert('Error', 'Failed to play track. Please try again.');
      }
    }
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.sharedLabel}>
          <View style={styles.musicIconWrapper}>
            <Music size={14} color="#fff" />
          </View>
          <View>
            <Text style={styles.sharedTitle}>Shared Track</Text>
            <Text style={styles.sharedSub}>via Music</Text>
          </View>
        </View>
      </View>

      {/* Track info */}
      <View style={styles.trackRow}>
        <View style={styles.coverWrapper}>
          {track.cover ? (
            <Image source={{ uri: track.cover }} style={styles.cover} resizeMode="cover" />
          ) : (
            <View style={styles.coverFallback}>
              <Music size={20} color="#6b7280" />
            </View>
          )}
        </View>
        <View style={styles.trackDetails}>
          <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
          <Text style={styles.trackArtist} numberOfLines={1}>{track.artist || 'Unknown Artist'}</Text>
          {track.album ? (
            <Text style={styles.trackAlbum} numberOfLines={1}>{track.album}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.divider} />

      {/* Actions */}
      <View style={styles.actions}>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.iconButton} onPress={handlePlayPause}>
            {isCurrentlyPlaying ? (
              <Pause size={10} color="#fff" />
            ) : (
              <Play size={10} color="#fff" />
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => setShowPlaylistMenu(true)}>
            <Plus size={10} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.availableRow}>
          <View style={styles.availableDot} />
          <Text style={styles.availableText}>Available</Text>
        </View>
      </View>

      {/* Playlist picker modal */}
      <Modal
        visible={showPlaylistMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPlaylistMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPlaylistMenu(false)}
        >
          <View style={styles.playlistSheet}>
            <View style={styles.playlistSheetHeader}>
              <Text style={styles.playlistSheetTitle}>Add to playlist</Text>
              <TouchableOpacity onPress={() => setShowPlaylistMenu(false)}>
                <X size={18} color="#6b6b8a" />
              </TouchableOpacity>
            </View>
            {userPlaylists.length === 0 ? (
              <Text style={styles.emptyText}>No playlists yet</Text>
            ) : (
              <FlatList
                data={userPlaylists}
                keyExtractor={(p: any) => p.id}
                renderItem={({ item: pl }: { item: any }) => {
                  const alreadyIn = pl.tracks?.some((t: any) => t.id === track.id);
                  return (
                    <TouchableOpacity
                      style={styles.playlistItem}
                      onPress={() => !alreadyIn && handleAddToPlaylist(pl.id)}
                      disabled={alreadyIn}
                    >
                      <Text style={[styles.playlistName, alreadyIn && styles.playlistNameDim]}>
                        {pl.name}
                      </Text>
                      {alreadyIn
                        ? <Check size={13} color="#6b7280" />
                        : addedId === pl.id
                          ? <Check size={13} color="#4ade80" />
                          : null}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0a0a14',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    width: 220,
  },
  cardHeader: {
    marginBottom: 10,
  },
  sharedLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  musicIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#ec4899',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  sharedSub: {
    fontSize: 11,
    color: '#9ca3af',
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  coverWrapper: {
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a3a',
    flexShrink: 0,
  },
  cover: {
    width: 56,
    height: 56,
  },
  coverFallback: {
    width: 56,
    height: 56,
    backgroundColor: '#1a1a28',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackDetails: {
    flex: 1,
    gap: 2,
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  trackArtist: {
    fontSize: 12,
    color: '#d1d5db',
  },
  trackAlbum: {
    fontSize: 11,
    color: '#6b7280',
  },
  divider: {
    height: 1,
    backgroundColor: '#374151',
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1a1a28',
    borderWidth: 1,
    borderColor: '#4b5563',
    alignItems: 'center',
    justifyContent: 'center',
  },
  availableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  availableDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  availableText: {
    fontSize: 11,
    color: '#9ca3af',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  playlistSheet: {
    backgroundColor: '#1a1a28',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '50%',
    borderWidth: 1,
    borderColor: '#2a2a3a',
  },
  playlistSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  playlistSheetTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  emptyText: {
    color: '#6b6b8a',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3a',
  },
  playlistName: {
    fontSize: 14,
    color: '#fff',
    flex: 1,
  },
  playlistNameDim: {
    color: '#6b7280',
  },
});

export default ChatMusicShare;
