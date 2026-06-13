import React, { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  const [addTrackSearch, setAddTrackSearch] = useState('');
  const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set());

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteSearchQuery, setInviteSearchQuery] = useState('');
  const [inviteSearchResults, setInviteSearchResults] = useState<any[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [recentlyInvited, setRecentlyInvited] = useState<Set<string>>(new Set());
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
    if (playlist.tracks.find((t: any) => t.id === track.id) || recentlyAdded.has(track.id)) return;
    try {
      await MusicService.addTrackToPlaylist(playlist.id, track.id);
      setRecentlyAdded(prev => new Set(prev).add(track.id));
      const updated = await MusicService.getPlaylistById(playlist.id);
      setPlaylists(playlists.map(p => p.id === playlist.id ? updated : p));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (!message.includes('duplicate key') && !message.includes('unique constraint')) {
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
    if (recentlyInvited.has(inviteeId)) return;
    try {
      await MusicService.inviteUserToPlaylist(playlistId, user.id, inviteeId);
      setRecentlyInvited(prev => new Set(prev).add(inviteeId));
      if (isOwner) {
        const [collabs, pending] = await Promise.all([
          MusicService.getPlaylistCollaborators(playlistId),
          MusicService.getPlaylistPendingInvitations(playlistId, user.id),
        ]);
        setCollaborators(collabs);
        setPendingInvitesSent(pending);
      }
    } catch (error) {
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
      <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }} edges={['top']}>
      <View className="flex-1 bg-dark-900 items-center justify-center">
        <ActivityIndicator size="large" color="white" />
        <Text className="text-white mt-4">Loading playlist...</Text>
      </View>
      </SafeAreaView>
    );
  }

  if (!playlist) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }} edges={['top']}>
      <View className="flex-1 bg-dark-900 items-center justify-center p-8">
        <Text className="text-white text-2xl font-bold mb-4">Playlist Not Found</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="px-4 py-2 bg-violet-600 rounded-lg"
        >
          <Text className="text-white">Back to Playlists</Text>
        </TouchableOpacity>
      </View>
      </SafeAreaView>
    );
  }

  if (!hasAccess && !isOwner) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }} edges={['top']}>
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
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }} edges={['top']}>
    <View className="flex-1 bg-dark-900">
      <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>

        {/* Hero Header */}
        <View className="bg-violet-950/80 px-5 pt-5 pb-4">
          <View className="flex-row items-center gap-4 mb-4">
            {/* Cover — smaller so buttons aren't pushed off screen */}
            <TouchableOpacity
              onPress={() => isOwner && setShowCoverModal(true)}
              className="w-24 h-24 rounded-xl overflow-hidden bg-dark-700 flex-shrink-0"
              disabled={!isOwner}
            >
              <Image
                source={{ uri: playlistCover }}
                className="w-full h-full"
                accessibilityLabel="Playlist Cover"
              />
              {isOwner && (
                <View className="absolute inset-0 bg-black/50 items-center justify-center gap-0.5">
                  <Plus size={16} color="white" />
                  <Text className="text-white text-[10px] font-medium">Change</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Title + meta */}
            <View className="flex-1 min-w-0">
              <Text className="text-xs uppercase tracking-widest text-violet-400 font-semibold mb-0.5">Playlist</Text>
              <Text className="text-xl font-bold text-white" numberOfLines={2}>{playlist.name}</Text>
              <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                <Text className="text-sm text-gray-400">
                  {playlist.tracks.length} {playlist.tracks.length === 1 ? 'track' : 'tracks'}
                </Text>
                {!playlist.isPublic && (
                  <View className="px-2 py-0.5 bg-violet-600/30 rounded-full border border-violet-600/40">
                    <Text className="text-violet-300 text-xs">Private</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View className="flex-row flex-wrap gap-2">
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

      {/* Add Track Modal — Spotify style */}
      <Modal
        visible={showAddTrackModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowAddTrackModal(false); setAddTrackSearch(''); setRecentlyAdded(new Set()); }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#121212', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '88%' }}>

            {/* Handle bar */}
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            </View>

            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Add to playlist</Text>
              <TouchableOpacity
                onPress={() => { setShowAddTrackModal(false); setAddTrackSearch(''); setRecentlyAdded(new Set()); }}
                style={{ padding: 6 }}
              >
                <X size={22} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>

            {/* Search bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingHorizontal: 12, height: 40 }}>
              <Search size={16} color="rgba(255,255,255,0.5)" />
              <TextInput
                value={addTrackSearch}
                onChangeText={setAddTrackSearch}
                placeholder="Search songs or artists"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={{ flex: 1, marginLeft: 8, color: '#fff', fontSize: 14 }}
                autoCapitalize="none"
              />
              {addTrackSearch.length > 0 && (
                <TouchableOpacity onPress={() => setAddTrackSearch('')}>
                  <X size={14} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              )}
            </View>

            {/* Track list */}
            {isLoadingTracks ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <ActivityIndicator size="large" color="#1DB954" />
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading tracks…</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
                {availableTracks
                  .filter(t => {
                    const q = addTrackSearch.toLowerCase();
                    return !q || t.title?.toLowerCase().includes(q) || t.artist?.toLowerCase().includes(q);
                  })
                  .map((track) => {
                    const alreadyIn = !!(playlist?.tracks.find((pt: any) => pt.id === track.id)) || recentlyAdded.has(track.id);
                    return (
                      <View key={track.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 }}>
                        <Image
                          source={{ uri: track.cover }}
                          style={{ width: 48, height: 48, borderRadius: 4, backgroundColor: '#1f2937', flexShrink: 0 }}
                          resizeMode="cover"
                          accessibilityLabel={track.title}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ color: alreadyIn ? 'rgba(255,255,255,0.4)' : '#fff', fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
                            {track.title}
                          </Text>
                          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                            {track.artist}
                          </Text>
                        </View>
                        {alreadyIn ? (
                          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#1DB954', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Check size={14} color="#000" strokeWidth={3} />
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => handleAddTrackToPlaylist(track)}
                            style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                            activeOpacity={0.7}
                          >
                            <Plus size={14} color="rgba(255,255,255,0.7)" strokeWidth={2.5} />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                {availableTracks.filter(t => {
                  const q = addTrackSearch.toLowerCase();
                  return !q || t.title?.toLowerCase().includes(q) || t.artist?.toLowerCase().includes(q);
                }).length === 0 && (
                  <View style={{ alignItems: 'center', paddingTop: 48 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>No results for "{addTrackSearch}"</Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Cover Change Modal */}
      <Modal
        visible={showCoverModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCoverModal(false)}
      >
        <View className="flex-1 bg-black/70 items-center justify-center px-4">
          <View className="bg-dark-800 border border-dark-700/60 rounded-2xl w-full">
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

      {/* Invite Modal — Spotify style */}
      <Modal
        visible={showInviteModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowInviteModal(false); setInviteSearchQuery(''); setInviteSearchResults([]); setRecentlyInvited(new Set()); }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#121212', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '88%' }}>

            {/* Handle bar */}
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            </View>

            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
              <View>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Invite collaborators</Text>
                <Text style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12, marginTop: 2 }}>
                  They can add and remove tracks
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { setShowInviteModal(false); setInviteSearchQuery(''); setInviteSearchResults([]); setRecentlyInvited(new Set()); }}
                style={{ padding: 6 }}
              >
                <X size={22} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>

            {/* Search bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingHorizontal: 12, height: 40 }}>
              <Search size={16} color="rgba(255,255,255,0.5)" />
              <TextInput
                value={inviteSearchQuery}
                onChangeText={(v) => { setInviteSearchQuery(v); handleSearchUsers(v); }}
                placeholder="Search by username"
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={{ flex: 1, marginLeft: 8, color: '#fff', fontSize: 14 }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {inviteSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setInviteSearchQuery(''); setInviteSearchResults([]); }}>
                  <X size={14} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              )}
            </View>

            {/* Results */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
              {isSearchingUsers ? (
                <View style={{ flex: 1, alignItems: 'center', paddingTop: 48, gap: 10 }}>
                  <ActivityIndicator size="large" color="#a78bfa" />
                  <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Searching…</Text>
                </View>
              ) : inviteSearchResults.length === 0 ? (
                <View style={{ alignItems: 'center', paddingTop: 56 }}>
                  <Users size={48} color="#374151" strokeWidth={1.5} />
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 16 }}>
                    {inviteSearchQuery ? 'No users found' : 'Find people to collaborate'}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 }}>
                    {inviteSearchQuery ? `No results for "${inviteSearchQuery}"` : 'Search for a username above'}
                  </Text>
                </View>
              ) : (
                inviteSearchResults.map((u: any) => {
                  const isCollaborator = collaborators.some((c: any) => c.id === u.id);
                  const invited = recentlyInvited.has(u.id) || pendingInvitesSent.some((p: any) => p.id === u.id);
                  return (
                    <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 }}>
                      <Image
                        source={{ uri: getAvatarUrl(u.avatar) }}
                        style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#1f2937', flexShrink: 0 }}
                        accessibilityLabel={u.username}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
                          {u.username}
                        </Text>
                        {u.artistName ? (
                          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 1 }} numberOfLines={1}>
                            {u.artistName}
                          </Text>
                        ) : null}
                      </View>
                      {isCollaborator ? (
                        <View style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}>
                          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600' }}>Collaborator</Text>
                        </View>
                      ) : invited ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(167,139,250,0.15)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)' }}>
                          <Check size={12} color="#a78bfa" strokeWidth={3} />
                          <Text style={{ color: '#a78bfa', fontSize: 12, fontWeight: '600' }}>Invited</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => handleInviteUser(u.id)}
                          activeOpacity={0.7}
                          style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: '#fff' }}
                        >
                          <Text style={{ color: '#000', fontSize: 12, fontWeight: '700' }}>Invite</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
    </SafeAreaView>
  );
};

export default PlaylistTracksPage;
