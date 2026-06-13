import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Star, Check, ArrowLeft } from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { proSubscriptionService } from '../../services/proSubscriptionService';
import { PRICING } from '../../config/pricing';
import type { ProfileStackParamList } from '../../navigation/stacks/ProfileStack';

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

const FREE_FEATURES = [
  'Upload & share tracks (up to 10)',
  'Create albums (up to 2)',
  'Follow artists & listeners',
  'Playlists & discovery',
  'Chat with other users',
  'Basic remix tools',
];

const PRO_FEATURES: { label: string; detail: string }[] = [
  {
    label: 'Unlimited uploads',
    detail: 'No cap on tracks or albums — release as much as you want',
  },
  {
    label: 'Priority placement in Discover',
    detail: 'Your tracks are auto-boosted to the front of the swipe stack',
  },
  {
    label: 'Full album management',
    detail: 'Create, edit and manage unlimited albums with full metadata control',
  },
  {
    label: 'Concert listings included',
    detail: 'Post gigs and events at no extra cost',
  },
  {
    label: 'Analytics Dashboard',
    detail: 'Play counts, daily listener trends and per-track performance stats',
  },
  {
    label: 'Enhanced Artist Profile',
    detail: 'Banner image, custom @vanity URL and extended bio',
  },
];

type UpgradeRouteProp = RouteProp<ProfileStackParamList, 'Upgrade'>;

export default function UpgradeScreen() {
  const [plan, setPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState(false);
  const [activationFailed, setActivationFailed] = useState(false);

  const navigation = useNavigation<any>();
  const route = useRoute<UpgradeRouteProp>();
  const { user, refreshUser, setSettingsOpen } = useStore() as any;

  const { success, cancelled, sessionId } = route.params ?? {};

  // Poll / activate after Stripe deep-link redirect
  useEffect(() => {
    if (!success) return;

    setActivating(true);
    let isCancelled = false;

    const poll = async () => {
      for (let i = 0; i < 12; i++) {
        await refreshUser();
        const tier = useStore.getState().user?.subscriptionTier;
        if (isCancelled) return;
        if (tier === 'pro') {
          setActivating(false);
          setActivated(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!isCancelled) {
        setActivating(false);
        setActivationFailed(true);
      }
    };

    const activate = async () => {
      if (sessionId) {
        try {
          await proSubscriptionService.activateFromSession(sessionId);
          await refreshUser();
          if (!isCancelled) {
            setActivating(false);
            setActivated(true);
            return;
          }
        } catch {
          // fall through to polling
        }
      }
      await poll();
    };

    activate();
    return () => { isCancelled = true; };
  }, [success, sessionId, refreshUser]);

  const isPro = user?.subscriptionTier === 'pro';

  const handleUpgrade = async () => {
    setError(null);
    setLoading(true);
    try {
      let customerId = user?.stripeCustomerId;

      const timeout = (ms: number) => new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Please try again.')), ms)
      );

      if (!customerId) {
        const res = await Promise.race([
          fetch(`${API_BASE}/api/create-stripe-customer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user?.id, email: user?.email }),
          }),
          timeout(8000),
        ]);
        const text = await res.text();
        let data: Record<string, string> = {};
        try { data = JSON.parse(text); } catch { throw new Error(`API error (${res.status}): ${text.slice(0, 200)}`); }
        if (!res.ok || !data.stripeCustomerId) throw new Error(data.error || 'Could not create billing account');
        customerId = data.stripeCustomerId;
      }

      await proSubscriptionService.startProCheckout(customerId, plan, user?.id, user?.email);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      {/* Back button */}
      <Pressable style={s.backBtn} onPress={() => navigation.goBack()}>
        <ArrowLeft size={20} color="#fff" strokeWidth={2} />
        <Text style={s.backLabel}>Back</Text>
      </Pressable>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.proBadge}>
            <Star size={14} color="#F59E0B" fill="#F59E0B" />
            <Text style={s.proBadgeText}>Remixr Pro</Text>
          </View>
          <Text style={s.title}>Unlock the full experience</Text>
          <Text style={s.subtitle}>
            Everything you need to grow as an artist — uploads, analytics, discovery and more.
          </Text>
        </View>

        {/* ── Activating ── */}
        {success && activating && (
          <View style={[s.banner, s.bannerAmber]}>
            <View style={s.bannerRow}>
              <ActivityIndicator size="small" color="#F59E0B" style={{ marginRight: 8 }} />
              <Text style={[s.bannerTitle, { color: '#F59E0B' }]}>Activating your Pro account…</Text>
            </View>
            <Text style={s.bannerBody}>This takes just a moment. Please don't close this page.</Text>
          </View>
        )}

        {/* ── Activation failed ── */}
        {success && activationFailed && !isPro && (
          <View style={[s.banner, s.bannerRed]}>
            <Text style={[s.bannerTitle, { color: '#F87171' }]}>We couldn't confirm your subscription yet</Text>
            <Text style={[s.bannerBody, { marginTop: 4, marginBottom: 16 }]}>
              Your payment may still have gone through. Check Settings → Pro tab in a minute — it can take a moment to sync.
              If your plan doesn't update, contact us at{' '}
              <Text style={{ color: 'rgba(255,255,255,0.7)', textDecorationLine: 'underline' }}>
                support@remixr.app
              </Text>
              {' '}with your receipt.
            </Text>
            <Pressable style={s.ghostBtn} onPress={() => setSettingsOpen?.(true)}>
              <Text style={s.ghostBtnText}>Check Settings</Text>
            </Pressable>
          </View>
        )}

        {/* ── Activated ── */}
        {((success && activated) || (success && !activating && isPro)) && (
          <View style={[s.banner, s.bannerAmber]}>
            <Text style={s.successEmoji}>🎉</Text>
            <Text style={[s.bannerTitle, { color: '#F59E0B', fontSize: 18, textAlign: 'center' }]}>
              You're on Remixr Pro!
            </Text>
            <Text style={[s.bannerBody, { textAlign: 'center', marginBottom: 20 }]}>
              Unlimited uploads, priority Discover placement, and more — all unlocked.
            </Text>
            <View style={s.successActions}>
              <Pressable
                style={s.successPrimary}
                onPress={() => navigation.getParent()?.navigate('UploadTab')}
              >
                <Text style={s.successPrimaryText}>Start uploading →</Text>
              </Pressable>
              <Pressable style={s.ghostBtn} onPress={() => navigation.goBack()}>
                <Text style={s.ghostBtnText}>View profile</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Cancelled ── */}
        {cancelled && (
          <View style={[s.banner, s.bannerGhost]}>
            <Text style={s.bannerBody}>Checkout cancelled — no charges made.</Text>
          </View>
        )}

        {/* ── Already Pro (not from checkout) ── */}
        {isPro && !success && (
          <View style={[s.banner, s.bannerAmber]}>
            <Text style={[s.bannerBody, { color: '#F59E0B', fontWeight: '600', textAlign: 'center' }]}>
              You're already on Remixr Pro. Manage your subscription in Settings.
            </Text>
          </View>
        )}

        {/* ── Plan toggle ── */}
        {!isPro && !activating && !activated && (
          <View style={s.toggleRow}>
            <View style={s.toggle}>
              <Pressable
                style={[s.toggleBtn, plan === 'monthly' && s.toggleBtnActive]}
                onPress={() => setPlan('monthly')}
              >
                <Text style={[s.toggleLabel, plan === 'monthly' && s.toggleLabelActive]}>Monthly</Text>
              </Pressable>
              <Pressable
                style={[s.toggleBtn, plan === 'yearly' && s.toggleBtnActive]}
                onPress={() => setPlan('yearly')}
              >
                <Text style={[s.toggleLabel, plan === 'yearly' && s.toggleLabelActive]}>Yearly</Text>
                <View style={s.savingsBadge}>
                  <Text style={s.savingsBadgeText}>2 months free</Text>
                </View>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Pricing cards ── */}
        {!activating && !activated && !activationFailed && (
          <View style={s.cards}>

            {/* Free card */}
            <View style={s.card}>
              <View style={s.cardHeader}>
                <Text style={s.cardTier}>Free</Text>
                <Text style={s.cardPrice}>$0</Text>
                <Text style={s.cardPriceSub}>Forever free</Text>
              </View>
              <View style={s.featureList}>
                {FREE_FEATURES.map((f) => (
                  <View key={f} style={s.featureRow}>
                    <Check size={14} color="rgba(255,255,255,0.3)" strokeWidth={2.5} style={s.checkIcon} />
                    <Text style={s.featureText}>{f}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Pro card */}
            <View style={[s.card, s.cardPro]}>
              <View style={s.cardHeader}>
                <View style={s.proHeaderRow}>
                  <Text style={s.cardTierPro}>Pro</Text>
                  <View style={s.popularBadge}>
                    <Text style={s.popularBadgeText}>Most Popular</Text>
                  </View>
                </View>
                <View style={s.priceRow}>
                  <Text style={s.cardPrice}>
                    {plan === 'yearly' ? PRICING.yearly.display : PRICING.monthly.display}
                  </Text>
                  <Text style={s.cardPriceUnit}>/month</Text>
                </View>
                <Text style={s.cardPriceSub}>
                  {plan === 'yearly' ? `${PRICING.yearly.total} ${PRICING.yearly.totalLabel}` : 'billed monthly'}
                </Text>
              </View>

              <Text style={s.proIncludesLabel}>Includes everything in Free, plus:</Text>

              <View style={s.featureList}>
                {PRO_FEATURES.map((f) => (
                  <View key={f.label} style={[s.featureRow, { alignItems: 'flex-start' }]}>
                    <Check size={14} color="#F59E0B" strokeWidth={2.5} style={[s.checkIcon, { marginTop: 2 }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.featureText, { color: 'rgba(255,255,255,0.9)', fontWeight: '500' }]}>
                        {f.label}
                      </Text>
                      <Text style={s.featureDetail}>{f.detail}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {!isPro && (
                <Pressable
                  style={[s.upgradeBtn, loading && s.upgradeBtnDisabled]}
                  onPress={handleUpgrade}
                  disabled={loading}
                >
                  <Text style={s.upgradeBtnText}>
                    {loading
                      ? 'Redirecting to checkout…'
                      : `Get Pro — ${plan === 'yearly' ? PRICING.yearly.checkoutLabel : PRICING.monthly.checkoutLabel}`}
                  </Text>
                </Pressable>
              )}

              {isPro && (
                <View style={s.currentPlanBadge}>
                  <Text style={s.currentPlanText}>Current plan</Text>
                </View>
              )}
            </View>

          </View>
        )}

        {/* ── Error ── */}
        {error && (
          <Text style={s.errorText}>{error}</Text>
        )}

        {/* ── Footer ── */}
        <Text style={s.footer}>
          Subscriptions auto-renew. Cancel anytime from Settings. Payments processed securely by Stripe.
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const AMBER = '#F59E0B';
const SURFACE = '#111111';
const BORDER = 'rgba(255,255,255,0.10)';

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  backLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 28,
    paddingTop: 8,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 16,
  },
  proBadgeText: {
    color: AMBER,
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Banners
  banner: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  bannerAmber: {
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  bannerRed: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  bannerGhost: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  bannerBody: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  successEmoji: {
    fontSize: 40,
    textAlign: 'center',
    marginBottom: 12,
  },
  successActions: {
    gap: 10,
  },
  successPrimary: {
    backgroundColor: AMBER,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  successPrimaryText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 14,
  },
  ghostBtn: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  ghostBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },

  // Plan toggle
  toggleRow: {
    alignItems: 'center',
    marginBottom: 20,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  toggleBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  toggleLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '500',
  },
  toggleLabelActive: {
    color: '#fff',
  },
  savingsBadge: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  savingsBadgeText: {
    color: AMBER,
    fontSize: 11,
    fontWeight: '600',
  },

  // Cards
  cards: {
    gap: 16,
    marginBottom: 16,
  },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
  },
  cardPro: {
    borderColor: 'rgba(245,158,11,0.4)',
  },
  cardHeader: {
    marginBottom: 16,
  },
  cardTier: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  cardTierPro: {
    color: AMBER,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  proHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  popularBadge: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  popularBadgeText: {
    color: AMBER,
    fontSize: 10,
    fontWeight: '600',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  cardPrice: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 36,
  },
  cardPriceUnit: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    marginBottom: 4,
  },
  cardPriceSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 4,
  },

  // Features
  proIncludesLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  featureList: {
    gap: 10,
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkIcon: {
    flexShrink: 0,
  },
  featureText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    flex: 1,
  },
  featureDetail: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },

  // CTA
  upgradeBtn: {
    backgroundColor: AMBER,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  upgradeBtnDisabled: {
    opacity: 0.6,
  },
  upgradeBtnText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 14,
  },
  currentPlanBadge: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  currentPlanText: {
    color: AMBER,
    fontWeight: '600',
    fontSize: 14,
  },

  // Misc
  errorText: {
    color: '#F87171',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  footer: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
});
