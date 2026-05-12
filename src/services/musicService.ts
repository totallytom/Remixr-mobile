import { supabase } from './supabase';
import { Track, Playlist, Comment } from '../store/useStore';
import { BoostService } from './boostService';
import { safeLog } from '../utils/debugUtils';

export interface CreateTrackData {
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: File | string;
  audioFile: File;
  price?: number;
  genre: string;
  userId: string;
}

export interface CreatePlaylistData {
  name: string;
  description?: string;
  cover?: File | string;
  isPublic?: boolean;
  createdBy: string;
}

export class MusicService {
  // Track methods
  static async createTrack(data: CreateTrackData): Promise<Track> {
    try {
      let coverUrl = data.cover as string;
      let audioUrl = '';

      // Upload cover image if it's a file
      if (data.cover instanceof File) {
        const sanitizedCoverName = data.cover.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const coverFileName = `playlist-covers/${data.userId}/${Date.now()}-${sanitizedCoverName}`;
        
        // Determine Content-Type for image
        const getImageContentType = (file: File): string => {
          if (file.type && file.type.startsWith('image/')) return file.type;
          const ext = file.name.split('.').pop()?.toLowerCase();
          if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
          if (ext === 'png') return 'image/png';
          if (ext === 'gif') return 'image/gif';
          if (ext === 'webp') return 'image/webp';
          return 'image/jpeg'; // Default
        };
        
        const { data: coverData, error: coverError } = await supabase.storage
          .from('music-files')
          .upload(coverFileName, data.cover, {
            contentType: getImageContentType(data.cover),
            upsert: false
          });

        if (coverError) throw new Error(coverError.message);
        coverUrl = supabase.storage.from('music-files').getPublicUrl(coverFileName).data.publicUrl;
      }

      // Upload audio file
      const sanitizedAudioName = data.audioFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const audioFileName = `audio-files/${data.userId}/${Date.now()}-${sanitizedAudioName}`;
      
      // Determine Content-Type for audio
      const getContentType = (file: File): string => {
        if (file.type) return file.type;
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'mp3') return 'audio/mpeg';
        if (ext === 'mp4' || ext === 'm4a') return 'audio/mp4';
        if (ext === 'wav') return 'audio/wav';
        return 'audio/mpeg'; // Default to MP3
      };
      
      const { data: audioData, error: audioError } = await supabase.storage
        .from('music-files')
        .upload(audioFileName, data.audioFile, {
          contentType: getContentType(data.audioFile),
          upsert: false
        });

      if (audioError) throw new Error(audioError.message);
      audioUrl = supabase.storage.from('music-files').getPublicUrl(audioFileName).data.publicUrl;

      // Create track record
      const { data: trackData, error } = await supabase
        .from('tracks')
        .insert({
          title: data.title,
          artist: data.artist,
          album: data.album,
          duration: data.duration,
          cover: coverUrl,
          audio_url: audioUrl,
          price: data.price,
          genre: data.genre,
          user_id: data.userId,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      return this.transformTrack(trackData);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to create track');
    }
  }

  static async getTracks(limit = 50, offset = 0): Promise<Track[]> {
    try {
      safeLog('MusicService.getTracks called');
      const { data, error } = await supabase
        .from('tracks')
        .select(`
          *,
          users!tracks_user_id_fkey (
            username,
            avatar,
            artist_name
          )
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      safeLog('All tracks from database:', { data, error });

      if (error) throw new Error(error.message);

      return data.map(track => this.transformTrack(track));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch tracks');
    }
  }

  static async getTrackById(id: string): Promise<Track> {
    try {
      const { data, error } = await supabase
        .from('tracks')
        .select(`
          *,
          users!tracks_user_id_fkey (
            username,
            avatar,
            artist_name
          )
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw new Error(error.message);

      if (!data) {
        throw new Error('Track not found');
      }

      return this.transformTrack(data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch track');
    }
  }

  /** Tracks that were forked/remixed from this track (requires remix_parent_id column). */
  static async getRemixesOfTrack(trackId: string): Promise<Track[]> {
    try {
      const { data, error } = await supabase
        .from('tracks')
        .select('*')
        .eq('remix_parent_id', trackId)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.message?.includes('remix_parent_id') || error.code === '42703') return [];
        throw new Error(error.message);
      }
      return (data || []).map((t) => this.transformTrack(t));
    } catch {
      return [];
    }
  }

  /** Version history: current track as single entry; can be extended later with version table. */
  static async getVersionHistory(trackId: string): Promise<Track[]> {
    try {
      const track = await this.getTrackById(trackId);
      return [track];
    } catch {
      return [];
    }
  }

  /** Create a remix (fork) of a track: new track with same audio/cover, linked to parent. */
  static async createRemix(parentTrack: Track, userId: string, artistName: string): Promise<Track> {
    try {
      const { data, error } = await supabase
        .from('tracks')
        .insert({
          title: `Remix of ${parentTrack.title}`,
          artist: artistName,
          album: parentTrack.album,
          duration: parentTrack.duration,
          cover: parentTrack.cover,
          audio_url: parentTrack.audioUrl,
          genre: parentTrack.genre,
          user_id: userId,
          remix_parent_id: parentTrack.id,
          version_label: 'remix',
          remix_open: true,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return this.transformTrack(data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to create remix');
    }
  }

  static async getUserTracks(userId: string): Promise<Track[]> {
    try {
      safeLog('MusicService.getUserTracks called with userId:', userId);
      const { data, error } = await supabase
        .from('tracks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      safeLog('Database response:', { data, error });

      if (error) throw new Error(error.message);

      const tracks = data.map(track => this.transformTrack(track));
      safeLog('Transformed tracks:', tracks);
      return tracks;
    } catch (error) {
      console.error('Error in getUserTracks:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch user tracks');
    }
  }

  static async deleteTrack(trackId: string, userId: string): Promise<void> {
    try {
      // Get track info first
      const { data: track, error: fetchError } = await supabase
        .from('tracks')
        .select('audio_url, cover')
        .eq('id', trackId)
        .eq('user_id', userId)
        .maybeSingle();

      if (fetchError) throw new Error(fetchError.message);

      if (!track) {
        throw new Error('Track not found or you do not have permission to delete it');
      }

      // Delete from database
      const { error: deleteError } = await supabase
        .from('tracks')
        .delete()
        .eq('id', trackId)
        .eq('user_id', userId);

      if (deleteError) throw new Error(deleteError.message);

      // Delete files from storage (optional - you might want to keep them)
      // This would require parsing the URLs to get the file paths
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to delete track');
    }
  }

  // Boost methods
  static async boostTrack(trackId: string, userId: string): Promise<boolean> {
    return await BoostService.boostTrack(trackId, userId);
  }

  static async unboostTrack(trackId: string, userId: string): Promise<boolean> {
    return await BoostService.unboostTrack(trackId, userId);
  }

  static async getBoostedTracks(limit: number = 10): Promise<Track[]> {
    return await BoostService.getBoostedTracks(limit);
  }

  static async getUserBoostedTracks(userId: string): Promise<Track[]> {
    return await BoostService.getUserBoostedTracks(userId);
  }

  // Playlist methods
  static async createPlaylist(data: CreatePlaylistData): Promise<Playlist> {
    try {
      let coverUrl = data.cover as string | undefined;

      if (data.cover instanceof File) {
        const sanitizedCoverName = data.cover.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const coverFileName = `playlist-covers/${data.createdBy}/${Date.now()}-${sanitizedCoverName}`;
        
        // Determine Content-Type for image
        const getImageContentType = (file: File): string => {
          if (file.type && file.type.startsWith('image/')) return file.type;
          const ext = file.name.split('.').pop()?.toLowerCase();
          if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
          if (ext === 'png') return 'image/png';
          if (ext === 'gif') return 'image/gif';
          if (ext === 'webp') return 'image/webp';
          return 'image/jpeg'; // Default
        };
        
        const { data: coverData, error: coverError } = await supabase.storage
          .from('music-files')
          .upload(coverFileName, data.cover, {
            contentType: getImageContentType(data.cover),
            upsert: false
          });

        if (coverError) throw new Error(coverError.message);
        coverUrl = supabase.storage.from('music-files').getPublicUrl(coverFileName).data.publicUrl;
      }

      const { data: playlistData, error } = await supabase
        .from('playlists')
        .insert({
          name: data.name,
          description: data.description,
          cover: coverUrl,
          created_by: data.createdBy,
          is_public: data.isPublic ?? true,
          followers: 0,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      return this.transformPlaylist(playlistData);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to create playlist');
    }
  }

  static async getPlaylists(userId?: string, limit = 50, offset = 0): Promise<Playlist[]> {
    try {
      let query = supabase
        .from('playlists')
        .select(`
          *,
          users!playlists_created_by_fkey (
            username,
            avatar
          )
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (userId) {
        query = query.eq('created_by', userId);
      } else {
        query = query.eq('is_public', true);
      }

      const { data, error } = await query;

      if (error) throw new Error(error.message);

      return data.map(playlist => this.transformPlaylist(playlist));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch playlists');
    }
  }

  static async getPlaylistById(id: string): Promise<Playlist> {
    try {
      const { data, error } = await supabase
        .from('playlists')
        .select(`
          *,
          users!playlists_created_by_fkey (
            username,
            avatar
          )
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw new Error(error.message);

      if (!data) {
        throw new Error('Playlist not found');
      }

      const playlist = this.transformPlaylist(data);

      // Get tracks in playlist
      const { data: trackData, error: trackError } = await supabase
        .from('playlist_tracks')
        .select(`
          position,
          tracks (*)
        `)
        .eq('playlist_id', id)
        .order('position', { ascending: true });

      if (trackError) throw new Error(trackError.message);

      playlist.tracks = trackData.map(item => this.transformTrack(item.tracks));

      return playlist;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch playlist');
    }
  }

  // Batch-loads all playlists for a user + their tracks in 2 queries instead of N×2
  static async getPlaylistsWithTracks(userId: string): Promise<Playlist[]> {
    try {
      const playlists = await this.getPlaylists(userId);
      if (!playlists.length) return [];

      const playlistIds = playlists.map(p => p.id);
      const { data: trackData, error: trackError } = await supabase
        .from('playlist_tracks')
        .select('playlist_id, position, tracks(*)')
        .in('playlist_id', playlistIds)
        .order('position', { ascending: true });

      if (trackError) {
        console.error('Error loading playlist tracks:', trackError);
        return playlists;
      }

      const tracksByPlaylistId = new Map<string, any[]>();
      for (const item of trackData || []) {
        const pid = (item as any).playlist_id;
        if (!tracksByPlaylistId.has(pid)) tracksByPlaylistId.set(pid, []);
        if ((item as any).tracks) tracksByPlaylistId.get(pid)!.push(this.transformTrack((item as any).tracks));
      }

      return playlists.map(p => ({ ...p, tracks: tracksByPlaylistId.get(p.id) || [] }));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch playlists with tracks');
    }
  }

  static async addTrackToPlaylist(playlistId: string, trackId: string): Promise<void> {
    try {
      // Get current position
      const { data: maxPosition, error: positionError } = await supabase
        .from('playlist_tracks')
        .select('position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();

      const position = maxPosition ? maxPosition.position + 1 : 0;

      const { error } = await supabase
        .from('playlist_tracks')
        .insert({
          playlist_id: playlistId,
          track_id: trackId,
          position,
        });

      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to add track to playlist');
    }
  }

  static async removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('playlist_tracks')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('track_id', trackId);

      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to remove track from playlist');
    }
  }

  static async deletePlaylist(playlistId: string, userId: string): Promise<void> {
    try {
      console.log('MusicService.deletePlaylist called with:', { playlistId, userId });
      
      // First verify the playlist exists and belongs to the user
      const { data: playlist, error: fetchError } = await supabase
        .from('playlists')
        .select('id, created_by')
        .eq('id', playlistId)
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching playlist:', fetchError);
        throw new Error(fetchError.message);
      }

      if (!playlist) {
        throw new Error('Playlist not found');
      }

      if (playlist.created_by !== userId) {
        throw new Error('You do not have permission to delete this playlist');
      }

      // Delete the playlist (cascade will handle playlist_tracks)
      const { error } = await supabase
        .from('playlists')
        .delete()
        .eq('id', playlistId)
        .eq('created_by', userId);

      if (error) {
        console.error('Error deleting playlist:', error);
        throw new Error(error.message);
      }
      
      console.log('Playlist deleted successfully');
    } catch (error) {
      console.error('Failed to delete playlist:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to delete playlist');
    }
  }

  static async updatePlaylist(playlistId: string, userId: string, updates: {
    name?: string;
    description?: string;
    cover?: string;
    isPublic?: boolean;
    collaborators?: string[];
  }): Promise<void> {
    try {
      const { error } = await supabase
        .from('playlists')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', playlistId)
        .eq('created_by', userId);

      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to update playlist');
    }
  }

  static async reorderPlaylistTracks(playlistId: string, trackIds: string[]): Promise<void> {
    try {
      // Delete existing positions
      const { error: deleteError } = await supabase
        .from('playlist_tracks')
        .delete()
        .eq('playlist_id', playlistId);

      if (deleteError) throw new Error(deleteError.message);

      // Insert new positions
      const trackPositions = trackIds.map((trackId, index) => ({
        playlist_id: playlistId,
        track_id: trackId,
        position: index,
      }));

      const { error: insertError } = await supabase
        .from('playlist_tracks')
        .insert(trackPositions);

      if (insertError) throw new Error(insertError.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to reorder playlist tracks');
    }
  }

  // Comment methods
  static async addComment(
    trackId: string,
    userId: string,
    content: string,
    timestampSeconds?: number
  ): Promise<Comment> {
    try {
      const insertPayload: Record<string, unknown> = {
        track_id: trackId,
        user_id: userId,
        content,
        likes: 0,
        liked_by: [],
      };
      if (timestampSeconds != null) {
        insertPayload.timestamp_seconds = timestampSeconds;
      }
      const { data, error } = await supabase
        .from('comments')
        .insert(insertPayload)
        .select(`
          *,
          users (
            username,
            avatar
          )
        `)
        .maybeSingle();

      if (error) throw new Error(error.message);

      if (!data) {
        throw new Error('Failed to create comment');
      }

      return this.transformComment(data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to add comment');
    }
  }

  static async getTrackComments(trackId: string): Promise<Comment[]> {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select(`
          *,
          users (
            username,
            avatar
          )
        `)
        .eq('track_id', trackId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      return data.map(comment => this.transformComment(comment));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch comments');
    }
  }

  static async likeComment(commentId: string, userId: string): Promise<void> {
    try {
      const { data: comment, error: fetchError } = await supabase
        .from('comments')
        .select('liked_by')
        .eq('id', commentId)
        .maybeSingle();

      if (fetchError) throw new Error(fetchError.message);

      if (!comment) {
        throw new Error('Comment not found');
      }

      const likedBy = comment.liked_by || [];
      const isLiked = likedBy.includes(userId);

      if (!isLiked) {
        likedBy.push(userId);
      }

      const { error } = await supabase
        .from('comments')
        .update({
          likes: likedBy.length,
          liked_by: likedBy,
        })
        .eq('id', commentId);

      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to like comment');
    }
  }

  static async unlikeComment(commentId: string, userId: string): Promise<void> {
    try {
      const { data: comment, error: fetchError } = await supabase
        .from('comments')
        .select('liked_by')
        .eq('id', commentId)
        .maybeSingle();

      if (fetchError) throw new Error(fetchError.message);

      if (!comment) {
        throw new Error('Comment not found');
      }

      const likedBy = comment.liked_by || [];
      const filteredLikedBy = likedBy.filter((id: string) => id !== userId);

      const { error } = await supabase
        .from('comments')
        .update({
          likes: filteredLikedBy.length,
          liked_by: filteredLikedBy,
        })
        .eq('id', commentId);

      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to unlike comment');
    }
  }

  static async likeTrack(trackId: string, userId: string): Promise<void> {
    try {
      // First get the current track to check if user already liked it
      const { data: currentTrack, error: fetchError } = await supabase
        .from('tracks')
        .select('likes, liked_by')
        .eq('id', trackId)
        .single();

      if (fetchError) throw new Error(fetchError.message);

      const currentLikes = currentTrack.likes || 0;
      const currentLikedBy = currentTrack.liked_by || [];
      const isAlreadyLiked = currentLikedBy.includes(userId);

      let newLikes: number;
      let newLikedBy: string[];

      if (isAlreadyLiked) {
        // Unlike
        newLikes = currentLikes - 1;
        newLikedBy = currentLikedBy.filter((id: string) => id !== userId);
      } else {
        // Like
        newLikes = currentLikes + 1;
        newLikedBy = [...currentLikedBy, userId];
      }

      const { error } = await supabase
        .from('tracks')
        .update({
          likes: newLikes,
          liked_by: newLikedBy
        })
        .eq('id', trackId);

      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to like/unlike track');
    }
  }

  /** Add a like for this track (no-op if user already liked). Use for swipe-right / discover. */
  static async addTrackLike(trackId: string, userId: string): Promise<void> {
    try {
      const { data: currentTrack, error: fetchError } = await supabase
        .from('tracks')
        .select('likes, liked_by')
        .eq('id', trackId)
        .single();

      if (fetchError) throw new Error(fetchError.message);

      const currentLikedBy = currentTrack.liked_by || [];
      if (currentLikedBy.includes(userId)) return;

      const newLikes = (currentTrack.likes || 0) + 1;
      const newLikedBy = [...currentLikedBy, userId];

      const { error } = await supabase
        .from('tracks')
        .update({ likes: newLikes, liked_by: newLikedBy })
        .eq('id', trackId);

      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to add track like');
    }
  }

  static async getTrackLikes(trackId: string): Promise<{ likes: number; likedBy: string[] }> {
    try {
      const { data, error } = await supabase
        .from('tracks')
        .select('likes, liked_by')
        .eq('id', trackId)
        .single();

      if (error) throw new Error(error.message);

      return {
        likes: data.likes || 0,
        likedBy: data.liked_by || []
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch track likes');
    }
  }

  static async deleteComment(commentId: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', userId);

      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to delete comment');
    }
  }

  // Post Comment methods
  static async addPostComment(postId: string, userId: string, content: string): Promise<Comment> {
    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: userId,
          content,
          likes: 0,
          liked_by: [],
        })
        .select(`
          *,
          users (
            username,
            avatar
          )
        `)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Failed to create comment');
      return this.transformComment(data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to add comment');
    }
  }

  static async getPostComments(postId: string): Promise<Comment[]> {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select(`
          *,
          users (
            username,
            avatar
          )
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data.map(comment => this.transformComment(comment));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch comments');
    }
  }

  static async likePostComment(commentId: string, userId: string): Promise<void> {
    try {
      const { data: comment, error: fetchError } = await supabase
        .from('comments')
        .select('liked_by')
        .eq('id', commentId)
        .maybeSingle();
      if (fetchError) throw new Error(fetchError.message);
      if (!comment) throw new Error('Comment not found');
      const likedBy = comment.liked_by || [];
      const isLiked = likedBy.includes(userId);
      if (!isLiked) likedBy.push(userId);
      const { error } = await supabase
        .from('comments')
        .update({ likes: likedBy.length, liked_by: likedBy })
        .eq('id', commentId);
      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to like comment');
    }
  }

  static async unlikePostComment(commentId: string, userId: string): Promise<void> {
    try {
      const { data: comment, error: fetchError } = await supabase
        .from('comments')
        .select('liked_by')
        .eq('id', commentId)
        .maybeSingle();
      if (fetchError) throw new Error(fetchError.message);
      if (!comment) throw new Error('Comment not found');
      const likedBy = comment.liked_by || [];
      const filteredLikedBy = likedBy.filter((id: string) => id !== userId);
      const { error } = await supabase
        .from('comments')
        .update({ likes: filteredLikedBy.length, liked_by: filteredLikedBy })
        .eq('id', commentId);
      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to unlike comment');
    }
  }

  static async deletePostComment(commentId: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId)
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to delete comment');
    }
  }

  // Enhanced recommendation methods with boost priority
  static async getRecommendedTracks(userId: string, limit = 10): Promise<Track[]> {
    try {
      const [boostedTracks, { data, error }] = await Promise.all([
        BoostService.getBoostedTracks(Math.floor(limit * 0.4)),
        supabase.rpc('get_recommended_tracks', { user_uuid: userId, limit_count: limit }),
      ]);
      if (error) throw new Error(error.message);
      const boostedIds = new Set(boostedTracks.map((t: Track) => t.id));
      const regularTracks = (data || []).map((track: any) => this.transformTrack(track)).filter((t: Track) => !boostedIds.has(t.id));
      return [...boostedTracks, ...regularTracks].slice(0, limit);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to get recommended tracks');
    }
  }

  static async getTracksByGenre(genre: string, limit = 20, offset = 0): Promise<Track[]> {
    try {
      const [boostedTracks, { data, error }] = await Promise.all([
        BoostService.getBoostedTracks(limit),
        supabase.rpc('get_tracks_by_genre', { genre_filter: genre, limit_count: limit, offset_count: offset }),
      ]);
      const boostedInGenre = boostedTracks.filter((track: Track) => track.genre === genre);
      if (error) throw new Error(error.message);
      const boostedIds = new Set(boostedInGenre.map((t: Track) => t.id));
      const regularTracks = (data || []).map((track: any) => this.transformTrack(track)).filter((t: Track) => !boostedIds.has(t.id));
      return [...boostedInGenre, ...regularTracks].slice(0, limit);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to get tracks by genre');
    }
  }

  static async getTracksByAlbum(albumId: string): Promise<Track[]> {
    try {
      const { data, error } = await supabase
        .from('tracks')
        .select('*')
        .eq('album_id', albumId)
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);

      return data.map(track => this.transformTrack(track));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch tracks by album');
    }
  }

  static async searchTracks(query: string, limit = 50, offset = 0): Promise<Track[]> {
    try {
      const [boostedTracks, { data, error }] = await Promise.all([
        BoostService.getBoostedTracks(limit),
        supabase.rpc('search_tracks', { search_query: query, limit_count: limit, offset_count: offset }),
      ]);
      const lq = query.toLowerCase();
      const boostedMatches = boostedTracks.filter((track: Track) =>
        track.title.toLowerCase().includes(lq) ||
        track.artist.toLowerCase().includes(lq) ||
        track.album.toLowerCase().includes(lq)
      );
      if (error) throw new Error(error.message);
      const boostedIds = new Set(boostedMatches.map((t: Track) => t.id));
      const regularTracks = (data || []).map((track: any) => this.transformTrack(track)).filter((t: Track) => !boostedIds.has(t.id));
      return [...boostedMatches, ...regularTracks].slice(0, limit);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to search tracks');
    }
  }

  static async getPopularTracks(limit = 20, offset = 0): Promise<Track[]> {
    try {
      const [boostedTracks, { data, error }] = await Promise.all([
        BoostService.getBoostedTracks(Math.floor(limit * 0.3)),
        supabase.rpc('get_popular_tracks', { limit_count: limit, offset_count: offset }),
      ]);
      if (error) throw new Error(error.message);
      const boostedIds = new Set(boostedTracks.map((t: Track) => t.id));
      const regularTracks = (data || []).map((track: any) => this.transformTrack(track)).filter((t: Track) => !boostedIds.has(t.id));
      return [...boostedTracks, ...regularTracks].slice(0, limit);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to get popular tracks');
    }
  }

  static async recordPlayHistory(userId: string, trackId: string, playDuration: number = 0, completed: boolean = false): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_play_history')
        .insert({
          user_id: userId,
          track_id: trackId,
          play_duration: playDuration,
          completed,
        });

      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to record play history');
    }
  }

  static async getUserPlayHistory(userId: string, limit = 20): Promise<Track[]> {
    try {
      const { data, error } = await supabase
        .from('user_play_history')
        .select(`
          tracks!user_play_history_track_id_fkey (*)
        `)
        .eq('user_id', userId)
        .order('played_at', { ascending: false })
        .limit(limit);

      if (error) throw new Error(error.message);

      return (data || []).map((ph: any) => this.transformTrack(ph.tracks));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to get user play history');
    }
  }

  static async getAvailableGenres(): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('tracks')
        .select('genre')
        .not('genre', 'is', null)
        .limit(500);

      if (error) throw new Error(error.message);

      const genres = Array.from(new Set((data || []).map((track: any) => track.genre)));
      return genres.sort();
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to get available genres');
    }
  }

  // Transform methods
  private static transformTrack(dbTrack: any): Track {
    return {
      id: dbTrack.id,
      title: dbTrack.title,
      artist: dbTrack.artist,
      album: dbTrack.album,
      duration: dbTrack.duration,
      cover: dbTrack.cover,
      audioUrl: dbTrack.audio_url,
      price: dbTrack.price,
      genre: dbTrack.genre,
      boosted: dbTrack.boosted || false,
      boostExpiresAt: dbTrack.boost_expires_at ? new Date(dbTrack.boost_expires_at) : undefined,
      boostPriority: dbTrack.boost_priority,
      boostUserId: dbTrack.boost_user_id,
      remixParentId: dbTrack.remix_parent_id,
      versionLabel: dbTrack.version_label,
      remixOpen: dbTrack.remix_open !== false,
      createdAt: dbTrack.created_at ? new Date(dbTrack.created_at) : undefined,
      bpm: dbTrack.bpm != null ? Number(dbTrack.bpm) : undefined,
      previewStartSec: dbTrack.preview_start_sec != null ? Number(dbTrack.preview_start_sec) : undefined,
      previewDurationSec: dbTrack.preview_duration_sec != null ? Number(dbTrack.preview_duration_sec) : undefined,
    };
  }

  private static transformPlaylist(dbPlaylist: any): Playlist {
    return {
      id: dbPlaylist.id,
      name: dbPlaylist.name,
      description: dbPlaylist.description,
      cover: dbPlaylist.cover,
      tracks: [],
      createdBy: dbPlaylist.created_by,
      isPublic: dbPlaylist.is_public,
      createdAt: new Date(dbPlaylist.created_at),
      updatedAt: new Date(dbPlaylist.updated_at),
      followers: dbPlaylist.followers,
      collaborators: dbPlaylist.collaborators || [],
    };
  }

  private static transformComment(dbComment: any): Comment {
    return {
      id: dbComment.id,
      trackId: dbComment.track_id,
      userId: dbComment.user_id,
      username: dbComment.users?.username || '',
      userAvatar: dbComment.users?.avatar || '',
      content: dbComment.content,
      timestamp: new Date(dbComment.created_at),
      likes: dbComment.likes,
      likedBy: dbComment.liked_by || [],
      timestampSeconds: dbComment.timestamp_seconds != null ? Number(dbComment.timestamp_seconds) : undefined,
    };
  }

  // Bookmark methods
  static async addBookmark(trackId: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('bookmarks')
        .insert({
          user_id: userId,
          track_id: trackId,
        });

      if (error) {
        // If it's a unique constraint error, the bookmark already exists
        if (error.code === '23505') {
          return; // Already bookmarked, silently succeed
        }
        throw new Error(error.message);
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to add bookmark');
    }
  }

  static async removeBookmark(trackId: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('bookmarks')
        .delete()
        .eq('user_id', userId)
        .eq('track_id', trackId);

      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to remove bookmark');
    }
  }

  static async isTrackBookmarked(trackId: string, userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('bookmarks')
        .select('id')
        .eq('user_id', userId)
        .eq('track_id', trackId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return !!data;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to check bookmark status');
    }
  }

  static async getUserBookmarks(userId: string): Promise<Track[]> {
    try {
      const { data, error } = await supabase
        .from('bookmarks')
        .select(`
          tracks (*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      return (data || []).map((bookmark: any) => this.transformTrack(bookmark.tracks));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch bookmarks');
    }
  }

  /** Tracks this user has liked (tracks.liked_by contains userId). */
  static async getUserLikedTracks(userId: string): Promise<Track[]> {
    try {
      const { data, error } = await supabase
        .from('tracks')
        .select(`
          *,
          users!tracks_user_id_fkey (
            username,
            avatar,
            artist_name
          )
        `)
        .contains('liked_by', [userId])
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      return (data || []).map((t: any) => this.transformTrack(t));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch liked tracks');
    }
  }

  // Playlist invitation methods
  static async inviteUserToPlaylist(playlistId: string, inviterId: string, inviteeId: string): Promise<void> {
    try {
      // Verify playlist ownership
      const { data: playlist, error: playlistError } = await supabase
        .from('playlists')
        .select('created_by')
        .eq('id', playlistId)
        .maybeSingle();

      if (playlistError) throw new Error(playlistError.message);
      if (!playlist) throw new Error('Playlist not found');
      if (playlist.created_by !== inviterId) throw new Error('You do not have permission to invite users to this playlist');

      // Check if invitation already exists
      const { data: existingInvitation, error: checkError } = await supabase
        .from('playlist_invitations')
        .select('id, status')
        .eq('playlist_id', playlistId)
        .eq('invitee_id', inviteeId)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') throw new Error(checkError.message);

      if (existingInvitation) {
        if (existingInvitation.status === 'accepted') {
          throw new Error('User is already a collaborator on this playlist');
        } else if (existingInvitation.status === 'pending') {
          throw new Error('Invitation already sent to this user');
        } else {
          // If declined, update to pending
          const { error: updateError } = await supabase
            .from('playlist_invitations')
            .update({ status: 'pending', updated_at: new Date().toISOString() })
            .eq('id', existingInvitation.id);

          if (updateError) throw new Error(updateError.message);
          return;
        }
      }

      // Create new invitation
      const { error } = await supabase
        .from('playlist_invitations')
        .insert({
          playlist_id: playlistId,
          inviter_id: inviterId,
          invitee_id: inviteeId,
          status: 'pending'
        });

      if (error) {
        if (error.code === '23505') {
          throw new Error('Invitation already exists');
        }
        throw new Error(error.message);
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to send invitation');
    }
  }

  static async acceptPlaylistInvitation(invitationId: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('playlist_invitations')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', invitationId)
        .eq('invitee_id', userId)
        .eq('status', 'pending');

      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to accept invitation');
    }
  }

  static async declinePlaylistInvitation(invitationId: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('playlist_invitations')
        .update({ status: 'declined', updated_at: new Date().toISOString() })
        .eq('id', invitationId)
        .eq('invitee_id', userId)
        .eq('status', 'pending');

      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to decline invitation');
    }
  }

  static async getPlaylistInvitations(userId: string, status?: 'pending' | 'accepted' | 'declined'): Promise<any[]> {
    try {
      let query = supabase
        .from('playlist_invitations')
        .select(`
          *,
          playlists (
            id,
            name,
            cover,
            created_by
          ),
          inviter:users!playlist_invitations_inviter_id_fkey (
            id,
            username,
            avatar
          )
        `)
        .eq('invitee_id', userId)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) throw new Error(error.message);

      return data || [];
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch invitations');
    }
  }

  static async getPlaylistCollaborators(playlistId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('playlist_invitations')
        .select(`
          *,
          invitee:users!playlist_invitations_invitee_id_fkey (
            id,
            username,
            avatar
          )
        `)
        .eq('playlist_id', playlistId)
        .eq('status', 'accepted');

      if (error) throw new Error(error.message);

      return (data || []).map((invitation: any) => ({
        ...invitation.invitee,
        invitationId: invitation.id
      }));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch collaborators');
    }
  }

  static async getPlaylistPendingInvitations(playlistId: string, ownerId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('playlist_invitations')
        .select(`
          *,
          invitee:users!playlist_invitations_invitee_id_fkey (
            id,
            username,
            avatar
          )
        `)
        .eq('playlist_id', playlistId)
        .eq('inviter_id', ownerId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      return (data || []).map((invitation: any) => ({
        ...invitation.invitee,
        invitationId: invitation.id,
        createdAt: invitation.created_at
      }));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch pending invitations');
    }
  }

  static async removeCollaborator(invitationId: string, ownerId: string): Promise<void> {
    try {
      // Verify the invitation exists and the user is the owner
      const { data: invitation, error: fetchError } = await supabase
        .from('playlist_invitations')
        .select(`
          *,
          playlists!playlist_invitations_playlist_id_fkey (
            created_by
          )
        `)
        .eq('id', invitationId)
        .maybeSingle();

      if (fetchError) throw new Error(fetchError.message);
      if (!invitation) throw new Error('Invitation not found');
      if (invitation.playlists.created_by !== ownerId) {
        throw new Error('You do not have permission to remove this collaborator');
      }

      // Delete the invitation (this removes the collaborator)
      const { error } = await supabase
        .from('playlist_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to remove collaborator');
    }
  }

  static async cancelInvitation(invitationId: string, ownerId: string): Promise<void> {
    try {
      // Verify the invitation exists and the user is the owner
      const { data: invitation, error: fetchError } = await supabase
        .from('playlist_invitations')
        .select(`
          *,
          playlists!playlist_invitations_playlist_id_fkey (
            created_by
          )
        `)
        .eq('id', invitationId)
        .maybeSingle();

      if (fetchError) throw new Error(fetchError.message);
      if (!invitation) throw new Error('Invitation not found');
      if (invitation.playlists.created_by !== ownerId) {
        throw new Error('You do not have permission to cancel this invitation');
      }

      // Delete the pending invitation
      const { error } = await supabase
        .from('playlist_invitations')
        .delete()
        .eq('id', invitationId)
        .eq('status', 'pending');

      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to cancel invitation');
    }
  }

  static async hasPlaylistAccess(playlistId: string, userId: string): Promise<boolean> {
    try {
      // Check if user is the owner
      const { data: playlist, error: playlistError } = await supabase
        .from('playlists')
        .select('created_by')
        .eq('id', playlistId)
        .maybeSingle();

      if (playlistError) throw new Error(playlistError.message);
      if (!playlist) return false;
      if (playlist.created_by === userId) return true;

      // Check if user has accepted invitation
      const { data: invitation, error: invitationError } = await supabase
        .from('playlist_invitations')
        .select('id')
        .eq('playlist_id', playlistId)
        .eq('invitee_id', userId)
        .eq('status', 'accepted')
        .maybeSingle();

      if (invitationError && invitationError.code !== 'PGRST116') throw new Error(invitationError.message);

      return !!invitation;
    } catch (error) {
      console.error('Error checking playlist access:', error);
      return false;
    }
  }
}