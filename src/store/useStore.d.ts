import type { StoreApi, UseBoundStore } from 'zustand';

export interface User {
  id: string;
  username: string;
  email: string;
  avatar: string;
  followers: number;
  following: number;
  role: 'musician' | 'consumer';
  subscriptionTier?: 'free' | 'pro';
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
