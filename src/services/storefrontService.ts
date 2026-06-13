import { supabase } from './supabase';

export type LicenseType = 'personal' | 'commercial' | 'exclusive';
export type StoreSortBy = 'newest' | 'popular' | 'price_asc' | 'price_desc';

export interface StoreListing {
  id: string;
  trackId: string;
  sellerId: string;
  price: number;
  licenseType: LicenseType;
  salesCount: number;
  isActive: boolean;
  listedAt: string;
  title: string;
  artist: string;
  cover: string | null;
  audioUrl: string;
  duration: number;
  genre: string | null;
  sellerUsername: string;
  sellerAvatar: string | null;
  sellerVerified: boolean;
  sellerArtistName: string | null;
}

export interface SellerTrack {
  id: string;
  title: string;
  artist: string;
  cover: string | null;
  duration: number;
  genre: string | null;
}

export interface StorePurchase {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  price: number;
  licenseType: LicenseType;
  paymentIntentId?: string;
  purchasedAt: string;
}

export interface StorePurchaseWithDetails {
  id: string;
  listingId: string;
  price: number;
  licenseType: LicenseType;
  purchasedAt: string;
  title: string;
  artist: string;
  cover: string | null;
  sellerUsername: string;
  sellerArtistName: string | null;
}

export interface StoreFilters {
  genre: string | null;
  priceMax: number | null;
  licenseType: 'all' | LicenseType;
  sortBy: StoreSortBy;
  query: string;
}

export interface CreateListingData {
  trackId: string;
  price: number;
  licenseType: LicenseType;
}

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
const TABLE_MISSING = 'does not exist';

async function parseJsonResponse(response: Response, fallbackMessage: string): Promise<any> {
  const text = await response.text();
  let payload: any = {};
  try { if (text) payload = JSON.parse(text); } catch {}
  if (!response.ok) {
    throw new Error(payload.error ?? `${fallbackMessage} (${response.status})`);
  }
  return payload;
}

export class StorefrontService {
  static async getListings(filters?: Partial<StoreFilters>): Promise<StoreListing[]> {
    try {
      let q = supabase
        .from('store_listings' as any)
        .select(`
          id, track_id, seller_id, price, license_type, sales_count, is_active, created_at,
          tracks:track_id (title, artist, cover, audio_url, duration, genre),
          users:seller_id (username, avatar, is_verified, artist_name)
        `)
        .eq('is_active', true);

      if (filters?.licenseType && filters.licenseType !== 'all') {
        q = (q as any).eq('license_type', filters.licenseType);
      }
      if (filters?.priceMax != null) {
        q = (q as any).lte('price', filters.priceMax);
      }

      const sortMap: Record<StoreSortBy, { col: string; asc: boolean }> = {
        newest:     { col: 'created_at', asc: false },
        popular:    { col: 'sales_count', asc: false },
        price_asc:  { col: 'price', asc: true },
        price_desc: { col: 'price', asc: false },
      };
      const sort = sortMap[filters?.sortBy ?? 'newest'];
      q = (q as any).order(sort.col, { ascending: sort.asc });

      const { data, error } = await q;
      if (error) {
        if (error.message.includes(TABLE_MISSING)) return [];
        throw new Error(error.message);
      }

      let rows = (data || []).map((r: any) => this.transformListing(r));

      if (filters?.genre) {
        rows = rows.filter(r => r.genre === filters.genre);
      }
      if (filters?.query) {
        const lq = filters.query.toLowerCase();
        rows = rows.filter(
          r =>
            r.title.toLowerCase().includes(lq) ||
            r.artist.toLowerCase().includes(lq) ||
            r.sellerUsername.toLowerCase().includes(lq),
        );
      }

      return rows;
    } catch (err) {
      if (err instanceof Error && err.message.includes(TABLE_MISSING)) return [];
      throw err;
    }
  }

  static async getArtistListings(sellerId: string): Promise<StoreListing[]> {
    try {
      const { data, error } = await supabase
        .from('store_listings' as any)
        .select(`
          id, track_id, seller_id, price, license_type, sales_count, is_active, created_at,
          tracks:track_id (title, artist, cover, audio_url, duration, genre),
          users:seller_id (username, avatar, is_verified, artist_name)
        `)
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.message.includes(TABLE_MISSING)) return [];
        throw new Error(error.message);
      }
      return (data || []).map((r: any) => this.transformListing(r));
    } catch (err) {
      if (err instanceof Error && err.message.includes(TABLE_MISSING)) return [];
      throw err;
    }
  }

  static async getSellerTracks(sellerId: string): Promise<SellerTrack[]> {
    const { data, error } = await supabase
      .from('tracks')
      .select('id, title, artist, cover, duration, genre')
      .eq('user_id', sellerId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      cover: t.cover ?? null,
      duration: t.duration ?? 0,
      genre: t.genre ?? null,
    }));
  }

  static async createListing(data: CreateListingData, sellerId: string): Promise<StoreListing> {
    const { data: row, error } = await supabase
      .from('store_listings' as any)
      .insert([{
        track_id: data.trackId,
        seller_id: sellerId,
        price: data.price,
        license_type: data.licenseType,
        sales_count: 0,
        is_active: true,
      }])
      .select(`
        id, track_id, seller_id, price, license_type, sales_count, is_active, created_at,
        tracks:track_id (title, artist, cover, audio_url, duration, genre),
        users:seller_id (username, avatar, is_verified, artist_name)
      `)
      .single();

    if (error) throw new Error(error.message);
    return this.transformListing(row);
  }

  static async updateListing(listingId: string, price: number, licenseType: LicenseType): Promise<void> {
    const { error } = await supabase
      .from('store_listings' as any)
      .update({ price, license_type: licenseType })
      .eq('id', listingId);
    if (error) throw new Error(error.message);
  }

  static async toggleListing(listingId: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('store_listings' as any)
      .update({ is_active: isActive })
      .eq('id', listingId);
    if (error) throw new Error(error.message);
  }

  static async initiateStripeCheckout(listingId: string): Promise<{ url: string; sessionId: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE}/api/create-storefront-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ listingId }),
    });

    return parseJsonResponse(response, 'Checkout failed');
  }

  static async getDownloadUrl(listingId: string): Promise<{ downloadUrl: string; filename: string; expiresAt: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE}/api/download-purchase?listing_id=${encodeURIComponent(listingId)}`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });

    return parseJsonResponse(response, 'Download failed');
  }

  static async getPurchaseHistory(buyerId: string): Promise<StorePurchaseWithDetails[]> {
    try {
      const { data, error } = await supabase
        .from('store_purchases' as any)
        .select(`
          id, listing_id, price, license_type, purchased_at,
          store_listings:listing_id (
            tracks:track_id (title, artist, cover),
            users:seller_id (username, artist_name)
          )
        `)
        .eq('buyer_id', buyerId)
        .eq('status', 'completed')
        .order('purchased_at', { ascending: false });

      if (error) {
        if (error.message.includes(TABLE_MISSING)) return [];
        throw new Error(error.message);
      }

      return (data || []).map((r: any) => {
        const listing = Array.isArray(r.store_listings) ? r.store_listings[0] : (r.store_listings ?? {});
        const track   = Array.isArray(listing.tracks)   ? listing.tracks[0]   : (listing.tracks   ?? {});
        const seller  = Array.isArray(listing.users)    ? listing.users[0]    : (listing.users    ?? {});
        return {
          id:               r.id,
          listingId:        r.listing_id,
          price:            Number(r.price),
          licenseType:      r.license_type as LicenseType,
          purchasedAt:      r.purchased_at,
          title:            track.title        ?? 'Unknown Track',
          artist:           track.artist       ?? 'Unknown Artist',
          cover:            track.cover        ?? null,
          sellerUsername:   seller.username    ?? '',
          sellerArtistName: seller.artist_name ?? null,
        };
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes(TABLE_MISSING)) return [];
      throw err;
    }
  }

  static async getPurchasedListingIds(buyerId: string): Promise<Set<string>> {
    try {
      const { data, error } = await supabase
        .from('store_purchases' as any)
        .select('listing_id')
        .eq('buyer_id', buyerId);

      if (error) return new Set();
      return new Set((data || []).map((r: any) => r.listing_id as string));
    } catch {
      return new Set();
    }
  }

  private static transformListing(r: any): StoreListing {
    const track  = Array.isArray(r.tracks) ? r.tracks[0]  : (r.tracks  ?? {});
    const seller = Array.isArray(r.users)  ? r.users[0]   : (r.users   ?? {});
    return {
      id:               r.id,
      trackId:          r.track_id,
      sellerId:         r.seller_id,
      price:            Number(r.price),
      licenseType:      r.license_type as LicenseType,
      salesCount:       r.sales_count ?? 0,
      isActive:         r.is_active ?? true,
      listedAt:         r.created_at,
      title:            track.title        ?? 'Unknown Track',
      artist:           track.artist       ?? 'Unknown Artist',
      cover:            track.cover        ?? null,
      audioUrl:         track.audio_url    ?? '',
      duration:         track.duration     ?? 0,
      genre:            track.genre        ?? null,
      sellerUsername:   seller.username    ?? '',
      sellerAvatar:     seller.avatar      ?? null,
      sellerVerified:   seller.is_verified ?? false,
      sellerArtistName: seller.artist_name ?? null,
    };
  }
}
