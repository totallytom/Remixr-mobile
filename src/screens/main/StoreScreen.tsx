import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Alert,
  StyleSheet,
  Linking,
  TextInput,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShoppingBag, Music, CreditCard, Store, Download, Plus, ToggleLeft, ToggleRight, AlertCircle } from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { useBrowseStorefront, usePurchaseHistory, useArtistStorefront } from '../../hooks/useStorefront';
import { StorefrontService, StoreListing, LicenseType, CreateListingData } from '../../services/storefrontService';
import StoreTrackCard from '../../components/storefront/StoreTrackCard';
import StoreFiltersBar from '../../components/storefront/StoreFilters';
import PurchaseModal from '../../components/storefront/PurchaseModal';
import { colors, radius, spacing, typography } from '../../theme';

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

type Tab = 'browse' | 'purchases' | 'my-store' | 'payments';

const LICENSE_OPTIONS: { value: LicenseType; label: string }[] = [
  { value: 'personal',   label: 'Personal' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'exclusive',  label: 'Exclusive' },
];

// ─── Add Listing Form ─────────────────────────────────────────────────────────
interface AddListingFormProps {
  unlistedTracks: ReturnType<typeof useArtistStorefront>['unlistedTracks'];
  onAdd: (data: CreateListingData) => Promise<void>;
}

const AddListingForm: React.FC<AddListingFormProps> = ({ unlistedTracks, onAdd }) => {
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [licenseType, setLicenseType] = useState<LicenseType>('personal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTrackPicker, setShowTrackPicker] = useState(false);

  const selectedTrack = unlistedTracks.find(t => t.id === selectedTrackId);

  const handleSubmit = async () => {
    if (!selectedTrackId || !price || Number(price) <= 0) {
      Alert.alert('Missing fields', 'Please select a track and set a valid price.');
      return;
    }
    setIsSubmitting(true);
    try {
      await onAdd({ trackId: selectedTrackId, price: Number(price), licenseType });
      setSelectedTrackId(null);
      setPrice('');
      setLicenseType('personal');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create listing');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (unlistedTracks.length === 0) {
    return (
      <View style={f.empty}>
        <Text style={f.emptyText}>All your tracks are already listed.</Text>
      </View>
    );
  }

  return (
    <View style={f.container}>
      <Text style={f.sectionTitle}>List a Track for Sale</Text>

      {/* Track picker */}
      <TouchableOpacity style={f.picker} onPress={() => setShowTrackPicker(v => !v)} activeOpacity={0.8}>
        <Music size={16} color={colors.textMuted} />
        <Text style={[f.pickerText, selectedTrack && f.pickerSelected]}>
          {selectedTrack ? selectedTrack.title : 'Select a track…'}
        </Text>
      </TouchableOpacity>

      {showTrackPicker && (
        <View style={f.trackList}>
          {unlistedTracks.map(track => (
            <TouchableOpacity
              key={track.id}
              style={[f.trackRow, selectedTrackId === track.id && f.trackRowSelected]}
              onPress={() => { setSelectedTrackId(track.id); setShowTrackPicker(false); }}
              activeOpacity={0.7}
            >
              {track.cover
                ? <Image source={{ uri: track.cover }} style={f.trackThumb} />
                : <View style={[f.trackThumb, f.trackThumbEmpty]}><Music size={14} color={colors.textMuted} /></View>
              }
              <Text style={f.trackName} numberOfLines={1}>{track.title}</Text>
              {selectedTrackId === track.id && (
                <View style={f.checkDot} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Price */}
      <View style={f.priceRow}>
        <Text style={f.pricePrefix}>$</Text>
        <TextInput
          style={f.priceInput}
          value={price}
          onChangeText={setPrice}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
        />
      </View>

      {/* License type */}
      <View style={f.licenseRow}>
        {LICENSE_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[f.licenseChip, licenseType === opt.value && f.licenseChipActive]}
            onPress={() => setLicenseType(opt.value)}
            activeOpacity={0.7}
          >
            <Text style={[f.licenseChipText, licenseType === opt.value && f.licenseChipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[f.submitBtn, (!selectedTrackId || !price || isSubmitting) && f.submitDisabled]}
        onPress={handleSubmit}
        disabled={!selectedTrackId || !price || isSubmitting}
        activeOpacity={0.8}
      >
        {isSubmitting
          ? <ActivityIndicator size="small" color="#000" />
          : <><Plus size={16} color="#000" /><Text style={f.submitText}>List for Sale</Text></>
        }
      </TouchableOpacity>
    </View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
const StoreScreen: React.FC = () => {
  const { user, playTrack } = useStore();
  const [activeTab, setActiveTab] = useState<Tab>('browse');
  const [selectedListing, setSelectedListing] = useState<StoreListing | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const browse = useBrowseStorefront();
  const purchases = usePurchaseHistory();
  const artistStore = useArtistStorefront();

  const isMusicianTab = user?.role === 'musician';

  const handlePlay = useCallback((listing: StoreListing) => {
    if (playingId === listing.id) {
      setPlayingId(null);
      return;
    }
    setPlayingId(listing.id);
    playTrack({
      id: listing.id,
      title: listing.title,
      artist: listing.sellerArtistName || listing.artist,
      audioUrl: listing.audioUrl,
      cover: listing.cover,
    });
  }, [playingId, playTrack]);

  const handleStripeConnect = async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`${API_BASE}/api/create-stripe-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await response.json();
      if (data.url) {
        await Linking.openURL(data.url);
      } else {
        Alert.alert('Error', data.error || 'Failed to start Stripe setup');
      }
    } catch {
      Alert.alert('Error', 'Could not connect to Stripe. Please try again.');
    }
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'browse',    label: 'Browse',    icon: <ShoppingBag size={16} color="currentColor" /> },
    { id: 'purchases', label: 'Purchases', icon: <Download size={16} color="currentColor" /> },
    ...(isMusicianTab ? [
      { id: 'my-store' as Tab, label: 'My Store', icon: <Store size={16} color="currentColor" /> },
      { id: 'payments' as Tab, label: 'Payments', icon: <CreditCard size={16} color="currentColor" /> },
    ] : []),
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Store</Text>
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[s.tab, active && s.tabActive]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.7}
            >
              <Text style={[s.tabText, active && s.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Browse Tab ── */}
      {activeTab === 'browse' && (
        <FlatList
          data={browse.listings}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={s.grid}
          contentContainerStyle={s.listContent}
          ListHeaderComponent={
            <View style={s.filtersContainer}>
              <StoreFiltersBar
                filters={browse.filters}
                genres={browse.genres}
                onChange={browse.updateFilters}
              />
              {downloadError && (
                <View style={s.errorBanner}>
                  <AlertCircle size={14} color="#f87171" />
                  <Text style={s.errorBannerText}>{downloadError}</Text>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            browse.isLoading
              ? <ActivityIndicator size="large" color={colors.primary} style={s.loader} />
              : browse.error
                ? <Text style={s.errorText}>{browse.error}</Text>
                : <Text style={s.emptyText}>No listings found.</Text>
          }
          renderItem={({ item }) => (
            <View style={s.cardWrapper}>
              <StoreTrackCard
                listing={item}
                isPurchased={browse.purchasedIds.has(item.id)}
                isPlaying={playingId === item.id}
                onPlay={handlePlay}
                onBuy={setSelectedListing}
                onDownloadError={setDownloadError}
              />
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={browse.isLoading}
              onRefresh={() => { browse.updateFilters({}); browse.refreshPurchasedIds(); }}
              tintColor={colors.primary}
            />
          }
        />
      )}

      {/* ── Purchases Tab ── */}
      {activeTab === 'purchases' && (
        <FlatList
          data={purchases.purchases}
          keyExtractor={item => item.id}
          contentContainerStyle={s.listContent}
          ListEmptyComponent={
            purchases.isLoading
              ? <ActivityIndicator size="large" color={colors.primary} style={s.loader} />
              : purchases.error
                ? <Text style={s.errorText}>{purchases.error}</Text>
                : (
                  <View style={s.emptyState}>
                    <ShoppingBag size={40} color={colors.textMuted} />
                    <Text style={s.emptyText}>No purchases yet.</Text>
                    <Text style={s.emptySubtext}>Buy tracks from the Browse tab.</Text>
                  </View>
                )
          }
          renderItem={({ item }) => (
            <PurchaseHistoryRow
              purchase={item}
              onDownloadError={setDownloadError}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={purchases.isLoading} onRefresh={purchases.reload} tintColor={colors.primary} />
          }
        />
      )}

      {/* ── My Store Tab ── */}
      {activeTab === 'my-store' && (
        <FlatList
          data={artistStore.listings}
          keyExtractor={item => item.id}
          contentContainerStyle={s.listContent}
          ListHeaderComponent={
            <View style={s.myStoreHeader}>
              {/* Stats */}
              <View style={s.statsRow}>
                <View style={s.statBox}>
                  <Text style={s.statValue}>{artistStore.totalSales}</Text>
                  <Text style={s.statLabel}>Total Sales</Text>
                </View>
                <View style={s.statBox}>
                  <Text style={s.statValue}>${artistStore.totalRevenue.toFixed(2)}</Text>
                  <Text style={s.statLabel}>Est. Revenue</Text>
                </View>
                <View style={s.statBox}>
                  <Text style={s.statValue}>{artistStore.listings.length}</Text>
                  <Text style={s.statLabel}>Listings</Text>
                </View>
              </View>
              {/* Add listing form */}
              <AddListingForm
                unlistedTracks={artistStore.unlistedTracks}
                onAdd={artistStore.addListing}
              />
              {artistStore.listings.length > 0 && (
                <Text style={s.sectionTitle}>Your Listings</Text>
              )}
            </View>
          }
          ListEmptyComponent={
            artistStore.isLoading
              ? <ActivityIndicator size="large" color={colors.primary} style={s.loader} />
              : !artistStore.isLoading && artistStore.listings.length === 0
                ? null
                : artistStore.error
                  ? <Text style={s.errorText}>{artistStore.error}</Text>
                  : null
          }
          renderItem={({ item }) => (
            <MyListingRow
              listing={item}
              onToggle={artistStore.toggleActive}
              onUpdatePrice={artistStore.updatePrice}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={artistStore.isLoading} onRefresh={artistStore.reload} tintColor={colors.primary} />
          }
        />
      )}

      {/* ── Payments Tab ── */}
      {activeTab === 'payments' && (
        <View style={s.paymentsTab}>
          <View style={s.paymentsCard}>
            <CreditCard size={32} color={colors.primary} />
            <Text style={s.paymentsTitle}>Stripe Connect</Text>
            <Text style={s.paymentsDesc}>
              Set up payouts to receive money when your tracks are purchased. You'll be redirected to Stripe to complete setup.
            </Text>
            {user?.stripeAccountId ? (
              <View style={s.connectedBadge}>
                <Text style={s.connectedText}>✓ Connected</Text>
              </View>
            ) : (
              <TouchableOpacity style={s.connectBtn} onPress={handleStripeConnect} activeOpacity={0.8}>
                <Text style={s.connectBtnText}>Set Up Payouts</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={s.feeNote}>Platform fee: 7% per sale + Stripe processing (2.9% + $0.30)</Text>
        </View>
      )}

      {/* Purchase modal */}
      <PurchaseModal
        listing={selectedListing}
        isOpen={!!selectedListing}
        onClose={() => setSelectedListing(null)}
        onPurchaseInitiated={() => {
          setSelectedListing(null);
          setTimeout(() => browse.refreshPurchasedIds(), 5000);
        }}
      />
    </SafeAreaView>
  );
};

// ─── Purchase History Row ─────────────────────────────────────────────────────
interface PurchaseHistoryRowProps {
  purchase: ReturnType<typeof usePurchaseHistory>['purchases'][number];
  onDownloadError: (msg: string) => void;
}

const PurchaseHistoryRow: React.FC<PurchaseHistoryRowProps> = ({ purchase, onDownloadError }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const { downloadUrl } = await StorefrontService.getDownloadUrl(purchase.listingId);
      await Linking.openURL(downloadUrl);
    } catch (err) {
      onDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  const date = new Date(purchase.purchasedAt).toLocaleDateString();

  return (
    <View style={p.row}>
      <View style={p.coverBox}>
        {purchase.cover
          ? <Image source={{ uri: purchase.cover }} style={p.cover} />
          : <View style={p.coverEmpty}><Music size={18} color={colors.textMuted} /></View>
        }
      </View>
      <View style={p.info}>
        <Text style={p.title} numberOfLines={1}>{purchase.title}</Text>
        <Text style={p.meta}>{purchase.sellerArtistName || purchase.sellerUsername} · {date}</Text>
        <View style={p.badges}>
          <View style={p.licenseBadge}>
            <Text style={p.licenseBadgeText}>{purchase.licenseType}</Text>
          </View>
          <Text style={p.price}>${purchase.price.toFixed(2)}</Text>
        </View>
      </View>
      <TouchableOpacity style={p.dlBtn} onPress={handleDownload} disabled={isDownloading} activeOpacity={0.7}>
        {isDownloading
          ? <ActivityIndicator size="small" color={colors.primary} />
          : <Download size={18} color={colors.primary} />
        }
      </TouchableOpacity>
    </View>
  );
};

// ─── My Listing Row ───────────────────────────────────────────────────────────
interface MyListingRowProps {
  listing: StoreListing;
  onToggle: (id: string, active: boolean) => Promise<void>;
  onUpdatePrice: (id: string, price: number, licenseType: LicenseType) => Promise<void>;
}

const MyListingRow: React.FC<MyListingRowProps> = ({ listing, onToggle, onUpdatePrice }) => {
  const [isToggling, setIsToggling] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editPrice, setEditPrice] = useState(listing.price.toFixed(2));

  const handleToggle = async (val: boolean) => {
    setIsToggling(true);
    try { await onToggle(listing.id, val); }
    catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update'); }
    finally { setIsToggling(false); }
  };

  const handleSavePrice = async () => {
    const price = Number(editPrice);
    if (!price || price <= 0) { Alert.alert('Invalid price'); return; }
    try {
      await onUpdatePrice(listing.id, price, listing.licenseType);
      setIsEditing(false);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update price');
    }
  };

  return (
    <View style={ml.row}>
      {listing.cover
        ? <Image source={{ uri: listing.cover }} style={ml.cover} />
        : <View style={[ml.cover, ml.coverEmpty]}><Music size={14} color={colors.textMuted} /></View>
      }
      <View style={ml.info}>
        <Text style={ml.title} numberOfLines={1}>{listing.title}</Text>
        <View style={ml.metaRow}>
          {isEditing ? (
            <View style={ml.editRow}>
              <Text style={ml.pricePrefix}>$</Text>
              <TextInput
                style={ml.priceInput}
                value={editPrice}
                onChangeText={setEditPrice}
                keyboardType="decimal-pad"
                autoFocus
              />
              <TouchableOpacity style={ml.saveBtn} onPress={handleSavePrice}>
                <Text style={ml.saveBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsEditing(false)}>
                <Text style={ml.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setIsEditing(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={ml.price}>${listing.price.toFixed(2)} · {listing.licenseType}</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={ml.sales}>{listing.salesCount} sold</Text>
      </View>
      {isToggling
        ? <ActivityIndicator size="small" color={colors.primary} />
        : (
          <Switch
            value={listing.isActive}
            onValueChange={handleToggle}
            trackColor={{ false: '#333', true: colors.primary }}
            thumbColor="#fff"
          />
        )
      }
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textWhite,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: 'rgba(255,255,255,0.6)',
  },
  tabTextActive: {
    color: '#000',
    fontWeight: typography.fontWeight.semibold,
  },
  listContent: {
    padding: spacing.base,
    paddingBottom: 120,
  },
  filtersContainer: {
    marginBottom: spacing.base,
    gap: spacing.sm,
  },
  grid: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  cardWrapper: {
    flex: 1,
  },
  loader: { marginTop: 40 },
  errorText: { color: '#f87171', textAlign: 'center', marginTop: 40 },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  emptySubtext: { color: 'rgba(255,255,255,0.3)', textAlign: 'center', fontSize: typography.fontSize.sm, marginTop: 4 },
  emptyState: { alignItems: 'center', marginTop: 60, gap: spacing.sm },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorBannerText: { flex: 1, color: '#fca5a5', fontSize: typography.fontSize.sm },
  myStoreHeader: { marginBottom: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.base },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.primary },
  statLabel: { fontSize: typography.fontSize.xs, color: colors.textMuted, marginTop: 2 },
  sectionTitle: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.textWhite, marginTop: spacing.base, marginBottom: spacing.sm },
  paymentsTab: { flex: 1, padding: spacing.base, justifyContent: 'center', alignItems: 'center', gap: spacing.base },
  paymentsCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  paymentsTitle: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.textWhite },
  paymentsDesc: { fontSize: typography.fontSize.base, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  connectBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  connectBtnText: { color: '#000', fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.base },
  connectedBadge: { backgroundColor: 'rgba(74,222,128,0.15)', paddingHorizontal: spacing.base, paddingVertical: spacing.sm, borderRadius: radius.full },
  connectedText: { color: '#4ade80', fontWeight: typography.fontWeight.semibold },
  feeNote: { fontSize: typography.fontSize.sm, color: colors.textMuted, textAlign: 'center' },
});

const p = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  coverBox: { width: 52, height: 52, borderRadius: radius.md, overflow: 'hidden', flexShrink: 0 },
  cover: { width: '100%', height: '100%' },
  coverEmpty: { width: '100%', height: '100%', backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  title: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.textWhite },
  meta: { fontSize: typography.fontSize.sm, color: colors.textMuted, marginTop: 2 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  licenseBadge: { backgroundColor: 'rgba(139,92,246,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  licenseBadgeText: { fontSize: 10, color: '#c4b5fd', fontWeight: typography.fontWeight.medium },
  price: { fontSize: typography.fontSize.sm, color: colors.textMuted },
  dlBtn: { padding: spacing.sm },
});

const ml = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  cover: { width: 44, height: 44, borderRadius: radius.md },
  coverEmpty: { backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  title: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.medium, color: colors.textWhite },
  metaRow: { marginTop: 2 },
  price: { fontSize: typography.fontSize.sm, color: colors.textMuted },
  sales: { fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pricePrefix: { color: colors.textMuted, fontSize: typography.fontSize.sm },
  priceInput: { width: 60, color: colors.textWhite, fontSize: typography.fontSize.sm, borderBottomWidth: 1, borderBottomColor: colors.primary, padding: 0 },
  saveBtn: { backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  saveBtnText: { fontSize: 11, fontWeight: typography.fontWeight.bold, color: '#000' },
  cancelBtnText: { fontSize: 11, color: colors.textMuted },
});

const f = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.lg,
    padding: spacing.base,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.textWhite },
  empty: { padding: spacing.base },
  emptyText: { color: colors.textMuted, fontSize: typography.fontSize.sm },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pickerText: { flex: 1, fontSize: typography.fontSize.base, color: colors.textMuted },
  pickerSelected: { color: colors.textWhite },
  trackList: {
    backgroundColor: '#1a1a1a',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  trackRowSelected: { backgroundColor: 'rgba(138,236,159,0.08)' },
  trackThumb: { width: 36, height: 36, borderRadius: radius.sm },
  trackThumbEmpty: { backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  trackName: { flex: 1, fontSize: typography.fontSize.base, color: colors.textWhite },
  checkDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pricePrefix: { fontSize: typography.fontSize.md, color: colors.textMuted, paddingVertical: spacing.md },
  priceInput: {
    flex: 1,
    fontSize: typography.fontSize.md,
    color: colors.textWhite,
    paddingVertical: spacing.md,
    paddingLeft: 4,
  },
  licenseRow: { flexDirection: 'row', gap: spacing.sm },
  licenseChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  licenseChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  licenseChipText: { fontSize: typography.fontSize.sm, color: 'rgba(255,255,255,0.6)', fontWeight: typography.fontWeight.medium },
  licenseChipTextActive: { color: '#000', fontWeight: typography.fontWeight.semibold },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.bold, color: '#000' },
});

export default StoreScreen;
