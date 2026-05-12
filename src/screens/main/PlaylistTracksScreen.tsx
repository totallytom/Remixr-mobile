import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
  TextInput,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Play,
  Pause,
  UserPlus,
  Clock,
  Plus,
  X,
  Search,
  Check,
  XCircle,
  Users,
  UserMinus,
  Mail,
} from 'lucide-react-native';
import { MusicService } from '../../services/musicService';
import { ChatService } from '../../services/chatService';
import { supabase } from '../../services/supabase';
import { getAvatarUrl } from '../../utils/avatar';
import { useStore } from '../../store/useStore';
import type { PlaylistsStackParamList } from '../../navigation/stacks/PlaylistsStack';

type RouteProps = RouteProp<PlaylistsStackParamList, 'PlaylistTracks'>;
type NavProps = NativeStackNavigationProp<PlaylistsStackParamList, 'PlaylistTracks'>;

const PlaylistTracksPage: React.FC = () => {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProps>();
  const { playlistId } = route.params;

  const { playlists, player, playTrack, playQueue, addToQueue, user, setPlaylists } = useStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isChangingCover, setIsChangingCover] = useState(false);
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [coverUrlInput, setCoverUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showAddTrackModal, setShowAddTrackModal] = useState(false);
  const [availableTracks, setAvailableTracks] = useState<any[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteSearchQuery, setInviteSearchQuery] = useState('');
  const [inviteSearchResults, setInviteSearchResults] = useState<any[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  const [hasAccess, setHasAccess] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);

  const [showCollaboratorsSection, setShowCollaboratorsSection] = useState(false);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [pendingInvitesSent, setPendingInvitesSent] = useState<any[]>([]);
  const [isLoadingCollaborators, setIsLoadingCollaborators] = useState(false);

  const playlist = playlists.find((p) => p.id === playlistId);
  const isOwner = user && playlist && user.id === playlist.createdBy;

  useEffect(() => {
    const checkAccess = async () => {
      if (!playlistId || !user) { setIsCheckingAccess(false); return; }
      setIsCheckingAccess(true);
      try {
        const access = await MusicService.hasPlaylistAccess(playlistId, user.id);
        setHasAccess(access);
      } catch (error) {
        console.error('Failed to check playlist access:', error);
        setHasAccess(false);
      } finally {
        setIsCheckingAccess(false);
      }
    };
    checkAccess();
  }, [playlistId, user]);

  useEffect(() => {
    const loadInvitations = async () => {
      if (!user || !playlistId) return;
      try {
        const invitations = await MusicService.getPlaylistInvitations(user.id, 'pending');
        setPendingInvitations(invitations.filter((inv: any) => inv.playlists?.id === playlistId));
      } catch (error) {
        console.error('Failed to load invitations:', error);
      }
    };
    loadInvitations();
  }, [user, playlistId]);

  useEffect(() => {
    const loadCollaborators = async () => {
      if (!playlistId || !isOwner || !user) return;
      setIsLoadingCollaborators(true);
      try {
        const [collabs, pending] = await Promise.all([
          MusicService.getPlaylistCollaborators(playlistId),
          MusicService.getPlaylistPendingInvitations(playlistId, user.id),
        ]);
        setCollaborators(collabs);
        setPendingInvitesSent(pending);
      } catch (error) {
        console.error('Failed to load collaborators:', error);
      } finally {
        setIsLoadingCollaborators(false);
      }
    };
    loadCollaborators();
  }, [playlistId, isOwner, user]);

  useEffect(() => {
    const fetchPlaylist = async () => {
      if (!playlistId) return;
      if (!playlist || playlist.tracks.length === 0) {
        setIsLoading(true);
        try {
          const fetched = await MusicService.getPlaylistById(playlistId);
          if (playlist) {
            setPlaylists(playlists.map(p => p.id === playlistId ? fetched : p));
          } else {
            setPlaylists([...playlists, fetched]);
          }
        } catch (error) {
          console.error('Failed to fetch playlist:', error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    };
    fetchPlaylist();
  }, [playlistId]);

  const loadAvailableTracks = async () => {
    setIsLoadingTracks(true);
    try {
      const tracks = await MusicService.getTracks();
      setAvailableTracks(tracks);
    } catch (error) {
      console.error('Failed to load tracks:', error);
    } finally {
      setIsLoadingTracks(false);
    }
  };

  const handleAddTrackToPlaylist = async (track: any) => {
    if (!playlist || !hasAccess) return;
    if (playlist.tracks.find((t: any) => t.id === track.id)) {
      Alert.alert('Duplicate', 'This track is already in the playlist');
      return;
    }
    try {
      await MusicService.addTrackToPlaylist(playlist.id, track.id);
      const updated = await MusicService.getPlaylistById(playlist.id);
      setPlaylists(playlists.map(p => p.id === playlist.id ? updated : p));
      setShowAddTrackModal(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('duplicate key') || message.includes('unique constraint')) {
        Alert.alert('Duplicate', 'Duplicated tracks!!');
        setShowAddTrackModal(false);
      } else {
        console.error('Failed to add track to playlist:', error);
        Alert.alert('Error', `Failed to add track: ${message}`);
      }
    }
  };

  const handleSearchUsers = async (query: string) => {
    if (!user || !query.trim()) { setInviteSearchResults([]); return; }
    setIsSearchingUsers(true);
    try {
      const results = await ChatService.searchUsers(query, user.id, 10);
      setInviteSearchResults(results);
    } catch (error) {
      console.error('Failed to search users:', error);
      setInviteSearchResults([]);
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const handleInviteUser = async (inviteeId: string) => {
    if (!playlist || !user || !playlistId) return;
    try {
      await MusicService.inviteUserToPlaylist(playlistId, user.id, inviteeId);
      Alert.alert('Success', 'Invitation sent successfully!');
      setInviteSearchQuery('');
      setInviteSearchResults([]);
      if (isOwner) {
        const [collabs, pending] = await Promise.all([
          MusicService.getPlaylistCollaborators(playlistId),
          MusicService.getPlaylistPendingInvitations(playlistId, user.id),
        ]);
        setCollaborators(collabs);
        setPendingInvitesSent(pending);
      }
    } catch (error) {
      console.error('Failed to send invitation:', error);
      Alert.alert('Error', `Failed to send invitation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleAcceptInvitation = async (invitationId: string) => {
    if (!user) return;
    try {
      await MusicService.acceptPlaylistInvitation(invitationId, user.id);
      setHasAccess(true);
      setPendingInvitations(prev => prev.filter(inv => inv.id !== invitationId));
      Alert.alert('Success', 'Invitation accepted! You can now collaborate on this playlist.');
    } catch (error) {
      console.error('Failed to accept invitation:', error);
      Alert.alert('Error', `Failed to accept invitation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDeclineInvitation = async (invitationId: string) => {
    if (!user) return;
    try {
      await MusicService.declinePlaylistInvitation(invitationId, user.id);
      setPendingInvitations(prev => prev.filter(inv => inv.id !== invitationId));
    } catch (error) {
      console.error('Failed to decline invitation:', error);
      Alert.alert('Error', `Failed to decline invitation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleRemoveCollaborator = (invitationId: string) => {
    Alert.alert(
      'Remove Collaborator',
      'Are you sure you want to remove this collaborator? They will lose access to this playlist.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!user || !isOwner || !playlistId) return;
            try {
              await MusicService.removeCollaborator(invitationId, user.id);
              const [collabs, pending] = await Promise.all([
                MusicService.getPlaylistCollaborators(playlistId),
                MusicService.getPlaylistPendingInvitations(playlistId, user.id),
              ]);
              setCollaborators(collabs);
              setPendingInvitesSent(pending);
              Alert.alert('Success', 'Collaborator removed successfully');
            } catch (error) {
              console.error('Failed to remove collaborator:', error);
              Alert.alert('Error', `Failed to remove collaborator: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          },
        },
      ]
    );
  };

  const handleRemoveTrack = async (trackId: string) => {
    if (!playlist || !hasAccess) return;
    try {
      await MusicService.removeTrackFromPlaylist(playlist.id, trackId);
      const updated = await MusicService.getPlaylistById(playlist.id);
      setPlaylists(playlists.map(p => p.id === playlist.id ? updated : p));
    } catch (error) {
      console.error('Failed to remove track:', error);
      Alert.alert('Error', `Failed to remove track: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!user || !isOwner || !playlistId) return;
    try {
      await MusicService.cancelInvitation(invitationId, user.id);
      const pending = await MusicService.getPlaylistPendingInvitations(playlistId, user.id);
      setPendingInvitesSent(pending);
      Alert.alert('Success', 'Invitation cancelled successfully');
    } catch (error) {
      console.error('Failed to cancel invitation:', error);
      Alert.alert('Error', `Failed to cancel invitation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleChangeCover = async (coverUrl: string) => {
    if (!user || !playlist) return;
    setIsChangingCover(true);
    try {
      await MusicService.updatePlaylist(playlist.id, user.id, { cover: coverUrl });
      setPlaylists(playlists.map(p => p.id === playlist.id ? { ...p, cover: coverUrl } : p));
      setShowCoverModal(false);
      setCoverUrlInput('');
    } catch (error) {
      console.error('Failed to update playlist cover:', error);
      Alert.alert('Error', 'Failed to update playlist cover. Please try again.');
    } finally {
      setIsChangingCover(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPlaylist = () => {
    if (playlist && playlist.tracks.length > 0) {
      playQueue(playlist.tracks);
      setIsPlaying(true);
    }
  };

  const handlePlayTrack = (track: any) => {
    playTrack(track);
    setIsPlaying(true);
  };

  const playlistCover = playlist?.cover ||
    (playlist && playlist.tracks.length > 0 ? playlist.tracks[0].cover : null) ||
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop';

  if ((isLoading || isCheckingAccess) && !playlist) {
    return (
      <View className="flex-1 bg-dark-900 items-center justify-center">
        <ActivityIndicator size="large" color="white" />
        <Text className="text-white mt-4">Loading playlist...</Text>
      </View>
    );
  }

  if (!playlist) {
    return (
      <View className="flex-1 bg-dark-900 items-center justify-center p-8">
        <Text className="text-white text-2xl font-bold mb-4">Playlist Not Found</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="px-4 py-2 bg-violet-600 rounded-lg"
        >
          <Text className="text-white">Back to Playlists</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!hasAccess && !isOwner) {
    return (
      <View className="flex-1 bg-dark-900 items-center justify-center p-8">
        <Text className="text-white text-2xl font-bold mb-4">Access Denied</Text>
        <Text className="text-gray-400 mb-4 text-center">You don't have access to this playlist.</Text>
        {pendingInvitations.length > 0 && (
          <View className="gap-3 mb-6 w-full">
            <Text className="text-gray-300 text-center">You have a pending invitation:</Text>
            {pendingInvitations.map((invitation: any) => (
              <View key={invitation.id} className="flex-row items-center justify-center gap-4">
                <TouchableOpacity
                  onPress={() => handleAcceptInvitation(invitation.id)}
                  className="px-4 py-2 bg-green-500 rounded-lg"
                >
                  <Text className="text-white">Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeclineInvitation(invitation.id)}
                  className="px-4 py-2 bg-red-500 rounded-lg"
                >
                  <Text className="text-white">Decline</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="px-4 py-2 bg-violet-600 rounded-lg"
        >
          <Text className="text-white">Back to Playlists</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-dark-900">
      <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>

        {/* Hero Header */}
        <View className="bg-violet-950/80 px-5 pt-10 pb-6">
          <View className="items-center mb-5">
            <TouchableOpacity
              onPress={() => isOwner && setShowCoverModal(true)}
              className="w-44 h-44 rounded-xl overflow-hidden bg-dark-700"
              disabled={!isOwner}
            >
              <Image
                source={{ uri: playlistCover }}
                className="w-full h-full"
                accessibilityLabel="Playlist Cover"
              />
              {isOwner && (
                <View className="absolute inset-0 bg-black/50 items-center justify-center gap-1">
                  <Plus size={22} color="white" />
                  <Text className="text-white text-xs font-medium">Change cover</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View className="items-center">
            <Text className="text-xs uppercase tracking-widest text-violet-400 font-semibold mb-1">Playlist</Text>
            <Text className="text-3xl font-bold text-white text-center mb-2">{playlist.name}</Text>
            <View className="flex-row items-center gap-2 mb-5 flex-wrap justify-center">
              <Text className="text-sm text-gray-400">
                {playlist.tracks.length} {playlist.tracks.length === 1 ? 'track' : 'tracks'}
              </Text>
              {!playlist.isPublic && (
                <View className="px-2 py-0.5 bg-violet-600/30 rounded-full border border-violet-600/40">
                  <Text className="text-violet-300 text-xs">Private</Text>
                </View>
              )}
            </View>

            {/* Action Buttons */}
            <View className="flex-row flex-wrap gap-2 justify-center">
              <TouchableOpacity
                onPress={handlePlayPlaylist}
                disabled={playlist.tracks.length === 0}
                className={`flex-row items-center gap-2 px-5 py-2.5 rounded-full ${playlist.tracks.length === 0 ? 'bg-violet-600/40' : 'bg-violet-600'}`}
              >
                <Play size={16} color="white" fill="white" />
                <Text className="text-white font-semibold text-sm">Play</Text>
              </TouchableOpacity>
              {hasAccess && (
                <TouchableOpacity
                  onPress={() => { setShowAddTrackModal(true); loadAvailableTracks(); }}
                  className="flex-row items-center gap-2 px-4 py-2.5 bg-dark-700/80 rounded-full border border-dark-500/60"
                >
                  <Plus size={15} color="white" />
                  <Text className="text-white text-sm">Add tracks</Text>
                </TouchableOpacity>
              )}
              {isOwner && (
                <>
                  <TouchableOpacity
                    onPress={() => setShowInviteModal(true)}
                    className="flex-row items-center gap-2 px-4 py-2.5 bg-dark-700/80 rounded-full border border-dark-500/60"
                  >
                    <UserPlus size={15} color="white" />
                    <Text className="text-white text-sm">Invite</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowCollaboratorsSection(!showCollaboratorsSection)}
                    className={`flex-row items-center gap-2 px-4 py-2.5 rounded-full border ${
                      showCollaboratorsSection
                        ? 'bg-violet-600/30 border-violet-500/50'
                        : 'bg-dark-700/80 border-dark-500/60'
                    }`}
                  >
                    <Users size={15} color={showCollaboratorsSection ? '#c4b5fd' : 'white'} />
                    <Text className={`text-sm ${showCollaboratorsSection ? 'text-violet-300' : 'text-white'}`}>
                      {collaborators.length > 0
                        ? `${collaborators.length} collaborator${collaborators.length !== 1 ? 's' : ''}`
                        : 'Collaborators'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Pending Invitation Banner */}
        {pendingInvitations.length > 0 && !hasAccess && (
          <View className="mx-4 mt-4 mb-2 gap-3 px-4 py-3 bg-blue-900/40 border border-blue-700/50 rounded-xl">
            <Text className="text-sm text-white font-medium">
              You have a pending invitation to collaborate on this playlist.
            </Text>
            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                onPress={() => handleAcceptInvitation(pendingInvitations[0].id)}
                className="flex-row items-center gap-1.5 px-3 py-1.5 bg-green-500 rounded-lg"
              >
                <Check size={14} color="white" />
                <Text className="text-white text-sm">Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDeclineInvitation(pendingInvitations[0].id)}
                className="flex-row items-center gap-1.5 px-3 py-1.5 bg-dark-700 rounded-lg"
              >
                <XCircle size={14} color="#d1d5db" />
                <Text className="text-gray-300 text-sm">Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Collaborators Panel */}
        {isOwner && showCollaboratorsSection && (
          <View className="mx-4 mt-2 mb-4 bg-dark-800/60 border border-dark-700/60 rounded-xl overflow-hidden">
            <View className="px-5 py-4 border-b border-dark-700/60 flex-row items-center gap-2">
              <Users size={16} color="#a78bfa" />
              <Text className="text-sm font-semibold text-white">Collaborators</Text>
            </View>
            {isLoadingCollaborators ? (
              <View className="flex-row items-center justify-center py-8 gap-3">
                <ActivityIndicator size="small" color="#a78bfa" />
                <Text className="text-gray-400 text-sm">Loading…</Text>
              </View>
            ) : (
              <View className="p-4 gap-4">
                {/* Active */}
                <View>
                  <View className="flex-row items-center gap-1.5 mb-2">
                    <Check size={12} color="#4ade80" />
                    <Text className="text-xs uppercase tracking-widest text-gray-500 font-medium">
                      Active · {collaborators.length}
                    </Text>
                  </View>
                  {collaborators.length === 0 ? (
                    <Text className="text-gray-500 text-sm py-2">No active collaborators yet.</Text>
                  ) : (
                    <View className="gap-1.5">
                      {collaborators.map((c: any) => (
                        <View key={c.id} className="flex-row items-center justify-between gap-3 px-3 py-2.5 bg-dark-700/50 rounded-lg">
                          <View className="flex-row items-center gap-3 flex-1 min-w-0">
                            <Image
                              source={{ uri: getAvatarUrl(c.avatar) }}
                              className="w-8 h-8 rounded-full flex-shrink-0"
                              accessibilityLabel={c.username}
                            />
                            <Text className="text-white text-sm font-medium flex-1" numberOfLines={1}>{c.username}</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleRemoveCollaborator(c.invitationId)}
                            className="flex-row items-center gap-1.5 px-3 py-1.5 bg-red-500/20 rounded-lg flex-shrink-0"
                          >
                            <UserMinus size={12} color="#f87171" />
                            <Text className="text-red-400 text-xs">Remove</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* Pending */}
                {pendingInvitesSent.length > 0 && (
                  <View>
                    <View className="flex-row items-center gap-1.5 mb-2">
                      <Mail size={12} color="#facc15" />
                      <Text className="text-xs uppercase tracking-widest text-gray-500 font-medium">
                        Pending · {pendingInvitesSent.length}
                      </Text>
                    </View>
                    <View className="gap-1.5">
                      {pendingInvitesSent.map((inv: any) => (
                        <View key={inv.invitationId} className="flex-row items-center justify-between gap-3 px-3 py-2.5 bg-dark-700/50 rounded-lg">
                          <View className="flex-row items-center gap-3 flex-1 min-w-0">
                            <Image
                              source={{ uri: getAvatarUrl(inv.avatar) }}
                              className="w-8 h-8 rounded-full flex-shrink-0"
                              accessibilityLabel={inv.username}
                            />
                            <View className="flex-1 min-w-0">
                              <Text className="text-white text-sm font-medium" numberOfLines={1}>{inv.username}</Text>
                              <Text className="text-gray-500 text-xs">
                                Invited {new Date(inv.createdAt).toLocaleDateString()}
                              </Text>
                            </View>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleCancelInvitation(inv.invitationId)}
                            className="flex-row items-center gap-1.5 px-3 py-1.5 bg-dark-600 rounded-lg flex-shrink-0"
                          >
                            <X size={12} color="#9ca3af" />
                            <Text className="text-gray-400 text-xs">Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Track List */}
        <View className="px-4 mt-2">
          {playlist.tracks.length === 0 ? (
            <View className="items-center justify-center py-20 gap-4">
              <Text className="text-4xl">🎵</Text>
              <Text className="text-gray-400 text-sm">No tracks yet</Text>
              {hasAccess && (
                <TouchableOpacity
                  onPress={() => { setShowAddTrackModal(true); loadAvailableTracks(); }}
                  className="flex-row items-center gap-2 px-4 py-2 bg-violet-600 rounded-full"
                >
                  <Plus size={15} color="white" />
                  <Text className="text-white text-sm">Add your first track</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View className="gap-0.5">
              {playlist.tracks.map((track: any, index: number) => (
                <TouchableOpacity
                  key={track.id}
                  onPress={() => handlePlayTrack(track)}
                  className="flex-row items-center gap-3 px-3 py-2.5 rounded-lg"
                >
                  <Text className="text-gray-500 text-sm w-6 text-center flex-shrink-0">{index + 1}</Text>
                  <Image
                    source={{ uri: track.cover }}
                    className="w-10 h-10 rounded-md flex-shrink-0"
                    accessibilityLabel={track.title}
                  />
                  <View className="flex-1 min-w-0">
                    <Text className="text-white text-sm font-medium" numberOfLines={1}>{track.title}</Text>
                    <Text className="text-gray-500 text-xs" numberOfLines={1}>{track.artist}</Text>
                  </View>
                  <Text className="text-gray-500 text-sm flex-shrink-0">{formatDuration(track.duration)}</Text>
                  {hasAccess && (
                    <TouchableOpacity
                      onPress={() => handleRemoveTrack(track.id)}
                      className="p-1.5 flex-shrink-0"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={14} color="#6b7280" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

      </ScrollView>

      {/* Add Track Modal */}
      <Modal
        visible={showAddTrackModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddTrackModal(false)}
      >
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-dark-800 border border-dark-700/60 rounded-t-2xl" style={{ maxHeight: '85%' }}>
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-700/60">
              <Text className="text-base font-semibold text-white" numberOfLines={1}>
                Add to "{playlist?.name}"
              </Text>
              <TouchableOpacity onPress={() => setShowAddTrackModal(false)} className="p-1.5 rounded-lg">
                <X size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <ScrollView className="flex-1 px-3 py-3">
              {isLoadingTracks ? (
                <View className="flex-row items-center justify-center py-12 gap-3">
                  <ActivityIndicator size="small" color="#a78bfa" />
                  <Text className="text-gray-400 text-sm">Loading tracks…</Text>
                </View>
              ) : availableTracks.filter(t => !playlist?.tracks.find((pt: any) => pt.id === t.id)).length === 0 ? (
                <Text className="text-center text-gray-500 text-sm py-12">No tracks available to add.</Text>
              ) : (
                <View className="gap-1">
                  {availableTracks
                    .filter(t => !playlist?.tracks.find((pt: any) => pt.id === t.id))
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
                          onPress={() => handleAddTrackToPlaylist(track)}
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

      {/* Cover Change Modal */}
      <Modal
        visible={showCoverModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCoverModal(false)}
      >
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-dark-800 border border-dark-700/60 rounded-t-2xl">
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-700/60">
              <Text className="text-base font-semibold text-white">Change cover</Text>
              <TouchableOpacity onPress={() => setShowCoverModal(false)} className="p-1.5 rounded-lg">
                <X size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <View className="p-5 gap-5">
              {/* URL input */}
              <View>
                <Text className="text-xs font-medium text-gray-400 mb-2">Paste image URL</Text>
                <View className="flex-row gap-2">
                  <TextInput
                    value={coverUrlInput}
                    onChangeText={setCoverUrlInput}
                    placeholder="https://example.com/image.jpg"
                    placeholderTextColor="#6b7280"
                    className="flex-1 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm"
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                  <TouchableOpacity
                    onPress={() => { if (coverUrlInput) handleChangeCover(coverUrlInput); }}
                    disabled={isChangingCover || !coverUrlInput}
                    className={`px-4 py-2 rounded-lg items-center justify-center ${isChangingCover || !coverUrlInput ? 'bg-violet-600/40' : 'bg-violet-600'}`}
                  >
                    {isChangingCover ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text className="text-white text-sm">Apply</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Track covers */}
              {playlist.tracks.length > 0 && (
                <View>
                  <Text className="text-xs font-medium text-gray-400 mb-2">Use a track cover</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {playlist.tracks.slice(0, 10).map((track: any, i: number) => (
                      <TouchableOpacity
                        key={track.id}
                        onPress={() => handleChangeCover(track.cover)}
                        disabled={isChangingCover}
                        className="rounded-lg overflow-hidden"
                        style={{ width: 56, height: 56 }}
                      >
                        <Image
                          source={{ uri: track.cover }}
                          style={{ width: 56, height: 56 }}
                          accessibilityLabel={`Track ${i + 1}`}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Invite Modal */}
      <Modal
        visible={showInviteModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowInviteModal(false); setInviteSearchQuery(''); setInviteSearchResults([]); }}
      >
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-dark-800 border border-dark-700/60 rounded-t-2xl" style={{ maxHeight: '70%' }}>
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-700/60">
              <Text className="text-base font-semibold text-white">Invite collaborators</Text>
              <TouchableOpacity
                onPress={() => { setShowInviteModal(false); setInviteSearchQuery(''); setInviteSearchResults([]); }}
                className="p-1.5 rounded-lg"
              >
                <X size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <View className="p-4 flex-1">
              <View className="flex-row items-center bg-dark-700 border border-dark-600 rounded-xl px-3 mb-3">
                <Search size={16} color="#6b7280" />
                <TextInput
                  value={inviteSearchQuery}
                  onChangeText={(v) => { setInviteSearchQuery(v); handleSearchUsers(v); }}
                  placeholder="Search by username…"
                  placeholderTextColor="#6b7280"
                  className="flex-1 py-2.5 pl-2 text-white text-sm"
                />
              </View>
              <ScrollView className="flex-1">
                {isSearchingUsers ? (
                  <View className="flex-row items-center justify-center py-8 gap-2">
                    <ActivityIndicator size="small" color="#a78bfa" />
                    <Text className="text-gray-400 text-sm">Searching…</Text>
                  </View>
                ) : inviteSearchResults.length === 0 ? (
                  <Text className="text-center text-gray-500 text-sm py-8">
                    {inviteSearchQuery ? 'No users found' : 'Search for users to invite'}
                  </Text>
                ) : (
                  <View className="gap-1">
                    {inviteSearchResults.map((u: any) => (
                      <View key={u.id} className="flex-row items-center justify-between gap-3 px-3 py-2.5 rounded-lg">
                        <View className="flex-row items-center gap-3 flex-1 min-w-0">
                          <Image
                            source={{ uri: getAvatarUrl(u.avatar) }}
                            className="w-9 h-9 rounded-full flex-shrink-0"
                            accessibilityLabel={u.username}
                          />
                          <View className="flex-1 min-w-0">
                            <Text className="text-white text-sm font-medium" numberOfLines={1}>{u.username}</Text>
                            {u.artistName && (
                              <Text className="text-gray-500 text-xs" numberOfLines={1}>{u.artistName}</Text>
                            )}
                          </View>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleInviteUser(u.id)}
                          className="px-3 py-1.5 bg-violet-600 rounded-full flex-shrink-0"
                        >
                          <Text className="text-white text-xs font-medium">Invite</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
};

export default PlaylistTracksPage;
