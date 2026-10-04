import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text as RNText,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  type TextProps,
} from 'react-native';
import { FONTS } from '../../utils/fonts';
import { colors } from '../../theme';
import { X, Check, Sparkles, Star } from 'lucide-react-native';
import type { PurchasesPackage, PurchasesOffering } from 'react-native-purchases';
import {
  getActiveSubscription,
  getCustomerInfo,
  getOfferings,
  openSubscriptionManagement,
  purchasableTiers,
  purchasePackage,
  restorePurchases,
  subscriptionSourceMessage,
  type ActiveSubscription,
} from '../../services/revenueCatService';
import { useStore } from '../../store/useStore';
import { FAN_TIER_ENABLED } from '../../config/features';
import { useTranslation } from 'react-i18next';

const Text = ({ style, ...props }: TextProps) => (
  <RNText style={[{ fontFamily: FONTS.body }, style]} {...props} />
);

interface Props {
  visible: boolean;
  onClose: () => void;
}

// Only what the app actually delivers today. Artist matches the website's "Pro"
// plan (same subscription, same account); keep both lists in sync with the
// website's Upgrade page and with the gating code they describe.
// Fan has no perks of its own yet (it was ad-free; the app no longer shows ads).
// It stays hidden via FAN_TIER_ENABLED until it gets one.
const FAN_PERKS: string[] = [];

// Translation keys (subscription.perks.*).
const ARTIST_PERKS = [
  'subscription.perks.uploads',
  'subscription.perks.discover',
  'subscription.perks.concerts',
  'subscription.perks.analytics',
  'subscription.perks.profile',
  'subscription.perks.badge',
];

// Groups RevenueCat packages by tier via a naming contract: each package's
// identifier or underlying product identifier should contain "fan" or "artist"
// (e.g. "artist_monthly", "fan_annual") — set products up that way in the
// RevenueCat/App Store Connect/Play Console dashboards, or this can't tell them apart.
/** The ISO 8601 billing period from the store, as a package-type key. */
const PERIOD_FROM_ISO: Record<string, string> = {
  P1W: 'WEEKLY', P7D: 'WEEKLY', P1M: 'MONTHLY', P2M: 'TWO_MONTH',
  P3M: 'THREE_MONTH', P6M: 'SIX_MONTH', P1Y: 'ANNUAL', P12M: 'ANNUAL',
};

/**
 * Billing period of a package. Packages with custom identifiers (e.g.
 * "com.sypher.mobile.artist_monthly") come back as type CUSTOM, so fall back to
 * the product's own subscription period from the App Store.
 */
function periodOf(pkg: PurchasesPackage): string {
  if (pkg.packageType && pkg.packageType !== 'CUSTOM' && pkg.packageType !== 'UNKNOWN') return pkg.packageType;
  return PERIOD_FROM_ISO[pkg.product.subscriptionPeriod ?? ''] ?? pkg.packageType;
}

function tierOfPackage(pkg: PurchasesPackage): 'fan' | 'artist' | null {
  const id = `${pkg.identifier} ${pkg.product.identifier}`.toLowerCase();
  if (id.includes('artist')) return 'artist';
  if (id.includes('fan')) return 'fan';
  return null;
}


const TierCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  perks: string[];
  packages: PurchasesPackage[];
  accent: string;
  /** 'current' = the user's plan; 'locked' = can't be bought here (see purchasableTiers). */
  status: 'available' | 'current' | 'locked';
  purchasingId: string | null;
  onPurchase: (pkg: PurchasesPackage) => void;
}> = ({ title, icon, perks, packages, accent, status, purchasingId, onPurchase }) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<PurchasesPackage | null>(packages[0] ?? null);
  const periodLabel = (type: string) => t(`subscription.period.${type}`, { defaultValue: type });

  useEffect(() => {
    if (!selected && packages[0]) setSelected(packages[0]);
  }, [packages, selected]);

  return (
    <View
      className="rounded-2xl border p-5 gap-4"
      style={{ backgroundColor: colors.surface, borderColor: colors.border }}
    >
      <View className="flex-row items-center gap-2">
        {icon}
        <Text className="text-lg font-bold" style={{ color: colors.text }}>{title}</Text>
        {status === 'current' && (
          <View className="ml-auto px-2.5 py-1 rounded-full" style={{ backgroundColor: accent + '33' }}>
            <Text className="text-xs font-semibold" style={{ color: colors.text }}>{t('subscription.currentPlan')}</Text>
          </View>
        )}
      </View>

      <View className="gap-2">
        {perks.map((perk) => (
          <View key={perk} className="flex-row items-start gap-2">
            <Check size={16} color={accent} style={{ marginTop: 2 }} />
            <Text className="flex-1 text-sm" style={{ color: colors.textSecondary }}>{t(perk)}</Text>
          </View>
        ))}
      </View>

      {status !== 'available' ? null : packages.length === 0 ? (
        <Text className="text-sm" style={{ color: colors.textMuted }}>{t('subscription.notAvailable')}</Text>
      ) : (
        <>
          {packages.length > 1 && (
            <View className="flex-row gap-2">
              {packages.map((pkg) => {
                const active = selected?.identifier === pkg.identifier;
                const label = periodLabel(periodOf(pkg));
                return (
                  <TouchableOpacity
                    key={pkg.identifier}
                    onPress={() => setSelected(pkg)}
                    className="flex-1 py-2 rounded-xl border items-center"
                    style={{
                      backgroundColor: active ? accent + '22' : colors.surfaceElevated,
                      borderColor: active ? accent : colors.border,
                    }}
                  >
                    <Text className="text-xs font-medium" style={{ color: active ? accent : colors.textSecondary }}>
                      {'/ ' + label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <TouchableOpacity
            onPress={() => selected && onPurchase(selected)}
            disabled={!selected || purchasingId === selected?.identifier}
            className="py-3 rounded-xl items-center flex-row justify-center gap-2"
            style={{ backgroundColor: accent, opacity: !selected ? 0.5 : 1 }}
          >
            {purchasingId === selected?.identifier ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text className="font-semibold text-black">
                {selected
                  ? t('subscription.subscribeWithPrice', { price: selected.product.priceString, period: periodLabel(periodOf(selected)) })
                  : t('subscription.subscribe')}
              </Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const SubscriptionModal: React.FC<Props> = ({ visible, onClose }) => {
  const { applyRevenueCatEntitlement } = useStore() as any;
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<ActiveSubscription | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      // Customer info first: it decides what may be sold (no double subscriptions).
      const [current, info] = await Promise.all([getOfferings(), getCustomerInfo()]);
      setOffering(current);
      setActiveSub(getActiveSubscription(info));
    } catch (e: any) {
      // RevenueCat explains why (no products from App Store Connect, missing key…).
      const reason = [e?.code, e?.message, e?.underlyingErrorMessage].filter(Boolean).join(' · ');
      console.warn('[subscriptions] could not load offerings:', reason);
      setLoadError(__DEV__ && reason ? `${t('subscription.loadFailed')}

${reason}` : t('subscription.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const packages = offering?.availablePackages ?? [];
  const fanPackages = packages.filter((p) => tierOfPackage(p) === 'fan');
  const artistPackages = packages.filter((p) => tierOfPackage(p) === 'artist');
  const sellable = purchasableTiers(activeSub);
  const statusOf = (tier: 'fan' | 'artist') =>
    activeSub?.tier === tier ? 'current' : sellable.includes(tier) ? 'available' : 'locked';

  const handleManage = async () => {
    try {
      const result = await openSubscriptionManagement();
      if (!result.handled && result.message) Alert.alert(t('subscription.manage'), result.message);
    } catch (e) {
      Alert.alert(t('common.error'), t('subscription.manageFailed'));
    }
  };

  const handlePurchase = async (pkg: PurchasesPackage) => {
    setPurchasingId(pkg.identifier);
    try {
      const customerInfo = await purchasePackage(pkg);
      await applyRevenueCatEntitlement(customerInfo);
      onClose();
    } catch (e: any) {
      if (!e?.userCancelled) {
        Alert.alert(t('subscription.purchaseFailed'), e?.message ?? t('common.tryAgain'));
      }
    } finally {
      setPurchasingId(null);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      const customerInfo = await restorePurchases();
      await applyRevenueCatEntitlement(customerInfo);
      Alert.alert(t('subscription.restored'), t('subscription.restoredBody'));
    } catch (e) {
      Alert.alert(t('subscription.restoreFailed'), e instanceof Error ? e.message : t('common.tryAgain'));
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
        <View
          className="rounded-t-3xl"
          style={{ backgroundColor: colors.background, maxHeight: '88%' }}
        >
          <View className="flex-row items-center justify-between px-5 pt-5 pb-2">
            <Text className="text-xl font-bold" style={{ color: colors.text }}>{t('subscription.title')}</Text>
            <TouchableOpacity onPress={onClose} className="p-2 rounded-full" style={{ backgroundColor: colors.surfaceElevated }}>
              <X size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View className="items-center py-16">
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : loadError ? (
            <View className="items-center py-16 px-6 gap-3">
              <Text className="text-sm text-center" style={{ color: colors.textMuted }}>{loadError}</Text>
              <TouchableOpacity onPress={load} className="px-4 py-2 rounded-xl" style={{ backgroundColor: colors.accent }}>
                <Text className="text-white text-sm font-medium">{t('subscription.tryAgain')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
              {activeSub && (
                <View
                  className="rounded-2xl border p-4 gap-2"
                  style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                >
                  <Text className="text-sm" style={{ color: colors.text }}>
                    {subscriptionSourceMessage(activeSub)}
                  </Text>
                  {activeSub.source === 'this_store' && activeSub.tier === 'fan' && (
                    <Text className="text-xs" style={{ color: colors.textMuted }}>
                      {t('subscription.fanUpgradeNote')}
                    </Text>
                  )}
                  {activeSub.source === 'this_store' && (
                    <TouchableOpacity onPress={handleManage} className="self-start py-1">
                      <Text className="text-sm font-medium" style={{ color: colors.accent }}>{t('subscription.manage')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {(FAN_TIER_ENABLED || activeSub?.tier === 'fan') && (
                <TierCard
                  title={t('subscription.fan')}
                  icon={<Sparkles size={20} color={colors.primary} />}
                  perks={FAN_PERKS}
                  packages={fanPackages}
                  accent={colors.primary}
                  status={statusOf('fan')}
                  purchasingId={purchasingId}
                  onPurchase={handlePurchase}
                />
              )}
              <TierCard
                title={t('subscription.artist')}
                icon={<Star size={20} color={colors.accent} />}
                perks={ARTIST_PERKS}
                packages={artistPackages}
                accent={colors.accent}
                status={statusOf('artist')}
                purchasingId={purchasingId}
                onPurchase={handlePurchase}
              />

              <TouchableOpacity onPress={handleRestore} disabled={isRestoring} className="items-center py-3">
                {isRestoring ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : (
                  <Text className="text-sm" style={{ color: colors.textMuted }}>{t('subscription.restore')}</Text>
                )}
              </TouchableOpacity>

              {/* Required on subscription paywalls (App Store guideline 3.1.2). */}
              <View className="gap-2 pb-4">
                <Text className="text-xs text-center" style={{ color: colors.textMuted }}>
                  {t('subscription.autoRenew', { store: Platform.OS === 'ios' ? 'App Store' : 'Google Play' })}
                </Text>
                <View className="flex-row justify-center gap-4">
                  <TouchableOpacity onPress={() => Linking.openURL('https://info.re-mixed.net/terms')}>
                    <Text className="text-xs underline" style={{ color: colors.textSecondary }}>{t('subscription.terms')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => Linking.openURL('https://info.re-mixed.net/privacy')}>
                    <Text className="text-xs underline" style={{ color: colors.textSecondary }}>{t('subscription.privacy')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

export default SubscriptionModal;
