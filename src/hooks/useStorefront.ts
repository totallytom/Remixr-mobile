import { useState, useEffect, useCallback } from 'react';
import {
  StorefrontService,
  SellerTrack,
  StoreFilters,
  LicenseType,
  CreateListingData,
  StoreListing,
  StorePurchaseWithDetails,
} from '../services/storefrontService';
import { useStore } from '../store/useStore';
import { MusicService } from '../services/musicService';

export const DEFAULT_FILTERS: StoreFilters = {
  genre: null,
  priceMax: null,
  licenseType: 'all',
  sortBy: 'newest',
  query: '',
};

const PLATFORM_FEE_PCT = 0.07; // 7% platform fee

export function useBrowseStorefront() {
  const { user } = useStore();
  const [listings, setListings] = useState<StoreListing[]>([]);
  const [filters, setFilters] = useState<StoreFilters>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  const [genres, setGenres] = useState<string[]>([]);

  useEffect(() => {
    MusicService.getAvailableGenres().then(setGenres).catch(() => setGenres([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const safety = setTimeout(() => { if (!cancelled) setIsLoading(false); }, 12000);
    setIsLoading(true);
    setError(null);

    StorefrontService.getListings(filters)
      .then(data => { if (!cancelled) setListings(data); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load store'); })
      .finally(() => { if (!cancelled) setIsLoading(false); clearTimeout(safety); });

    return () => { cancelled = true; clearTimeout(safety); };
  }, [filters]);

  useEffect(() => {
    if (!user?.id) { setPurchasedIds(new Set()); return; }
    StorefrontService.getPurchasedListingIds(user.id).then(setPurchasedIds).catch(() => {});
  }, [user?.id]);

  const updateFilters = useCallback((patch: Partial<StoreFilters>) => {
    setFilters(prev => ({ ...prev, ...patch }));
  }, []);

  const markPurchased = useCallback((listingId: string) => {
    setPurchasedIds(prev => new Set([...prev, listingId]));
  }, []);

  const refreshPurchasedIds = useCallback(async () => {
    if (!user?.id) return;
    try {
      const ids = await StorefrontService.getPurchasedListingIds(user.id);
      setPurchasedIds(ids);
    } catch {}
  }, [user?.id]);

  return { listings, filters, updateFilters, isLoading, error, purchasedIds, markPurchased, refreshPurchasedIds, genres };
}

export function useArtistStorefront() {
  const { user } = useStore();
  const [listings, setListings] = useState<StoreListing[]>([]);
  const [unlistedTracks, setUnlistedTracks] = useState<SellerTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [artistListings, sellerTracks] = await Promise.all([
        StorefrontService.getArtistListings(user.id),
        StorefrontService.getSellerTracks(user.id),
      ]);
      setListings(artistListings);
      const listedIds = new Set(artistListings.map(l => l.trackId));
      setUnlistedTracks(sellerTracks.filter(t => !listedIds.has(t.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your store');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const addListing = useCallback(async (data: CreateListingData) => {
    if (!user?.id) throw new Error('Not authenticated');
    const listing = await StorefrontService.createListing(data, user.id);
    setListings(prev => [listing, ...prev]);
    setUnlistedTracks(prev => prev.filter(t => t.id !== data.trackId));
    return listing;
  }, [user?.id]);

  const toggleActive = useCallback(async (listingId: string, isActive: boolean) => {
    await StorefrontService.toggleListing(listingId, isActive);
    setListings(prev => prev.map(l => l.id === listingId ? { ...l, isActive } : l));
  }, []);

  const updatePrice = useCallback(async (listingId: string, price: number, licenseType: LicenseType) => {
    await StorefrontService.updateListing(listingId, price, licenseType);
    setListings(prev => prev.map(l => l.id === listingId ? { ...l, price, licenseType } : l));
  }, []);

  const totalRevenue = listings.reduce(
    (sum, l) => sum + l.salesCount * (l.price * (1 - PLATFORM_FEE_PCT - 0.029) - 0.30),
    0,
  );
  const totalSales = listings.reduce((sum, l) => sum + l.salesCount, 0);

  return { listings, unlistedTracks, isLoading, error, addListing, toggleActive, updatePrice, reload: load, totalRevenue, totalSales };
}

export function usePurchaseHistory() {
  const { user } = useStore();
  const [purchases, setPurchases] = useState<StorePurchaseWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await StorefrontService.getPurchaseHistory(user.id);
      setPurchases(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load purchase history');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  return { purchases, isLoading, error, reload: load };
}
