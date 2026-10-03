import type { StoreApi, UseBoundStore } from 'zustand';

export interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'audio' | 'image' | 'track';
  track?: {
    id: string;
    title: string;
    artist: string;
    cover: string;
    audioUrl: string;
    duration: number;
    genre: string;
  };
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  cover: string;
  audioUrl?: string;
  price?: number;
  genre: string;
  boosted?: boolean;
  boostExpiresAt?: Date;
  boostPriority?: number;
  boostUserId?: string;
  remixParentId?: string;
  versionLabel?: string;
  remixOpen?: boolean;
  challengesOpen?: boolean;
  createdAt?: Date;
  bpm?: number;
  previewStartSec?: number;
  previewDurationSec?: number;
  /** tracks.license_type — see src/config/licenses.ts */
  licenseType?: string;
}

export interface Chat {
  id: string;
  participants: User[];
  messages: Message[];
  lastMessage?: Message;
}

export interface User {
  id: string;
  username: string;
  email: string;
  avatar: string;
  followers: number;
  following: number;
  role: 'musician' | 'consumer';
  subscriptionTier?: 'free' | 'fan' | 'artist';
  stripeCustomerId?: string;
  isVerified: boolean;
  isPrivate: boolean;
  isAdmin?: boolean;
  isVerifiedArtist?: boolean;
  artistName?: string;
  bio?: string;
  genres?: string[];
  externalLinks: string[];
  // Pro: enhanced artist profile
  bannerUrl?: string;
  vanityUrl?: string;
  emailConfirmed?: boolean;
}

export const useStore: UseBoundStore<any>;
export type { StoreApi, UseBoundStore };
export type { GroupChat, GroupMessage } from '../services/groupChatService';

/** Override end-of-track behaviour (return true when handled). Returns an unregister function. */
export function setTrackEndHandler(fn: ((track: Track | null) => boolean) | null): () => void;
