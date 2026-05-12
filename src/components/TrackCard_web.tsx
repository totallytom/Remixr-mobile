import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Play, 
  Pause, 
  Share2, 
  MoreVertical,
  Music,
  Zap,
  ZapOff,
  X,
  MessageCircle,
  Search,
  Plus,
  Bookmark,
  ThumbsUp,
  List,
  RefreshCw
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { Track } from '../store/useStore';
import { MusicService } from '../services/musicService';
//import { BoostService } from '../../services/boostService';
import { ChatService } from '../services/chatService';
//import CommentSection from './CommentSection';
import { createPortal } from 'react-dom';
import { getAvatarUrl } from '../utils/avatar';
import VerifiedBadge from './VerifiedBadge';

/** Fallback when a track has no cover (e.g. older uploads or upload path that didn't set cover). */
const DEFAULT_TRACK_COVER = 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop';

interface TrackCardProps {
  track: Track;
  onPlay?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  isPlaying?: boolean;
  showActions?: boolean;
  showBoostActions?: boolean;
  compact?: boolean;
  /** Compact vertical card for search grid: square image, minimal text */
  compactGrid?: boolean;
  onDelete?: (track: Track) => void;
}

const TrackCard: React.FC<TrackCardProps> = ({ 
  track, 
  onPlay, 
  onAddToQueue,
  isPlaying = false,
  showActions = true,
  showBoostActions = true,
  compact = false,
  compactGrid = false,
  onDelete
}) => {
  const { 
    player, 
    playTrack, 
    addToQueue, 
    playlists,
    setPlaylists,
    user,
    isAuthenticated
  } = useStore();
  const navigate = useNavigate();
  
  //const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isCheckingBookmark, setIsCheckingBookmark] = useState(false);
  const [isBoosting, setIsBoosting] = useState(false);
  const [boostError, setBoostError] = useState<string | null>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [likesCount, setLikesCount] = useState(0);
  const [isLikedByUser, setIsLikedByUser] = useState(false);
  const [isLoadingLikes, setIsLoadingLikes] = useState(false);
  
  // Create playlist state
  const [showCreatePlaylistForm, setShowCreatePlaylistForm] = useState(false);
  const [createPlaylistForm, setCreatePlaylistForm] = useState({
    name: '',
    isPublic: true
  });
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);

  // Check if track is bookmarked on mount
  useEffect(() => {
    const checkBookmarkStatus = async () => {
      if (!user || !track) return;
      
      setIsCheckingBookmark(true);
      try {
        const bookmarked = await MusicService.isTrackBookmarked(track.id, user.id);
        setIsLiked(bookmarked);
      } catch (error) {
        console.error('Failed to check bookmark status:', error);
      } finally {
        setIsCheckingBookmark(false);
      }
    };

    checkBookmarkStatus();
  }, [user, track]);

  // Load track likes on mount
  useEffect(() => {
    const loadTrackLikes = async () => {
      if (!track) return;
      
      setIsLoadingLikes(true);
      try {
        const { likes, likedBy } = await MusicService.getTrackLikes(track.id);
        setLikesCount(likes);
        if (user) {
          setIsLikedByUser(likedBy.includes(user.id));
        }
      } catch (error) {
        console.error('Failed to load track likes:', error);
        // If the error is because likes column doesn't exist, just set defaults
        setLikesCount(0);
        setIsLikedByUser(false);
      } finally {
        setIsLoadingLikes(false);
      }
    };

    loadTrackLikes();
  }, [track, user]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (isCurrentlyPlaying) {
      player.audioElement?.pause();
      // Immediately update isPlaying in the store for instant UI feedback
      player.isPlaying = false;
    } else {
      if (onPlay) {
        onPlay(track);
      } else {
        playTrack(track);
      }
    }
  };

  const handleAddToQueue = () => {
    if (onAddToQueue) {
      onAddToQueue(track);
    } else {
      addToQueue(track);
    }
  };

  const handleLike = async () => {
    if (!user) return;
    
    try {
      if (isLiked) {
        // Remove bookmark
        await MusicService.removeBookmark(track.id, user.id);
        setIsLiked(false);
      } else {
        // Add bookmark
        await MusicService.addBookmark(track.id, user.id);
        setIsLiked(true);
      }
      // Dispatch event to notify other components (like Profile page) that bookmarks changed
      window.dispatchEvent(new CustomEvent('bookmarkChanged', { 
        detail: { trackId: track.id, userId: user.id, bookmarked: !isLiked }
      }));
    } catch (error) {
      console.error('Failed to toggle bookmark:', error);
      // Revert state on error
      setIsLiked(!isLiked);
    }
  };

  const handleTrackLike = async () => {
    if (!user) return;
    
    // Optimistic update
    const previousLikesCount = likesCount;
    const previousIsLiked = isLikedByUser;
    
    if (isLikedByUser) {
      setLikesCount((prev: number) => Math.max(0, prev - 1));
      setIsLikedByUser(false);
    } else {
      setLikesCount((prev: number) => prev + 1);
      setIsLikedByUser(true);
    }
    
    try {
      await MusicService.likeTrack(track.id, user.id);
      // Reload to get accurate count
      const { likes, likedBy } = await MusicService.getTrackLikes(track.id);
      setLikesCount(likes);
      setIsLikedByUser(likedBy.includes(user.id));
      window.dispatchEvent(new CustomEvent('likedChanged', { detail: { trackId: track.id, userId: user.id } }));
    } catch (error) {
      console.error('Failed to like/unlike track:', error);
      // Revert on error
      setLikesCount(previousLikesCount);
      setIsLikedByUser(previousIsLiked);
    }
  };

  const handleAddToPlaylist = async (playlistId: string) => {
    try {
      await MusicService.addTrackToPlaylist(playlistId, track.id);
      setShowMenu(false);
    } catch (error) {
      console.error('Failed to add track to playlist:', error);
      alert(`Failed to add track to playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Load playlists when modal opens (own playlists + shared playlists)
  useEffect(() => {
    const loadPlaylists = async () => {
      if (showPlaylistModal && user) {
        try {
          // Load user's own playlists with full track data
          const userPlaylists = await MusicService.getPlaylists(user.id);
          const userPlaylistsWithTracks = await Promise.all(
            userPlaylists.map(async (playlist) => {
              try {
                const fullPlaylist = await MusicService.getPlaylistById(playlist.id);
                return fullPlaylist;
              } catch (error) {
                console.error(`Failed to load tracks for playlist ${playlist.id}:`, error);
                return playlist;
              }
            })
          );
          
          // Load shared playlists (accepted invitations) with full track data
          const acceptedInvitations = await MusicService.getPlaylistInvitations(user.id, 'accepted');
          const sharedPlaylistsData = await Promise.all(
            acceptedInvitations.map(async (invitation) => {
              try {
                const sharedPlaylist = await MusicService.getPlaylistById(invitation.playlists.id);
                return { ...sharedPlaylist, isShared: true, invitationId: invitation.id };
              } catch (error) {
                console.error(`Failed to load shared playlist ${invitation.playlists.id}:`, error);
                return null;
              }
            })
          );
          const sharedPlaylists = sharedPlaylistsData.filter(p => p !== null);
          
          // Combine own playlists and shared playlists
          const allPlaylists = [...userPlaylistsWithTracks, ...sharedPlaylists];
          setPlaylists(allPlaylists);
        } catch (error) {
          console.error('Failed to load playlists:', error);
        }
      }
    };
    loadPlaylists();
  }, [showPlaylistModal, user, setPlaylists]);

  const handleCreatePlaylist = async () => {
    if (!user || !createPlaylistForm.name.trim()) {
      alert('Please enter a playlist name');
      return;
    }
    
    setIsCreatingPlaylist(true);
    try {
      console.log('Creating playlist with data:', {
        name: createPlaylistForm.name,
        isPublic: createPlaylistForm.isPublic,
        createdBy: user.id
      });
      
      // Create the playlist
      const newPlaylist = await MusicService.createPlaylist({
        name: createPlaylistForm.name,
        isPublic: createPlaylistForm.isPublic,
        createdBy: user.id
      });
      
      console.log('Playlist created successfully:', newPlaylist);
      
      // Add the current track to the newly created playlist
      try {
        await MusicService.addTrackToPlaylist(newPlaylist.id, track.id);
        console.log('Track added to playlist successfully');
      } catch (trackError) {
        console.error('Failed to add track to playlist (playlist was created):', trackError);
        // Don't fail the whole operation if track addition fails
      }
      
      // Reload playlists to get the updated list
      const userPlaylists = await MusicService.getPlaylists(user.id);
      setPlaylists(userPlaylists);
      
      // Dispatch event to notify other components (like Playlists page) that playlists changed
      window.dispatchEvent(new CustomEvent('playlistsChanged', { 
        detail: { playlistId: newPlaylist.id, userId: user.id }
      }));
      
      // Reset form and close create form
      setCreatePlaylistForm({ name: '', isPublic: true });
      setShowCreatePlaylistForm(false);
      
      // Close the modal
      setShowPlaylistModal(false);
    } catch (error) {
      console.error('Failed to create playlist - Full error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create playlist. Please try again.';
      console.error('Error message:', errorMessage);
      alert(`Failed to create playlist: ${errorMessage}\n\nPlease check the browser console for more details.`);
    } finally {
      setIsCreatingPlaylist(false);
    }
  };

  const handleBoost = async () => {
    if (!user) return;
    
    setIsBoosting(true);
    setBoostError(null);
    
    try {
      if (track.boosted) {
        await MusicService.unboostTrack(track.id, user.id);
        // Update the track locally
        track.boosted = false;
        track.boostExpiresAt = undefined;
        track.boostPriority = undefined;
        track.boostUserId = undefined;
      } else {
        await MusicService.boostTrack(track.id, user.id);
        // Update the track locally
        track.boosted = true;
        track.boostExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        track.boostPriority = 1;
        track.boostUserId = user.id;
      }
    } catch (error) {
      setBoostError(error instanceof Error ? error.message : 'Failed to boost track');
    } finally {
      setIsBoosting(false);
    }
  };

  const handleMessage = async (receiverId: string) => {
    if (!user) return;
    
    try {
      // Send the track as a message with type 'track'
      // The content should contain the full track data as JSON for the chat system to parse
      await ChatService.sendMessage({
        senderId: user.id,
        receiverId,
        content: JSON.stringify(track),
        type: 'track'
      });
      
      setShowMessageModal(false);
      setSearchQuery('');
      setSearchResults([]);
      setMessageError(null);
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : 'Failed to send track');
    }
  };

  const handleSearchUsers = async () => {
    if (!searchQuery.trim() || !user) return;
    
    setIsSearching(true);
    setMessageError(null);
    
    try {
      if (searchQuery.trim()) {
        // If there's a search query, make API call
        const results = await ChatService.searchUsers(searchQuery, user.id);
        setSearchResults(results);
      } else {
        // If no search query, load all users
        await loadAllUsers();
      }
    } catch (error) {
      setMessageError('Failed to search users');
    } finally {
      setIsSearching(false);
    }
  };

  const filterUsersLocally = (query: string) => {
    if (!query.trim()) {
      setSearchResults(allUsers);
      return;
    }
    
    const filtered = allUsers.filter(user => 
      user.username.toLowerCase().includes(query.toLowerCase()) ||
      (user.artistName && user.artistName.toLowerCase().includes(query.toLowerCase()))
    );
    setSearchResults(filtered);
  };

  const loadAllUsers = async () => {
    if (!user) return;
    
    setIsSearching(true);
    setMessageError(null);
    
    try {
      // Load all users when modal opens (empty search to get all users)
      const results = await ChatService.searchUsers('', user.id);
      setAllUsers(results);
      setSearchResults(results);
    } catch (error) {
      setMessageError('Failed to load users');
    } finally {
      setIsSearching(false);
    }
  };

  const isCurrentlyPlaying = player.currentTrack?.id === track.id && player.isPlaying;
  const isOwnTrack = user && track.boostUserId === user.id;
  const canBoost = user && (isOwnTrack || !track.boosted);

  if (compactGrid) {
    return (
      <>
      <div className="trackcard-hover trackcard-theme rounded-lg border-2 overflow-hidden group text-black w-full max-w-full bg-[var(--color-surface)] border-[var(--color-border)] flex flex-col min-h-0">
        {/* Square image box: padding-bottom ratio works consistently in Chrome and Firefox */}
        <div className="relative w-full flex-shrink-0 bg-gradient-to-br from-var(--color-card-white) to-var(--color-card-grey) border-b border-[var(--color-border)]" style={{ paddingBottom: '100%' }}>
          <img
            src={track.cover || DEFAULT_TRACK_COVER}
            alt={track.title}
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              console.warn('Track cover failed to load', track.cover, e);
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent && !parent.querySelector('.fallback-cover-grid')) {
                const fallback = document.createElement('div');
                fallback.className = 'fallback-cover-grid absolute inset-0 flex items-center justify-center text-2xl';
                fallback.textContent = '🎵';
                parent.appendChild(fallback);
              }
            }}
          />
          <button
            onClick={handlePlayPause}
            className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center">
              {isCurrentlyPlaying ? <Pause size={24} className="text-black" /> : <Play size={24} className="text-black" />}
            </div>
          </button>
          {/* Action buttons overlay — always visible on touch (mobile), hover-only on pointer devices */}
          {showActions && isAuthenticated && (
            <div className="absolute top-2 right-2 flex flex-wrap items-center justify-end gap-1 sm:opacity-0 sm:group-hover:opacity-100 opacity-100 transition-opacity duration-200">
              <button
                onClick={(e) => { e.stopPropagation(); setShowPlaylistModal(true); }}
                className="w-7 h-7 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-sm"
                title="Add to playlist"
              >
                <Plus size={13} className="text-gray-700" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleLike(); }}
                className={`w-7 h-7 rounded-full flex items-center justify-center shadow-sm ${
                  isLiked ? 'bg-blue-400 text-white' : 'bg-white/90 hover:bg-white text-gray-700'
                }`}
                title={isLiked ? 'Remove bookmark' : 'Bookmark track'}
              >
                <Bookmark size={13} fill={isLiked ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleAddToQueue(); }}
                className="w-7 h-7 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-sm text-gray-700"
                title="Add to Queue"
              >
                <List size={13} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowMessageModal(true); loadAllUsers(); }}
                className="w-7 h-7 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-sm text-gray-700"
                title="Send to User"
              >
                <MessageCircle size={13} />
              </button>
              {/* Remix button — to be implemented
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/remix/${track.id}`); }}
                className="w-7 h-7 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-sm text-gray-700"
                title="Open in Remix"
              >
                <RefreshCw size={13} />
              </button>
              */}
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(track); }}
                  className="w-7 h-7 bg-white/90 hover:bg-red-500 hover:text-white rounded-full flex items-center justify-center shadow-sm text-gray-700"
                  title="Delete track"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="p-2.5 flex flex-col min-w-0 flex-shrink-0">
          <div className="font-semibold text-sm truncate" style={{ fontFamily: 'Inter, sans-serif' }}>{track.title}</div>
          <div className="text-xs text-gray-500 truncate" style={{ fontFamily: 'Inter, sans-serif' }}>{track.artist}</div>
          <div className="flex items-center justify-between mt-1.5 gap-2">
            <span className="text-xs text-gray-400">{formatDuration(track.duration)}</span>
            {user && (
              <button
                onClick={handleTrackLike}
                className="flex items-center text-xs text-gray-400 hover:text-blue-400"
                disabled={isLoadingLikes}
              >
                <ThumbsUp size={12} fill={isLikedByUser ? 'currentColor' : 'none'} />
                <span className="ml-0.5">{likesCount}</span>
              </button>
            )}
          </div>
          {(track as { createdAt?: Date; bpm?: number }).createdAt != null || (track as { bpm?: number }).bpm != null ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-gray-400">
              {(track as { createdAt?: Date }).createdAt != null && (
                <span>{new Date((track as { createdAt: Date }).createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              )}
              {(track as { bpm?: number }).bpm != null && (
                <span>{(track as { bpm: number }).bpm} BPM</span>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Add to Playlist Modal (Portal) */}
      {showPlaylistModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-md relative">
            <button
              onClick={() => {
                setShowPlaylistModal(false);
                setShowCreatePlaylistForm(false);
                setCreatePlaylistForm({ name: '', isPublic: true });
              }}
              className="absolute top-3 right-3 p-1 rounded-full bg-dark-700 hover:text-gray-400 transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>
            <div className="text-lg font-bold text-primary-500 mb-4">Add to Playlist</div>
            {showCreatePlaylistForm ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-black font-medium mb-2 text-sm">Playlist Name</label>
                  <input
                    type="text"
                    value={createPlaylistForm.name}
                    onChange={(e) => setCreatePlaylistForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    placeholder="Enter playlist name"
                    autoFocus
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isPublicGrid"
                    checked={createPlaylistForm.isPublic}
                    onChange={(e) => setCreatePlaylistForm(prev => ({ ...prev, isPublic: e.target.checked }))}
                    className="w-4 h-4 text-primary-600 bg-white border-gray-300 rounded focus:ring-primary-500"
                  />
                  <label htmlFor="isPublicGrid" className="text-sm text-black">Make playlist public</label>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleCreatePlaylist}
                    disabled={isCreatingPlaylist || !createPlaylistForm.name.trim()}
                    className="flex-1 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm"
                  >
                    {isCreatingPlaylist ? 'Creating...' : 'Create & Add Track'}
                  </button>
                  <button
                    onClick={() => { setShowCreatePlaylistForm(false); setCreatePlaylistForm({ name: '', isPublic: true }); }}
                    className="flex-1 bg-gray-200 text-black px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="max-h-80 overflow-y-auto space-y-2 mb-3">
                  {playlists.length === 0 ? (
                    <p className="text-dark-400 text-center py-4">No playlists available</p>
                  ) : (
                    playlists.map(playlist => {
                      const isShared = (playlist as any).isShared;
                      const isTrackInPlaylist = playlist.tracks?.some(t => t.id === track.id);
                      return (
                        <button
                          key={playlist.id}
                          onClick={async () => {
                            if (isTrackInPlaylist) { alert('This track is already in the playlist'); return; }
                            try {
                              await MusicService.addTrackToPlaylist(playlist.id, track.id);
                              setShowPlaylistModal(false);
                              window.dispatchEvent(new CustomEvent('playlistsChanged', { detail: { playlistId: playlist.id, userId: user?.id } }));
                            } catch (error) {
                              alert(`Failed to add track to playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
                            }
                          }}
                          disabled={isTrackInPlaylist}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-white text-left transition-colors ${
                            isTrackInPlaylist ? 'bg-dark-700 opacity-50 cursor-not-allowed' : isShared ? 'bg-blue-900 hover:bg-blue-800 border border-blue-700' : 'bg-dark-800 hover:bg-primary-600'
                          }`}
                        >
                          <div className="flex items-center space-x-3 flex-1 min-w-0">
                            <Music size={18} />
                            <span className="truncate font-medium">{playlist.name}</span>
                            {isShared && (
                              <span className="flex-shrink-0 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full flex items-center space-x-1">
                                <Share2 size={10} /><span>SharePlay</span>
                              </span>
                            )}
                          </div>
                          {isTrackInPlaylist && <span className="text-xs text-gray-400 flex-shrink-0 ml-2">Already added</span>}
                        </button>
                      );
                    })
                  )}
                </div>
                <button
                  onClick={() => setShowCreatePlaylistForm(true)}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
                >
                  <Plus size={18} /><span className="font-medium">Create New Playlist</span>
                </button>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Send track to user Modal (Portal) */}
      {showMessageModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-md relative">
            <div className="flex items-start justify-between mb-4">
              <div className="text-lg font-bold text-black">Send Track to User</div>
              <button
                onClick={() => { setShowMessageModal(false); setSearchQuery(''); setSearchResults([]); setAllUsers([]); setMessageError(null); }}
                className="p-1 rounded-full bg-dark-700 hover:text-gray-400 transition-colors"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="mb-4 p-3 bg-dark-800 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded overflow-hidden">
                  <img src={track.cover || DEFAULT_TRACK_COVER} alt={track.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white truncate">{track.title}</div>
                  <div className="text-sm text-gray-400 truncate">{track.artist}</div>
                </div>
              </div>
            </div>
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); filterUsersLocally(e.target.value); }}
                className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-primary-500"
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {messageError && <p className="text-red-500 text-sm text-center">{messageError}</p>}
              {isSearching && <p className="text-dark-400 text-center text-sm">Loading users...</p>}
              {!isSearching && searchResults.length === 0 && <p className="text-dark-400 text-center text-sm">No users available</p>}
              {searchResults.map(u => (
                <button
                  key={u.id}
                  onClick={() => handleMessage(u.id)}
                  className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg bg-dark-800 hover:bg-primary-600 text-white text-left transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center">
                    <img src={getAvatarUrl(u.avatar)} alt={u.username} className="w-full h-full rounded-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-1.5">
                      {u.username}
                      <VerifiedBadge verified={u.isVerified || u.isVerifiedArtist} size={14} />
                    </div>
                    {u.artistName && <div className="text-sm text-gray-400 truncate">{u.artistName}</div>}
                  </div>
                  <MessageCircle size={16} className="text-gray-400" />
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
    );
  }

  
  return (
    <>
      {/* Mobile: horizontal row layout */}
      <div className="trackcard-hover trackcard-theme sm:hidden flex items-center gap-3 p-3 rounded-lg border-2 relative overflow-hidden group text-black w-full min-w-0 min-h-[72px] bg-[var(--color-surface)] border-[var(--color-border)]">
        {/* Album art — tappable to play/pause */}
        <button
          onClick={handlePlayPause}
          className="flex-shrink-0 relative w-16 h-16 rounded-lg overflow-hidden border border-[var(--color-border)] active:scale-95 transition-transform"
        >
          <img
            src={track.cover || DEFAULT_TRACK_COVER}
            alt={track.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              console.warn('Track cover failed to load', track.cover, e);
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent && !parent.querySelector('.fallback-cover-mobile')) {
                const fallback = document.createElement('div');
                fallback.className = 'fallback-cover-mobile w-full h-full flex items-center justify-center text-2xl bg-gray-100';
                fallback.textContent = '🎵';
                parent.appendChild(fallback);
              }
            }}
          />
          {isCurrentlyPlaying && (
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
              <Pause size={20} className="text-white drop-shadow" />
            </div>
          )}
        </button>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="font-bold text-sm truncate" style={{ fontFamily: 'Inter, sans-serif' }}>{track.title}</div>
          <div className="text-xs text-gray-500 truncate" style={{ fontFamily: 'Inter, sans-serif' }}>{track.artist}{track.album ? ` • ${track.album}` : ''}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400">{formatDuration(track.duration)}</span>
            {user && (
              <button
                onClick={handleTrackLike}
                className="flex items-center text-xs text-gray-400 hover:text-blue-400 min-h-[44px] px-1"
                disabled={isLoadingLikes}
              >
                <ThumbsUp size={16} fill={isLikedByUser ? 'currentColor' : 'none'} />
                <span className="ml-0.5">{likesCount}</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Play/Pause — 44px touch target */}
          <button
            onClick={handlePlayPause}
            className="w-11 h-11 rounded-full bg-primary-600 text-white hover:bg-primary-700 flex items-center justify-center active:scale-95 transition-transform"
          >
            {isCurrentlyPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          {showActions && isAuthenticated && (
            <button
              onClick={() => setShowPlaylistModal(true)}
              className="w-11 h-11 rounded-full border border-[var(--color-border)] hover:bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors"
              title="Add to playlist"
            >
              <MoreVertical size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Tablet/Desktop: vertical card (compactGrid-style default) with all features */}
      <div className="trackcard-hover trackcard-theme hidden sm:flex rounded-lg border-2 overflow-hidden group text-black w-full bg-[var(--color-surface)] border-[var(--color-border)] flex-col">
        <div className="relative w-full aspect-square flex-shrink-0 bg-gradient-to-br from-var(--color-card-white) to-var(--color-card-grey) border-b border-[var(--color-border)]">
          <img
            src={track.cover || DEFAULT_TRACK_COVER}
            alt={track.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              console.warn('Track cover failed to load', track.cover, e);
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const parent = target.parentElement;
              if (parent && !parent.querySelector('.fallback-cover-grid')) {
                const fallback = document.createElement('div');
                fallback.className = 'fallback-cover-grid absolute inset-0 flex items-center justify-center text-2xl';
                fallback.textContent = '🎵';
                parent.appendChild(fallback);
              }
            }}
          />
          <button
            onClick={handlePlayPause}
            className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center">
              {isCurrentlyPlaying ? <Pause size={24} className="text-black" /> : <Play size={24} className="text-black" />}
            </div>
          </button>
          {/* Action buttons overlay (add to playlist, bookmark, queue, message, remix, delete) */}
          {showActions && isAuthenticated && (
            <div className="absolute top-2 right-2 flex flex-wrap items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button
                onClick={(e) => { e.stopPropagation(); setShowPlaylistModal(true); }}
                className="w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-sm"
                title="Add to playlist"
              >
                <MoreVertical size={14} className="text-gray-700" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleLike(); }}
                className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${
                  isLiked ? 'bg-blue-400 text-white' : 'bg-white/90 hover:bg-white text-gray-700'
                }`}
                title={isLiked ? 'Remove bookmark' : 'Bookmark track'}
              >
                <Bookmark size={14} fill={isLiked ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleAddToQueue(); }}
                className="w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-sm text-gray-700"
                title="Add to Queue"
              >
                <List size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowMessageModal(true); loadAllUsers(); }}
                className="w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-sm text-gray-700"
                title="Send to User"
              >
                <MessageCircle size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/remix/${track.id}`); }}
                className="w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-sm text-gray-700"
                title="Open in Remix"
              >
                <RefreshCw size={14} />
              </button>
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(track); }}
                  className="w-8 h-8 bg-white/90 hover:bg-red-500 hover:text-white rounded-full flex items-center justify-center shadow-sm text-gray-700"
                  title="Delete track"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}
        </div>
        <div className="p-2.5 flex flex-col flex-1 min-w-0">
          <div className="font-semibold text-sm truncate" style={{ fontFamily: 'Inter, sans-serif' }}>{track.title}</div>
          <div className="text-xs text-gray-500 truncate" style={{ fontFamily: 'Inter, sans-serif' }}>{track.artist}{track.album ? ` • ${track.album}` : ''}</div>
          <div className="flex items-center justify-between mt-1.5 gap-2">
            <span className="text-xs text-gray-400">{formatDuration(track.duration)}</span>
            {user && (
              <button
                onClick={handleTrackLike}
                className="flex items-center text-xs text-gray-400 hover:text-blue-400"
                disabled={isLoadingLikes}
                title={isLikedByUser ? 'Remove like' : 'Like track'}
              >
                <ThumbsUp size={12} fill={isLikedByUser ? 'currentColor' : 'none'} />
                <span className="ml-0.5">{likesCount}</span>
              </button>
            )}
          </div>
          {(track as { createdAt?: Date; bpm?: number }).createdAt != null || (track as { bpm?: number }).bpm != null ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-gray-400">
              {(track as { createdAt?: Date }).createdAt != null && (
                <span>{new Date((track as { createdAt: Date }).createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              )}
              {(track as { bpm?: number }).bpm != null && (
                <span>{(track as { bpm: number }).bpm} BPM</span>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Add to Playlist Modal (Portal) - outside cards so it works on mobile too */}
      {showPlaylistModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-md relative">
            <button
              onClick={() => {
                setShowPlaylistModal(false);
                setShowCreatePlaylistForm(false);
                setCreatePlaylistForm({ name: '', isPublic: true });
              }}
              className="absolute top-3 right-3 p-1 rounded-full bg-dark-700 hover:text-gray-400 transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>
            <div className="text-lg font-bold text-primary-500 mb-4">Add to Playlist</div>
            
            {showCreatePlaylistForm ? (
              // Create Playlist Form
              <div className="space-y-4">
                <div>
                  <label className="block text-black font-medium mb-2 text-sm">Playlist Name</label>
                  <input
                    type="text"
                    value={createPlaylistForm.name}
                    onChange={(e) => setCreatePlaylistForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    placeholder="Enter playlist name"
                    autoFocus
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="isPublic"
                    checked={createPlaylistForm.isPublic}
                    onChange={(e) => setCreatePlaylistForm(prev => ({ ...prev, isPublic: e.target.checked }))}
                    className="w-4 h-4 text-primary-600 bg-white border-gray-300 rounded focus:ring-primary-500"
                  />
                  <label htmlFor="isPublic" className="text-sm text-black">
                    Make playlist public
                  </label>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleCreatePlaylist}
                    disabled={isCreatingPlaylist || !createPlaylistForm.name.trim()}
                    className="flex-1 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm"
                  >
                    {isCreatingPlaylist ? 'Creating...' : 'Create & Add Track'}
                  </button>
                  <button
                    onClick={() => {
                      setShowCreatePlaylistForm(false);
                      setCreatePlaylistForm({ name: '', isPublic: true });
                    }}
                    className="flex-1 bg-gray-200 text-black px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // Playlist List
              <>
                <div className="max-h-80 overflow-y-auto space-y-2 mb-3">
                  {playlists.length === 0 ? (
                    <p className="text-dark-400 text-center py-4">No playlists available</p>
                  ) : (
                    playlists.map(playlist => {
                      const isShared = (playlist as any).isShared;
                      const isTrackInPlaylist = playlist.tracks?.some(t => t.id === track.id);
                      
                      return (
                        <button
                          key={playlist.id}
                          onClick={async () => { 
                            // Check for duplicates
                            if (isTrackInPlaylist) {
                              alert('This track is already in the playlist');
                              return;
                            }
                            
                            try {
                              await MusicService.addTrackToPlaylist(playlist.id, track.id);
                              setShowPlaylistModal(false);
                              
                              // Dispatch event to notify other components
                              window.dispatchEvent(new CustomEvent('playlistsChanged', { 
                                detail: { playlistId: playlist.id, userId: user?.id }
                              }));
                            } catch (error) {
                              console.error('Failed to add track to playlist:', error);
                              alert(`Failed to add track to playlist: ${error instanceof Error ? error.message : 'Unknown error'}`);
                            }
                          }}
                          disabled={isTrackInPlaylist}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-white text-left transition-colors ${
                            isTrackInPlaylist 
                              ? 'bg-dark-700 opacity-50 cursor-not-allowed' 
                              : isShared
                              ? 'bg-blue-900 hover:bg-blue-800 border border-blue-700'
                              : 'bg-dark-800 hover:bg-primary-600'
                          }`}
                        >
                          <div className="flex items-center space-x-3 flex-1 min-w-0">
                            <Music size={18} />
                            <span className="truncate font-medium">{playlist.name}</span>
                            {isShared && (
                              <span className="flex-shrink-0 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full flex items-center space-x-1">
                                <Share2 size={10} />
                                <span>SharePlay</span>
                              </span>
                            )}
                          </div>
                          {isTrackInPlaylist && (
                            <span className="text-xs text-gray-400 flex-shrink-0 ml-2">Already added</span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
                <button
                  onClick={() => setShowCreatePlaylistForm(true)}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors"
                >
                  <Plus size={18} />
                  <span className="font-medium">Create New Playlist</span>
                </button>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Send track to user Modal (Portal) */}
      {showMessageModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-md relative">
            <div className="flex items-start justify-between mb-4">
              <div className="text-lg font-bold text-black">Send Track to User</div>
              <button
                onClick={() => {
                  setShowMessageModal(false);
                  setSearchQuery('');
                  setSearchResults([]);
                  setAllUsers([]);
                  setMessageError(null);
                }}
                className="p-1 rounded-full bg-dark-700 hover:text-gray-400 transition-colors"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Track Preview */}
            <div className="mb-4 p-3 bg-dark-800 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded overflow-hidden">
                  <img
                    src={track.cover || DEFAULT_TRACK_COVER}
                    alt={track.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      console.warn('Track cover failed to load', track.cover, e);
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent && !parent.querySelector('.fallback-cover-modal')) {
                        const fallback = document.createElement('div');
                        fallback.className = 'fallback-cover-modal w-full h-full flex items-center justify-center bg-dark-700 text-xl';
                        fallback.textContent = '🎵';
                        parent.appendChild(fallback);
                      }
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white truncate">{track.title}</div>
                  <div className="text-sm text-gray-400 truncate">{track.artist}</div>
                </div>
              </div>
            </div>
            
            {/* User Search */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  filterUsersLocally(e.target.value);
                }}
                className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-primary-500"
              />
            </div>
            
            {/* Search Results */}
            <div className="max-h-60 overflow-y-auto space-y-2">
              {messageError && (
                <p className="text-red-500 text-sm text-center">{messageError}</p>
              )}
              {isSearching && (
                <p className="text-dark-400 text-center text-sm">Loading users...</p>
              )}
              {!isSearching && searchResults.length === 0 && (
                <p className="text-dark-400 text-center text-sm">No users available</p>
              )}
              {searchResults.length === 0 && searchQuery && !isSearching && (
                <p className="text-dark-400 text-center text-sm">No users found matching "{searchQuery}"</p>
              )}
              {searchResults.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleMessage(user.id)}
                  className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg bg-dark-800 hover:bg-primary-600 text-white text-left transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center">
                    <img
                      src={getAvatarUrl(user.avatar)}
                      alt={user.username}
                      className="w-full h-full rounded-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-1.5">
                      {user.username}
                      <VerifiedBadge verified={user.isVerified || user.isVerifiedArtist} size={14} />
                    </div>
                    {user.artistName && (
                      <div className="text-sm text-gray-400 truncate">{user.artistName}</div>
                    )}
                  </div>
                  <MessageCircle size={16} className="text-gray-400" />
                </button>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default TrackCard; 