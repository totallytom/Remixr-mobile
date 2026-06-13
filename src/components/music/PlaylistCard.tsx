import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import {
  Play,
  MoreVertical,
  Plus,
  Trash2,
  Edit3,
  Save,
  X,
} from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { AuthService } from '../../services/authService';
import { MusicService } from '../../services/musicService';

// ─── Local types (Playlist / Track not exported from store) ───────────────────
interface Track {
  id: string;
  title: string;
  artist?: string;
  cover?: string;
  duration: number;
  audioUrl?: string;
  genre?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  cover?: string;
  tracks: Track[];
  createdBy: string;
  collaborators: string[];
  isPublic: boolean;
}

interface PlaylistCardProps {
  playlist: Playlist;
  onPlay?: (playlist: Playlist) => void;
  onEdit?: (playlist: Playlist) => void;
  onDelete?: (playlistId: string) => void;
  onAddTrack?: (playlist: Playlist) => void;
  onUpdatePlaylist?: (playlistId: string, updates: { name: string }) => Promise<void>;
  onRemoveTrack?: (playlistId: string, trackId: string) => void;
  showActions?: boolean;
  compact?: boolean;
}

const DEFAULT_COVER = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop';

const PlaylistCard: React.FC<PlaylistCardProps> = ({
  playlist,
  onPlay,
  onEdit,
  onDelete,
  onAddTrack,
  onUpdatePlaylist,
  showActions = true,
  compact = false,
}) => {
  const { user, playQueue, playlists, setPlaylists, deletePlaylist } = useStore();

  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(playlist.name);
  const [isUpdating, setIsUpdating] = useState(false);

  const isOwner = user?.id === playlist.createdBy;
  const canEdit = isOwner || playlist.collaborators?.includes(user?.id ?? '');

  const coverUri =
    playlist.cover ||
    (playlist.tracks.length > 0 ? playlist.tracks[0].cover : null) ||
    DEFAULT_COVER;

  // ── Play ──────────────────────────────────────────────────────────────────
  const handlePlay = () => {
    if (onPlay) onPlay(playlist);
    else playQueue(playlist.tracks);
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const openEdit = () => {
    setEditName(playlist.name);
    setShowMenu(false);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    setIsUpdating(true);
    try {
      if (onUpdatePlaylist) {
        await onUpdatePlaylist(playlist.id, { name: editName.trim() });
      } else {
        await MusicService.updatePlaylist(playlist.id, playlist.createdBy, { name: editName.trim() });
        const updated = playlists.map((p: Playlist) =>
          p.id === playlist.id ? { ...p, name: editName.trim() } : p,
        );
        setPlaylists(updated);
      }
      setIsEditing(false);
    } catch {
      Alert.alert('Error', 'Failed to update playlist. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = () => {
    setShowMenu(false);
    Alert.alert(
      'Delete Playlist',
      `Are you sure you want to delete "${playlist.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => {
            if (onDelete) onDelete(playlist.id);
            else deletePlaylist(playlist.id);
          },
        },
      ],
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <View
        className={`flex-row items-center gap-3 rounded-lg overflow-hidden p-3 border-l-4 border-l-violet-500 bg-violet-500/10 w-full${compact ? '' : ''}`}
      >
        {/* Cover */}
        <View className="relative w-12 h-12 flex-shrink-0 rounded-md overflow-hidden bg-dark-700">
          <Image
            source={{ uri: coverUri }}
            className="w-full h-full"
            resizeMode="cover"
          />
          {/* Track count badge */}
          <View className="absolute top-0.5 left-0.5 bg-black/70 px-1.5 py-0.5 rounded">
            <Text className="text-white text-xs font-medium">{playlist.tracks.length}</Text>
          </View>
          {!playlist.isPublic && (
            <View className="absolute top-0.5 right-0.5 bg-violet-600 px-1 rounded">
              <Text className="text-white" style={{ fontSize: 9 }}>Private</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View className="flex-1 min-w-0">
          <Text className="text-white font-semibold text-sm" numberOfLines={1}>
            {playlist.name}
          </Text>
          <Text className="text-dark-400 text-xs" numberOfLines={1}>
            {playlist.tracks.length} track{playlist.tracks.length !== 1 ? 's' : ''}
            {playlist.description ? ` • ${playlist.description}` : ''}
          </Text>
        </View>

        {/* Actions */}
        <View className="flex-row items-center gap-1 flex-shrink-0">
          <TouchableOpacity
            onPress={handlePlay}
            className="p-2 bg-primary-600 rounded-full"
            activeOpacity={0.8}
          >
            <Play size={15} color="#fff" fill="#fff" />
          </TouchableOpacity>

          {showActions && (canEdit || onAddTrack) && (
            <TouchableOpacity
              onPress={() => setShowMenu(true)}
              className="p-2 rounded-full"
              activeOpacity={0.7}
            >
              <MoreVertical size={15} color="#6b7280" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Bottom-sheet options menu ── */}
      <Modal
        visible={showMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMenu(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/60 justify-end"
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View className="bg-dark-800 border border-dark-600 rounded-t-2xl p-5 gap-1">
            <Text className="text-white font-semibold text-base mb-3" numberOfLines={1}>
              {playlist.name}
            </Text>

            {canEdit && (
              <TouchableOpacity
                onPress={openEdit}
                className="flex-row items-center gap-3 py-3 border-b border-dark-700"
                activeOpacity={0.7}
              >
                <Edit3 size={16} color="#d1d5db" />
                <Text className="text-white text-sm">Edit name</Text>
              </TouchableOpacity>
            )}

            {onAddTrack && (
              <TouchableOpacity
                onPress={() => { setShowMenu(false); onAddTrack(playlist); }}
                className="flex-row items-center gap-3 py-3 border-b border-dark-700"
                activeOpacity={0.7}
              >
                <Plus size={16} color="#d1d5db" />
                <Text className="text-white text-sm">Add tracks</Text>
              </TouchableOpacity>
            )}

            {canEdit && (
              <TouchableOpacity
                onPress={handleDelete}
                className="flex-row items-center gap-3 py-3"
                activeOpacity={0.7}
              >
                <Trash2 size={16} color="#f87171" />
                <Text className="text-red-400 text-sm">Delete playlist</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => setShowMenu(false)}
              className="mt-2 py-3 items-center bg-dark-700 rounded-xl"
              activeOpacity={0.8}
            >
              <Text className="text-white/60 text-sm font-medium">Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Edit name modal ── */}
      <Modal
        visible={isEditing}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEditing(false)}
      >
        <View className="flex-1 bg-black/60 items-center justify-center p-6">
          <View className="w-full bg-dark-800 border border-dark-600 rounded-2xl p-6 gap-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-white font-bold text-lg">Edit Playlist</Text>
              <TouchableOpacity onPress={() => setIsEditing(false)} activeOpacity={0.7}>
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View>
              <Text className="text-sm text-dark-300 mb-2">Playlist name</Text>
              <TextInput
                value={editName}
                onChangeText={setEditName}
                placeholder="Playlist name"
                placeholderTextColor="rgba(255,255,255,0.25)"
                className="w-full px-3 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-white"
                autoFocus
              />
            </View>

            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={handleSaveEdit}
                disabled={isUpdating || !editName.trim()}
                className={`flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-lg bg-violet-600 ${isUpdating || !editName.trim() ? 'opacity-50' : ''}`}
                activeOpacity={0.8}
              >
                {isUpdating
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Save size={15} color="#fff" />}
                <Text className="text-white font-semibold text-sm">
                  {isUpdating ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setIsEditing(false)}
                className="px-4 py-2.5 rounded-lg bg-dark-700"
                activeOpacity={0.8}
              >
                <Text className="text-white text-sm">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

export default PlaylistCard;
