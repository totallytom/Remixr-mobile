import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

const supabaseUrl: string = Constants.expoConfig?.extra?.supabaseUrl ?? "";
const supabaseAnonKey: string = Constants.expoConfig?.extra?.supabaseAnonKey ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Missing Supabase config in app.json extra.supabaseUrl / extra.supabaseAnonKey");
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (url, options) => {
        // Auth requests (sign in, token refresh) must NOT be aborted — killing them
        // causes TOKEN_REFRESH_FAILED which logs the user out on every reload.
        // Only apply the timeout to regular data queries.
        const isAuthRequest = typeof url === 'string' && url.includes('/auth/v1/');
        if (isAuthRequest) {
          return fetch(url, options);
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        return fetch(url, { ...options, signal: controller.signal })
          .finally(() => clearTimeout(timeout));
      },
    },
  }
);


// Database types
export interface Database {
  public: {
    Tables: {
      albums: {
        Row: {
          id: string;
          title: string;
          artist: string;
          cover: string;
          genre: string;
          price?: number;
          description?: string;
          user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          artist: string;
          cover: string;
          genre: string;
          price?: number;
          description?: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          artist?: string;
          cover?: string;
          genre?: string;
          price?: number;
          description?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "albums_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      users: {
        Row: {
          id: string;
          username: string;
          email: string;
          avatar: string;
          followers: number;
          following: number;
          role: 'musician' | 'consumer';
          is_verified: boolean;
          is_private: boolean;
          is_admin?: boolean;
          is_verified_artist?: boolean;
          artist_name?: string;
          bio?: string;
          genres?: string[];
          external_links?: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          username: string;
          email: string;
          avatar?: string;
          followers?: number;
          following?: number;
          role: 'musician' | 'consumer';
          is_verified?: boolean;
          is_private?: boolean;
          is_admin?: boolean;
          is_verified_artist?: boolean;
          artist_name?: string;
          bio?: string;
          genres?: string[];
          external_links?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          email?: string;
          avatar?: string;
          followers?: number;
          following?: number;
          role?: 'musician' | 'consumer';
          is_verified?: boolean;
          is_private?: boolean;
          is_admin?: boolean;
          is_verified_artist?: boolean;
          artist_name?: string;
          bio?: string;
          genres?: string[];
          external_links?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tracks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "playlists_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_receiver_id_fkey";
            columns: ["receiver_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      tracks: {
        Row: {
          id: string;
          title: string;
          artist: string;
          album: string;
          album_id?: string;
          duration: number;
          cover: string;
          audio_url: string;
          price?: number;
          genre: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          preview_start_sec?: number;
          preview_duration_sec?: number;
        };
        Insert: {
          id?: string;
          title: string;
          artist: string;
          album: string;
          album_id?: string;
          duration: number;
          cover: string;
          audio_url: string;
          price?: number;
          genre: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
          preview_start_sec?: number;
          preview_duration_sec?: number;
        };
        Update: {
          id?: string;
          title?: string;
          artist?: string;
          album?: string;
          album_id?: string;
          duration?: number;
          cover?: string;
          audio_url?: string;
          price?: number;
          genre?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
          preview_start_sec?: number;
          preview_duration_sec?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tracks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_track_id_fkey";
            columns: ["id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["track_id"];
          },
          {
            foreignKeyName: "playlist_tracks_track_id_fkey";
            columns: ["id"];
            isOneToOne: false;
            referencedRelation: "playlist_tracks";
            referencedColumns: ["track_id"];
          }
        ];
      };
      user_play_history: {
        Row: {
          id: string;
          user_id: string;
          track_id: string;
          played_at: string;
          play_duration: number;
          completed: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          track_id: string;
          played_at?: string;
          play_duration?: number;
          completed?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          track_id?: string;
          played_at?: string;
          play_duration?: number;
          completed?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "user_play_history_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_play_history_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          }
        ];
      };
      comments: {
        Row: {
          id: string;
          track_id: string;
          post_id?: string;
          user_id: string;
          content: string;
          likes: number;
          liked_by: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          track_id?: string;
          post_id?: string;
          user_id: string;
          content: string;
          likes?: number;
          liked_by?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          track_id?: string;
          post_id?: string;
          user_id?: string;
          content?: string;
          likes?: number;
          liked_by?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      playlists: {
        Row: {
          id: string;
          name: string;
          description?: string;
          cover?: string;
          created_by: string;
          is_public: boolean;
          created_at: string;
          updated_at: string;
          followers: number;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string;
          cover?: string;
          created_by: string;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
          followers?: number;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          cover?: string;
          created_by?: string;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
          followers?: number;
        };
        Relationships: [
          {
            foreignKeyName: "playlists_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "playlist_tracks_playlist_id_fkey";
            columns: ["id"];
            isOneToOne: false;
            referencedRelation: "playlist_tracks";
            referencedColumns: ["playlist_id"];
          }
        ];
      };
      playlist_tracks: {
        Row: {
          id: string;
          playlist_id: string;
          track_id: string;
          position: number;
          added_at: string;
        };
        Insert: {
          id?: string;
          playlist_id: string;
          track_id: string;
          position: number;
          added_at?: string;
        };
        Update: {
          id?: string;
          playlist_id?: string;
          track_id?: string;
          position?: number;
          added_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "playlist_tracks_playlist_id_fkey";
            columns: ["playlist_id"];
            isOneToOne: false;
            referencedRelation: "playlists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "playlist_tracks_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          }
        ];
      };
      messages: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string;
          content: string;
          type: 'text' | 'audio' | 'image' | 'track';
          created_at: string;
        };
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          content: string;
          type?: 'text' | 'audio' | 'image' | 'track';
          created_at?: string;
        };
        Update: {
          id?: string;
          sender_id?: string;
          receiver_id?: string;
          content?: string;
          type?: 'text' | 'audio' | 'image' | 'track';
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_receiver_id_fkey";
            columns: ["receiver_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      posts: {
        Row: {
          id: string;
          user_id: string;
          caption: string;
          image_url?: string | null;
          music_url?: string | null;
          likes: number;
          liked_by: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          caption: string;
          image_url?: string | null;
          music_url?: string | null;
          likes?: number;
          liked_by?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          caption?: string;
          image_url?: string | null;
          music_url?: string | null;
          likes?: number;
          liked_by?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "posts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      follow_requests: {
        Row: {
          id: string;
          requester_id: string;
          target_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          target_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          requester_id?: string;
          target_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      concerts: {
        Row: {
          id: string;
          title: string;
          date: string;
          location: string;
          venue: string;
          description?: string;
          ticket_price?: number;
          ticket_url?: string;
          user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          date: string;
          location: string;
          venue: string;
          description?: string;
          ticket_price?: number;
          ticket_url?: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          date?: string;
          location?: string;
          venue?: string;
          description?: string;
          ticket_price?: number;
          ticket_url?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "concerts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      user_follows: {
        Row: {
          id: string;
          follower_id: string;
          following_id: string;
          followed_at: string;
        };
        Insert: {
          id?: string;
          follower_id: string;
          following_id: string;
          followed_at?: string;
        };
        Update: {
          id?: string;
          follower_id?: string;
          following_id?: string;
          followed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_follows_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_follows_following_id_fkey";
            columns: ["following_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      bookmarks: {
        Row: {
          id: string;
          user_id: string;
          track_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          track_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          track_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bookmarks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookmarks_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_recommended_tracks: {
        Args: {
          user_uuid: string;
          limit_count?: number;
        };
        Returns: {
          id: string;
          title: string;
          artist: string;
          album: string;
          duration: number;
          cover: string;
          audio_url: string;
          price?: number;
          genre: string;
          user_id: string;
          created_at: string;
          recommendation_score: number;
        }[];
      };
      get_tracks_by_genre: {
        Args: {
          genre_filter: string;
          limit_count?: number;
          offset_count?: number;
        };
        Returns: {
          id: string;
          title: string;
          artist: string;
          album: string;
          duration: number;
          cover: string;
          audio_url: string;
          price?: number;
          genre: string;
          user_id: string;
          created_at: string;
          play_count: number;
        }[];
      };
      get_popular_tracks: {
        Args: {
          limit_count?: number;
          offset_count?: number;
        };
        Returns: {
          id: string;
          title: string;
          artist: string;
          album: string;
          duration: number;
          cover: string;
          audio_url: string;
          price?: number;
          genre: string;
          user_id: string;
          created_at: string;
          play_count: number;
        }[];
      };
      search_tracks: {
        Args: {
          search_query: string;
          limit_count?: number;
          offset_count?: number;
        };
        Returns: {
          id: string;
          title: string;
          artist: string;
          album: string;
          duration: number;
          cover: string;
          audio_url: string;
          price?: number;
          genre: string;
          user_id: string;
          created_at: string;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
} 