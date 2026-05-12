import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Plus,
  Search,
  Music,
  Users,
  Grid,
  List,
  PlusCircle,
  ListMusic,
  Play,
  X,
  Check,
  Mail,
  XCircle,
  Share2,
} from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import PlaylistCard from '../../components/music/PlaylistCard';
import type { Playlist, Track } from '../../store/useStore';
import { MusicService } from '../../services/musicService';
import type { PlaylistsStackParamList } from '../../navigation/stacks/PlaylistsStack';

type PlaylistsNavProp = NativeStackNavigationProp<PlaylistsStackParamList, 'Playlists'>;

const Playlists: React.FC = () => {
  const {
    user,
    playlists,
    setPlaylists,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    playPlaylist,
  } = useStore();

  const navigation = useNavigation<PlaylistsNavProp>();

  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddTrackModal, setShowAddTrackModal] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [availableTracks, setAvailableTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingPlaylist, setIsUpdatingPlaylist] = useState<string | null>(null);

  const [sharedPlaylists, setSharedPlaylists] = useState<Playlist[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [selectedInvitation, setSelectedInvitation] = useState<any | null>(null);
  const [showInvitationModal, setShowInvitationModal] = useState(false);

  const [createForm, setCreateForm] = useState({ name: '', description: '', isPublic: true });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    loadPlaylists();
  }, [user]);

  useEffect(() => {
    if (!user || pendingInvitations.length === 0 || showInvitationModal) return;
    if (pendingInvitations.length > 0 && !selectedInvitation) {
      setSelectedInvitation(pendingInvitations[0]);
      setShowInvitationModal(true);
    }
  }, [pendingInvitations.length, user]);

  const loadPlaylists = async () => {
    setIsLoading(true);
    try {
      if (user) {
        const [playlistsWithTracks, acceptedInvitations, pending] = await Promise.all([
          MusicService.getPlaylistsWithTracks(user.id),
          MusicService.getPlaylistInvitations(user.id, 'accepted'),
          MusicService.getPlaylistInvitations(user.id, 'pending'),
        ]);

        setPlaylists(playlistsWithTracks);
        setPendingInvitations(pending);

        if (acceptedInvitations.length > 0) {
          const sharedPlaylistsData = await Promise.all(
            acceptedInvitations.map(async (invitation: any) => {
              try {
                const sharedPlaylist = await MusicService.getPlaylistById(invitation.playlists.id);
                return { ...sharedPlaylist, isShared: true, invitationId: invitation.id };
              } catch (error) {
                console.error(`Failed to load shared playlist ${invitation.playlists.id}:`, error);
                return null;
              }
            })
          );
          setSharedPlaylists(sharedPlaylistsData.filter(p => p !== null) as Playlist[]);
        } else {
          setSharedPlaylists([]);
        }
      }
    } catch (error) {
      console.error('Failed to load playlists:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAvailableTracks = async () => {
    try {
      const tracks = await MusicService.getTracks();
      setAvailableTracks(tracks);
    } catch (error) {
      console.error('Failed to load tracks:', error);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!user || !createForm.name.trim()) return;
    setIsCreating(true);
    try {
      const newPlaylist = await MusicService.createPlaylist({
        name: createForm.name,
        description: createForm.description,
        isPublic: createForm.isPublic,
        createdBy: user.id,
      });
      setPlaylists([...playlists, newPlaylist]);
      setCreateForm({ name: '', description: '', isPublic: true });
      setShowCreateModal(false);
    } catch (error) {
      console.error('Failed to create playlist:', error);
      Alert.alert('Error', 'Failed to create playlist. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    if (!user) return;
    try {
      await MusicService.deletePlaylist(playlistId, user.id);
      deletePlaylist(playlistId);
      setPlaylists(playlists.filter(p => p.id !== playlistId));
    } catch (error) {
      console.error('Failed to delete playlist:', error);
      const msg = error instanceof Error ? error.message : 'Failed to delete playlist. Please try again.';
      Alert.alert('Error', msg);
    }
  };

  const handleUpdatePlaylist = async (playlistId: string, updates: any) => {
    if (!user) return;
    setIsUpdatingPlaylist(playlistId);
    try {
      await MusicService.updatePlaylist(playlistId, user.id, updates);
      await loadPlaylists();
    } catch (error) {
      console.error('Failed to update playlist:', error);
      Alert.alert('Error', 'Failed to update playlist. Please try again.');
    } finally {
      setIsUpdatingPlaylist(null);
    }
  };

  const handleAddTrackToPlaylist = async (playlistId: string, track: Track) => {
    try {
      await addTrackToPlaylist(playlistId, track);
      setShowAddTrackModal(false);
    } catch (error) {
      console.error('Failed to add track to playlist:', error);
      Alert.alert('Error', 'Failed to add track to playlist. Please try again.');
    }
  };

  const handleRemoveTrackFromPlaylist = async (playlistId: string, trackId: string) => {
    try {
      await removeTrackFromPlaylist(playlistId, trackId);
    } catch (error) {
      console.error('Failed to remove track from playlist:', error);
      Alert.alert('Error', 'Failed to remove track from playlist. Please try again.');
    }
  };

  const openAddTrackModal = (playlist: Playlist) => {
    setSelectedPlaylist(playlist);
    setShowAddTrackModal(true);
    loadAvailableTracks();
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}:${remaining.toString().padStart(2, '0')}`;
  };

  const safePlaylists = Array.isArray(playlists) ? playlists : [];
  const safeSharedPlaylists = Array.isArray(sharedPlaylists) ? sharedPlaylists : [];
  const allPlaylists = [...safePlaylists, ...safeSharedPlaylists];

  const filteredPlaylists = allPlaylists.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAcceptInvitation = async (invitation: any) => {
    if (!user) return;
    try {
      await MusicService.acceptPlaylistInvitation(invitation.id, user.id);
      const updatedPending = pendingInvitations.filter(inv => inv.id !== invitation.id);
      setPendingInvitations(updatedPending);
      if (updatedPending.length > 0) {
        setSelectedInvitation(updatedPending[0]);
      } else {
        setShowInvitationModal(false);
        setSelectedInvitation(null);
      }
      await loadPlaylists();
      Alert.alert('Success', 'Invitation accepted! The playlist is now available in your playlists.');
    } catch (error) {
      console.error('Failed to accept invitation:', error);
      Alert.alert('Error', `Failed to accept invitation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDeclineInvitation = async (invitationId: string) => {
    if (!user) return;
    try {
      await MusicService.declinePlaylistInvitation(invitationId, user.id);
      const updatedPending = pendingInvitations.filter(inv => inv.id !== invitationId);
      setPendingInvitations(updatedPending);
      if (updatedPending.length > 0) {
        setSelectedInvitation(updatedPending[0]);
      } else {
        setShowInvitationModal(false);
        setSelectedInvitation(null);
      }
    } catch (error) {
      console.error('Failed to decline invitation:', error);
      Alert.alert('Error', `Failed to decline invitation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handlePlaylistPress = (playlist: Playlist) => {
    navigation.navigate('PlaylistTracks', { playlistId: playlist.id });
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center gap-4">
        <ActivityIndicator size="large" color="#7c3aed" />
        <Text className="text-gray-500">Loading playlists...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-dark-900">

      {/* Header */}
      <View className="px-5 pt-6 pb-4 flex-row items-center justify-between gap-4">
        <View className="flex-1 min-w-0">
          <Text className="text-2xl font-bold text-white">My Playlists</Text>
          <Text className="text-gray-500 text-sm mt-0.5">Organize and enjoy your music collections</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowCreateModal(true)}
          className="flex-row items-center gap-2 px-4 py-2.5 bg-violet-600 rounded-full flex-shrink-0"
        >
          <PlusCircle size={16} color="white" />
          <Text className="text-white text-sm font-semibold">New</Text>
        </TouchableOpacity>
      </View>

      {/* Search + View Toggle */}
      <View className="px-5 pb-4 flex-row items-center gap-3">
        <View className="flex-1 flex-row items-center bg-dark-800 border border-dark-700/60 rounded-xl px-3">
          <Search size={16} color="#6b7280" />
          <TextInput
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Search playlists…"
            placeholderTextColor="#6b7280"
            className="flex-1 py-2 pl-2 text-white text-sm"
          />
        </View>
        <View className="flex-row items-center gap-1 bg-dark-800 border border-dark-700/60 rounded-xl p-1">
          <TouchableOpacity
            onPress={() => setViewMode('list')}
            className={`p-1.5 rounded-lg ${viewMode === 'list' ? 'bg-violet-600' : ''}`}
          >
            <List size={16} color={viewMode === 'list' ? 'white' : '#6b7280'} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewMode('grid')}
            className={`p-1.5 rounded-lg ${viewMode === 'grid' ? 'bg-violet-600' : ''}`}
          >
            <Grid size={16} color={viewMode === 'grid' ? 'white' : '#6b7280'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Pending Invitations Banner */}
      {pendingInvitations.length > 0 && (
        <View className="mx-5 mb-4 flex-row items-center justify-between gap-3 px-4 py-3 bg-blue-900/40 border border-blue-700/50 rounded-xl">
          <View className="flex-row items-center gap-3 flex-1 min-w-0">
            <Mail size={18} color="#60a5fa" />
            <View className="flex-1 min-w-0">
              <Text className="text-white text-sm font-medium" numberOfLines={1}>
                {pendingInvitations.length} pending invitation{pendingInvitations.length > 1 ? 's' : ''}
              </Text>
              <Text className="text-blue-300 text-xs">Tap to view and respond</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => { setSelectedInvitation(pendingInvitations[0]); setShowInvitationModal(true); }}
            className="px-3 py-1.5 bg-blue-600 rounded-full flex-shrink-0"
          >
            <Text className="text-white text-xs font-medium">View</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Playlist List */}
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 32 }}>
        {filteredPlaylists.length === 0 ? (
          <View className="items-center justify-center py-20 gap-4">
            <View className="w-16 h-16 bg-dark-800 rounded-full items-center justify-center">
              <ListMusic size={28} color="#4b5563" />
            </View>
            <View className="items-center">
              <Text className="text-white font-medium mb-1">No playlists yet</Text>
              <Text className="text-gray-500 text-sm">Create your first playlist to get started</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowCreateModal(true)}
              className="flex-row items-center gap-2 px-5 py-2.5 bg-violet-600 rounded-full"
            >
              <PlusCircle size={16} color="white" />
              <Text className="text-white text-sm font-semibold">Create Playlist</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="gap-2">
            {filteredPlaylists.map((playlist) => {
              const isShared = (playlist as any).isShared || safeSharedPlaylists.some(sp => sp.id === playlist.id);
              const isOwner = user && playlist.createdBy === user.id;
              return (
                <TouchableOpacity
                  key={playlist.id}
                  onPress={() => handlePlaylistPress(playlist)}
                  className="relative"
                >
                  {isShared && !isOwner && (
                    <View className="absolute top-2 right-2 z-10 flex-row items-center gap-1 px-2 py-0.5 bg-blue-600/80 rounded-full">
                      <Share2 size={10} color="white" />
                      <Text className="text-white text-xs font-semibold">Shared</Text>
                    </View>
                  )}
                  <PlaylistCard
                    playlist={playlist}
                    onPlay={playPlaylist}
                    onEdit={() => {}}
                    onDelete={isShared && !isOwner ? undefined : handleDeletePlaylist}
                    onAddTrack={openAddTrackModal}
                    onUpdatePlaylist={handleUpdatePlaylist}
                    onRemoveTrack={handleRemoveTrackFromPlaylist}
                    showActions={!!isOwner}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Create Playlist Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-dark-800 border border-dark-700/60 rounded-t-2xl">
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-700/60">
              <Text className="text-base font-semibold text-white">New Playlist</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)} className="p-1.5 rounded-lg">
                <X size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <View className="p-5 gap-4">
              <View>
                <Text className="text-xs font-medium text-gray-400 mb-1.5">Name</Text>
                <TextInput
                  value={createForm.name}
                  onChangeText={(v) => setCreateForm(prev => ({ ...prev, name: v }))}
                  className="w-full px-3 py-2.5 bg-dark-700 border border-dark-600 rounded-xl text-white text-sm"
                  placeholder="My awesome playlist"
                  placeholderTextColor="#6b7280"
                  autoFocus
                />
              </View>
              <View className="flex-row items-center justify-between py-1">
                <View>
                  <Text className="text-sm text-white font-medium">Public playlist</Text>
                  <Text className="text-xs text-gray-500">Anyone can find and listen</Text>
                </View>
                <Switch
                  value={createForm.isPublic}
                  onValueChange={(v) => setCreateForm(prev => ({ ...prev, isPublic: v }))}
                  trackColor={{ false: '#374151', true: '#7c3aed' }}
                  thumbColor="white"
                />
              </View>
            </View>
            <View className="px-5 pb-8 flex-row gap-2">
              <TouchableOpacity
                onPress={handleCreatePlaylist}
                disabled={isCreating || !createForm.name.trim()}
                className={`flex-1 py-2.5 rounded-xl items-center ${isCreating || !createForm.name.trim() ? 'bg-violet-600/40' : 'bg-violet-600'}`}
              >
                <Text className="text-white text-sm font-semibold">{isCreating ? 'Creating…' : 'Create'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowCreateModal(false)}
                className="flex-1 py-2.5 bg-dark-700 rounded-xl items-center"
              >
                <Text className="text-white text-sm">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Track Modal */}
      <Modal
        visible={showAddTrackModal && selectedPlaylist !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddTrackModal(false)}
      >
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-dark-800 border border-dark-700/60 rounded-t-2xl" style={{ maxHeight: '85%' }}>
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-700/60">
              <Text className="text-base font-semibold text-white" numberOfLines={1}>
                Add to "{selectedPlaylist?.name}"
              </Text>
              <TouchableOpacity onPress={() => setShowAddTrackModal(false)} className="p-1.5 rounded-lg">
                <X size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <ScrollView className="flex-1 px-3 py-3">
              {availableTracks.filter(t => !selectedPlaylist?.tracks.find(pt => pt.id === t.id)).length === 0 ? (
                <Text className="text-center text-gray-500 text-sm py-12">No tracks available to add.</Text>
              ) : (
                <View className="gap-1">
                  {availableTracks
                    .filter(t => !selectedPlaylist?.tracks.find(pt => pt.id === t.id))
                    .map((track) => (
                      <View key={track.id} className="flex-row items-center gap-3 px-3 py-2.5 rounded-lg">
                        <Image
                          source={{ uri: track.cover }}
                          className="w-10 h-10 rounded-md flex-shrink-0"
                          accessibilityLabel={track.title}
                        />
                        <View className="flex-1 min-w-0">
                          <Text className="text-white text-sm font-medium" numberOfLines={1}>{track.title}</Text>
                          <Text className="text-gray-500 text-xs" numberOfLines={1}>{track.artist}</Text>
                        </View>
                        <Text className="text-gray-600 text-xs mr-1">{formatDuration(track.duration)}</Text>
                        <TouchableOpacity
                          onPress={() => selectedPlaylist && handleAddTrackToPlaylist(selectedPlaylist.id, track)}
                          className="p-1.5 bg-violet-600 rounded-full flex-shrink-0"
                        >
                          <Plus size={14} color="white" />
                        </TouchableOpacity>
                      </View>
                    ))}
                </View>
              )}
            </ScrollView>
            <View className="px-5 py-4 border-t border-dark-700/60">
              <TouchableOpacity
                onPress={() => setShowAddTrackModal(false)}
                className="w-full py-2.5 bg-dark-700 rounded-xl items-center"
              >
                <Text className="text-white text-sm">Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Invitation Modal */}
      <Modal
        visible={showInvitationModal && selectedInvitation !== null}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowInvitationModal(false); setSelectedInvitation(null); }}
      >
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-dark-800 border border-dark-700/60 rounded-t-2xl">
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-700/60">
              <Text className="text-base font-semibold text-white">Playlist Invitation</Text>
              <TouchableOpacity
                onPress={() => { setShowInvitationModal(false); setSelectedInvitation(null); }}
                className="p-1.5 rounded-lg"
              >
                <X size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <View className="p-5">
              <Text className="text-gray-400 text-sm mb-4">You've been invited to collaborate on a playlist.</Text>
              <View className="flex-row items-center gap-4 p-4 bg-dark-700/60 rounded-xl mb-5">
                {selectedInvitation?.playlists?.cover && (
                  <Image
                    source={{ uri: selectedInvitation.playlists.cover }}
                    className="w-14 h-14 rounded-lg flex-shrink-0"
                    accessibilityLabel={selectedInvitation.playlists.name}
                  />
                )}
                <View className="flex-1 min-w-0">
                  <Text className="text-white font-semibold" numberOfLines={1}>
                    {selectedInvitation?.playlists?.name || 'Playlist'}
                  </Text>
                  <Text className="text-gray-400 text-sm" numberOfLines={1}>
                    Invited by {selectedInvitation?.inviter?.username || 'Unknown'}
                  </Text>
                </View>
              </View>
              <View className="flex-row gap-2 mb-3">
                <TouchableOpacity
                  onPress={() => handleAcceptInvitation(selectedInvitation)}
                  className="flex-1 flex-row items-center justify-center gap-2 py-2.5 bg-green-500 rounded-xl"
                >
                  <Check size={16} color="white" />
                  <Text className="text-white text-sm font-semibold">Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeclineInvitation(selectedInvitation.id)}
                  className="flex-1 flex-row items-center justify-center gap-2 py-2.5 bg-dark-700 rounded-xl"
                >
                  <XCircle size={16} color="#d1d5db" />
                  <Text className="text-gray-300 text-sm">Decline</Text>
                </TouchableOpacity>
              </View>
              {pendingInvitations.length > 1 && (
                <View className="pt-3 border-t border-dark-700/60 flex-row items-center justify-between">
                  <Text className="text-gray-500 text-xs">
                    {pendingInvitations.length - 1} more invitation{pendingInvitations.length - 1 > 1 ? 's' : ''} pending
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      const nextIndex = pendingInvitations.findIndex(inv => inv.id === selectedInvitation.id) + 1;
                      setSelectedInvitation(pendingInvitations[nextIndex < pendingInvitations.length ? nextIndex : 0]);
                    }}
                  >
                    <Text className="text-xs text-violet-400">Next →</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
};

export default Playlists;
