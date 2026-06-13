import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Linking,
} from 'react-native';
import { Play, Pause, ShoppingCart, Download, Music } from 'lucide-react-native';
import { StoreListing, LicenseType, StorefrontService } from '../../services/storefrontService';
import { colors, radius, spacing, typography } from '../../theme';

interface StoreTrackCardProps {
  listing: StoreListing;
  isPurchased: boolean;
  isPlaying: boolean;
  onPlay: (listing: StoreListing) => void;
  onBuy: (listing: StoreListing) => void;
  onDownloadError?: (msg: string) => void;
}

const LICENSE_BADGE: Record<LicenseType, { label: string; bg: string; text: string }> = {
  personal:   { label: 'Personal',   bg: 'rgba(59,130,246,0.2)',  text: '#93c5fd' },
  commercial: { label: 'Commercial', bg: 'rgba(139,92,246,0.2)',  text: '#c4b5fd' },
  exclusive:  { label: 'Exclusive',  bg: 'rgba(234,179,8,0.2)',   text: '#fde047' },
};

const StoreTrackCard: React.FC<StoreTrackCardProps> = ({
  listing,
  isPurchased,
  isPlaying,
  onPlay,
  onBuy,
  onDownloadError,
}) => {
  const badge = LICENSE_BADGE[listing.licenseType];
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const { downloadUrl } = await StorefrontService.getDownloadUrl(listing.id);
      await Linking.openURL(downloadUrl);
    } catch (err) {
      onDownloadError?.(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <View style={s.card}>
      {/* Cover */}
      <View style={s.coverContainer}>
        {listing.cover
          ? <Image source={{ uri: listing.cover }} style={s.cover} />
          : (
            <View style={s.coverPlaceholder}>
              <Music size={32} color="rgba(255,255,255,0.2)" />
            </View>
          )
        }

        {/* Play button */}
        <TouchableOpacity style={s.playOverlay} onPress={() => onPlay(listing)} activeOpacity={0.8}>
          {isPlaying
            ? <Pause size={32} color="#fff" fill="#fff" />
            : <Play size={32} color="#fff" fill="#fff" />
          }
        </TouchableOpacity>

        {/* License badge */}
        <View style={[s.badge, { backgroundColor: badge.bg }]}>
          <Text style={[s.badgeText, { color: badge.text }]}>{badge.label}</Text>
        </View>

        {/* Playing indicator */}
        {isPlaying && <View style={s.playingDot} />}
      </View>

      {/* Info */}
      <View style={s.info}>
        <Text style={s.title} numberOfLines={1}>{listing.title}</Text>
        <Text style={s.artist} numberOfLines={1}>
          {listing.sellerArtistName || listing.artist}
        </Text>

        <View style={s.footer}>
          <View>
            <Text style={s.price}>${listing.price.toFixed(2)}</Text>
            {listing.salesCount > 0 && (
              <Text style={s.sales}>{listing.salesCount} sold</Text>
            )}
          </View>

          {isPurchased ? (
            <TouchableOpacity
              style={s.downloadBtn}
              onPress={handleDownload}
              disabled={isDownloading}
              activeOpacity={0.7}
            >
              {isDownloading
                ? <ActivityIndicator size="small" color="#4ade80" />
                : <Download size={14} color="#4ade80" />
              }
              <Text style={s.downloadText}>{isDownloading ? '…' : 'Download'}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.buyBtn} onPress={() => onBuy(listing)} activeOpacity={0.8}>
              <ShoppingCart size={12} color="#000" />
              <Text style={s.buyText}>Buy</Text>
            </TouchableOpacity>
          )}
        </View>

        {listing.genre && (
          <Text style={s.genre}>{listing.genre.toUpperCase()}</Text>
        )}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(30,30,30,0.9)',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  coverContainer: {
    aspectRatio: 1,
    backgroundColor: '#2a2a2a',
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.semibold,
  },
  playingDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ade80',
  },
  info: {
    padding: spacing.md,
    gap: 6,
  },
  title: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textWhite,
  },
  artist: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.5)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  price: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.textWhite,
  },
  sales: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
  },
  buyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.md,
  },
  buyText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: '#000',
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(74,222,128,0.15)',
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.md,
  },
  downloadText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: '#4ade80',
  },
  genre: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.8,
  },
});

export default StoreTrackCard;
