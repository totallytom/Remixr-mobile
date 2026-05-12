import React from 'react';
import { View, Text, Image, TouchableOpacity, Alert } from 'react-native';
import { Play, Edit3, Trash2, Music, Calendar } from 'lucide-react-native';
import { Album } from '../../services/albumService';
import { useStore } from '../../store/useStore';

interface AlbumCardProps {
  album: Album;
  onPlay?: (album: Album) => void;
  onOpen?: (album: Album) => void;
  onEdit?: (album: Album) => void;
  onDelete?: (albumId: string) => void;
  showActions?: boolean;
  compact?: boolean;
}

const AlbumCard: React.FC<AlbumCardProps> = ({
  album,
  onPlay,
  onOpen,
  onEdit,
  onDelete,
  showActions = true,
  compact = false,
}) => {
  const { user } = useStore();
  const isOwner = user?.id === album.userId;

  const confirmDelete = () => {
    Alert.alert(
      'Delete Album',
      `Are you sure you want to delete "${album.title}"? This cannot be undone and will also remove all associated tracks.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => onDelete?.(album.id),
        },
      ],
    );
  };

  if (compact) {
    return (
      <TouchableOpacity
        onPress={() => onOpen?.(album)}
        activeOpacity={onOpen ? 0.7 : 1}
        className="flex-row items-center gap-3 bg-dark-800 rounded-lg p-3"
      >
        <Image
          source={{ uri: album.cover }}
          className="w-12 h-12 rounded-md"
          resizeMode="cover"
        />
        <View className="flex-1 min-w-0">
          <Text className="text-white font-medium" numberOfLines={1}>{album.title}</Text>
          <Text className="text-dark-400 text-sm" numberOfLines={1}>{album.artist}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          {onPlay && (
            <TouchableOpacity
              onPress={() => onPlay(album)}
              className="p-2 bg-primary-600 rounded-full"
              activeOpacity={0.8}
            >
              <Play size={16} color="#fff" />
            </TouchableOpacity>
          )}
          {showActions && isOwner && (
            <>
              {onEdit && (
                <TouchableOpacity onPress={() => onEdit(album)} className="p-2" activeOpacity={0.7}>
                  <Edit3 size={16} color="#6b7280" />
                </TouchableOpacity>
              )}
              {onDelete && (
                <TouchableOpacity onPress={confirmDelete} className="p-2" activeOpacity={0.7}>
                  <Trash2 size={16} color="#f87171" />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={() => onOpen?.(album)}
      activeOpacity={onOpen ? 0.85 : 1}
      className="bg-dark-800 rounded-lg overflow-hidden"
    >
      {/* Cover */}
      <View className="relative aspect-square">
        <Image
          source={{ uri: album.cover }}
          className="w-full h-full"
          resizeMode="cover"
        />
        {onPlay && (
          <TouchableOpacity
            onPress={() => onPlay(album)}
            className="absolute inset-0 items-center justify-center bg-black/50"
            activeOpacity={0.8}
          >
            <Play size={48} color="#fff" />
          </TouchableOpacity>
        )}
        {album.price != null && (
          <View className="absolute top-2 right-2 bg-primary-600 px-2 py-1 rounded-full">
            <Text className="text-white text-sm font-medium">${album.price}</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View className="p-4">
        <Text className="text-white font-semibold text-lg mb-1" numberOfLines={1}>{album.title}</Text>
        <Text className="text-dark-300 mb-2" numberOfLines={1}>{album.artist}</Text>

        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-1">
            <Music size={14} color="#6b7280" />
            <Text className="text-dark-400 text-sm">{album.trackCount ?? 0} tracks</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Calendar size={14} color="#6b7280" />
            <Text className="text-dark-400 text-sm">{new Date(album.createdAt).getFullYear()}</Text>
          </View>
        </View>

        {album.description ? (
          <Text className="text-dark-400 text-sm mb-3" numberOfLines={2}>{album.description}</Text>
        ) : null}

        <View className="flex-row items-center justify-between">
          <View className="px-2 py-1 bg-dark-700 rounded-full">
            <Text className="text-primary-400 text-xs">{album.genre}</Text>
          </View>

          {showActions && isOwner && (
            <View className="flex-row items-center gap-1">
              {onEdit && (
                <TouchableOpacity onPress={() => onEdit(album)} className="p-2" activeOpacity={0.7}>
                  <Edit3 size={16} color="#6b7280" />
                </TouchableOpacity>
              )}
              {onDelete && (
                <TouchableOpacity onPress={confirmDelete} className="p-2" activeOpacity={0.7}>
                  <Trash2 size={16} color="#f87171" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default AlbumCard;
