import { supabase } from './supabase';

export interface Album {
  id: string;
  title: string;
  artist: string;
  cover: string;
  genre: string;
  price?: number;
  description?: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  trackCount?: number;
}

export interface CreateAlbumData {
  title: string;
  artist: string;
  cover: string;
  genre: string;
  price?: number;
  description?: string;
  userId: string;
}

export class AlbumService {
  // Get albums for a user
  static async getUserAlbums(userId: string): Promise<Album[]> {
    try {
      const { data, error } = await supabase
        .from('albums')
        .select(`
          *,
          tracks!tracks_album_id_fkey (id)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching albums:', error);
        return [];
      }

      return (data || []).map(album => ({
        id: album.id,
        title: album.title,
        artist: album.artist,
        cover: album.cover,
        genre: album.genre,
        price: album.price,
        description: album.description,
        userId: album.user_id,
        createdAt: album.created_at,
        updatedAt: album.updated_at,
        trackCount: album.tracks?.length || 0
      }));
    } catch (error) {
      console.error('Error fetching albums:', error);
      return [];
    }
  }

  // Get album by ID
  static async getAlbumById(id: string): Promise<Album | null> {
    try {
      const { data, error } = await supabase
        .from('albums')
        .select(`
          *,
          tracks!tracks_album_id_fkey (id)
        `)
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error fetching album:', error);
        return null;
      }

      return {
        id: data.id,
        title: data.title,
        artist: data.artist,
        cover: data.cover,
        genre: data.genre,
        price: data.price,
        description: data.description,
        userId: data.user_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        trackCount: data.tracks?.length || 0
      };
    } catch (error) {
      console.error('Error fetching album:', error);
      return null;
    }
  }

  // Create a new album
  static async createAlbum(data: CreateAlbumData): Promise<Album> {
    try {
      const { data: albumData, error } = await supabase
        .from('albums')
        .insert({
          title: data.title,
          artist: data.artist,
          cover: data.cover,
          genre: data.genre,
          price: data.price,
          description: data.description,
          user_id: data.userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      return {
        id: albumData.id,
        title: albumData.title,
        artist: albumData.artist,
        cover: albumData.cover,
        genre: albumData.genre,
        price: albumData.price,
        description: albumData.description,
        userId: albumData.user_id,
        createdAt: albumData.created_at,
        updatedAt: albumData.updated_at,
        trackCount: 0
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to create album');
    }
  }

  // Update an album
  static async updateAlbum(id: string, userId: string, updates: Partial<CreateAlbumData>): Promise<Album> {
    try {
      const updateData: any = {};
      if (updates.title) updateData.title = updates.title;
      if (updates.artist) updateData.artist = updates.artist;
      if (updates.cover) updateData.cover = updates.cover;
      if (updates.genre) updateData.genre = updates.genre;
      if (updates.price !== undefined) updateData.price = updates.price;
      if (updates.description !== undefined) updateData.description = updates.description;
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('albums')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw new Error(error.message);

      return {
        id: data.id,
        title: data.title,
        artist: data.artist,
        cover: data.cover,
        genre: data.genre,
        price: data.price,
        description: data.description,
        userId: data.user_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        trackCount: 0
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to update album');
    }
  }

  // Delete an album
  static async deleteAlbum(id: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('albums')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to delete album');
    }
  }
}
