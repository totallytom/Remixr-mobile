import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
  Linking,
} from 'react-native';
import { Music, Shield, Lock, AlertCircle, X } from 'lucide-react-native';
import { StoreListing, StorefrontService } from '../../services/storefrontService';
import { colors, radius, spacing, typography } from '../../theme';

const LICENSE_DESCRIPTIONS: Record<string, string> = {
  personal:   'For personal, non-commercial use only.',
  commercial: 'Use in commercial projects, content, and monetized platforms.',
  exclusive:  'Full exclusive ownership — seller removes the listing after purchase.',
};

interface PurchaseModalProps {
  listing: StoreListing | null;
  isOpen: boolean;
  onClose: () => void;
  onPurchaseInitiated?: () => void;
}

const PurchaseModal: React.FC<PurchaseModalProps> = ({ listing, isOpen, onClose, onPurchaseInitiated }) => {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!listing) return null;

  const handlePay = async () => {
    setIsRedirecting(true);
    setError(null);
    try {
      const { url } = await StorefrontService.initiateStripeCheckout(listing.id);
      await Linking.openURL(url);
      onPurchaseInitiated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed. Please try again.');
      setIsRedirecting(false);
    }
  };

  const licenseLabel = listing.licenseType.charAt(0).toUpperCase() + listing.licenseType.slice(1);

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <View style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <Text style={s.headerTitle}>Complete Purchase</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={s.body}>
            {/* Track info */}
            <View style={s.trackRow}>
              <View style={s.coverBox}>
                {listing.cover
                  ? <Image source={{ uri: listing.cover }} style={s.cover} />
                  : <Music size={24} color={colors.textMuted} />
                }
              </View>
              <View style={s.trackInfo}>
                <Text style={s.trackTitle} numberOfLines={1}>{listing.title}</Text>
                <Text style={s.trackArtist} numberOfLines={1}>
                  {listing.sellerArtistName || listing.artist}
                </Text>
              </View>
            </View>

            {/* License */}
            <View style={s.licenseBox}>
              <View style={s.licenseRow}>
                <Shield size={14} color={colors.primary} />
                <Text style={s.licenseLabel}>{licenseLabel} License</Text>
              </View>
              <Text style={s.licenseDesc}>{LICENSE_DESCRIPTIONS[listing.licenseType]}</Text>
            </View>

            {/* Price */}
            <View style={s.priceRow}>
              <Text style={s.priceLabel}>Total</Text>
              <Text style={s.priceValue}>${listing.price.toFixed(2)}</Text>
            </View>

            {/* Error */}
            {error && (
              <View style={s.errorBox}>
                <AlertCircle size={14} color="#f87171" style={{ marginTop: 1 }} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            {/* Actions */}
            <View style={s.actions}>
              <TouchableOpacity style={s.cancelBtn} onPress={onClose} disabled={isRedirecting}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.payBtn, isRedirecting && s.disabled]} onPress={handlePay} disabled={isRedirecting}>
                {isRedirecting ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <>
                    <Lock size={14} color="#000" />
                    <Text style={s.payText}>Pay ${listing.price.toFixed(2)}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <Text style={s.stripeNote}>You'll be redirected to Stripe's secure payment page</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.base,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1a1a1a',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textWhite,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  body: {
    padding: spacing.base,
    gap: spacing.md,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  coverBox: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textWhite,
  },
  trackArtist: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  licenseBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  licenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  licenseLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textWhite,
  },
  licenseDesc: {
    fontSize: typography.fontSize.sm,
    color: colors.textMuted,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLabel: {
    fontSize: typography.fontSize.base,
    color: colors.textMuted,
  },
  priceValue: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textWhite,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: '#fca5a5',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.textMuted,
  },
  payBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  payText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: '#000',
  },
  disabled: {
    opacity: 0.5,
  },
  stripeNote: {
    fontSize: typography.fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

export default PurchaseModal;
