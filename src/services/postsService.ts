import { supabase } from './supabase';

export interface Post {
  id: string;
  user: {
    id: string;
    username: string;
    avatar: string;
    artistName?: string;
  };
  caption: string;
  imageUrl?: string;
  musicUrl?: string;
  likes: number;
  likedBy: string[];
  createdAt: string;
  likedByUser?: boolean;
}

export class PostsService {
  static async getPosts(limit = 50, offset = 0): Promise<Post[]> {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          users!posts_user_id_fkey (
            id,
            username,
            avatar,
            artist_name
          )
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw new Error(error.message);

      return data.map(post => this.transformPost(post));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch posts');
    }
  }

  static async getUserPosts(userId: string, limit = 50, offset = 0): Promise<Post[]> {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          users!posts_user_id_fkey (
            id,
            username,
            avatar,
            artist_name
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw new Error(error.message);

      return data.map(post => this.transformPost(post));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch user posts');
    }
  }

  static async likePost(postId: string, userId: string): Promise<void> {
    try {
      // First get the current post to check if user already liked it
      const { data: currentPost, error: fetchError } = await supabase
        .from('posts')
        .select('likes, liked_by')
        .eq('id', postId)
        .single();

      if (fetchError) throw new Error(fetchError.message);

      const currentLikes = currentPost.likes || 0;
      const currentLikedBy = currentPost.liked_by || [];
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
        .from('posts')
        .update({
          likes: newLikes,
          liked_by: newLikedBy
        })
        .eq('id', postId);

      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to like/unlike post');
    }
  }

  static async deletePost(postId: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('user_id', userId);

      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to delete post');
    }
  }

  private static transformPost(data: any): Post {
    return {
      id: data.id,
      user: {
        id: data.users.id,
        username: data.users.username,
        avatar: data.users.avatar,
        artistName: data.users.artist_name,
      },
      caption: data.caption,
      imageUrl: data.image_url,
      musicUrl: data.music_url,
      likes: data.likes || 0,
      likedBy: data.liked_by || [],
      createdAt: data.created_at,
    };
  }
}

