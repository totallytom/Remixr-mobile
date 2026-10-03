import { Linking, Platform } from 'react-native';
import Purchases, { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { supabase } from './supabase';
import { FAN_TIER_ENABLED } from '../config/features';
import i18n from '../i18n';
import { appError } from '../utils/appError';

// RevenueCat handles receipt validation, renewal tracking, and restore-purchases —
// deliberately not hand-rolled (see the pivot plan's reasoning for this choice).
// In the app, subscriptions are sold only through Apple/Google IAP. Web
// subscriptions are sold with Stripe on the website and reach the app through
// RevenueCat's Stripe integration. Stripe inside the app is for concert tickets only.
//
// Contract this file assumes about the RevenueCat dashboard config (set these up
// there to match, or these entitlement checks silently resolve to 'free'):
//   - An Entitlement identified exactly "fan"
//   - An Entitlement identified exactly "artist"
//   - Offerings/packages attached to whichever entitlement they should unlock

export type SubscriptionTier = 'free' | 'fan' | 'artist';

// Public SDK keys (safe to embed in the client — these are not secret, unlike a
// server API key). Set them per build profile in eas.json's `env`.
const API_KEY = Platform.OS === 'ios'
  ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
  : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

/** False until the RevenueCat key for this platform is set; the SDK is never started without it. */
export const isRevenueCatAvailable = !!API_KEY;

let configured = false;

export function configureRevenueCat(): void {
  if (configured || !API_KEY) return;
  Purchases.configure({ apiKey: API_KEY });
  configured = true;
}

function requireRevenueCat(): void {
  if (!configured) throw appError('errors.subscriptions.unavailable');
}

// Links RevenueCat's (initially anonymous) purchaser identity to the app's own
// user id, so entitlements follow the account across devices/reinstalls.
export async function identifyUser(userId: string): Promise<CustomerInfo> {
  requireRevenueCat();
  const { customerInfo } = await Purchases.logIn(userId);
  return customerInfo;
}

export async function logOutRevenueCat(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch {
    // logOut throws if already logged out (anonymous) — not an error worth surfacing
  }
}

export async function getOfferings(): Promise<PurchasesOffering | null> {
  requireRevenueCat();
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  requireRevenueCat();
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  requireRevenueCat();
  return Purchases.restorePurchases();
}

export async function getCustomerInfo(): Promise<CustomerInfo> {
  requireRevenueCat();
  return Purchases.getCustomerInfo();
}

// Artist entitlement includes every Fan perk (locked decision — one ranked tier,
// not two independent purchases), so a customer with the "artist" entitlement is
// resolved as 'artist' even if they never separately bought "fan".
export function resolveTier(customerInfo: CustomerInfo): SubscriptionTier {
  const active = customerInfo.entitlements.active;
  if (active['artist']) return 'artist';
  if (active['fan']) return 'fan';
  return 'free';
}

// ─── Where the active subscription was bought ─────────────────────────────────
// Web (Stripe) subscriptions reach the app through RevenueCat's Stripe
// integration, keyed by the same app user id (the Supabase user id). Knowing the
// source prevents double billing: someone paying on the web must never be sold the
// same thing again through Apple/Google, and has to manage it where they bought it.

export type SubscriptionSource = 'this_store' | 'web' | 'other_store' | 'promotional';

export interface ActiveSubscription {
  tier: 'fan' | 'artist';
  source: SubscriptionSource;
  /** Store-provided management page; only set for this platform's store. */
  managementURL: string | null;
}

export const WEBSITE_NAME = 're-mixed.net';

const THIS_STORE = Platform.OS === 'ios' ? 'APP_STORE' : 'PLAY_STORE';

function sourceOf(store: string): SubscriptionSource {
  if (store === THIS_STORE) return 'this_store';
  if (store === 'STRIPE' || store === 'RC_BILLING' || store === 'PADDLE') return 'web';
  if (store === 'PROMOTIONAL') return 'promotional';
  return 'other_store';
}

export function getActiveSubscription(customerInfo: CustomerInfo): ActiveSubscription | null {
  const active = customerInfo.entitlements.active;
  const ent = active['artist'] ?? active['fan'];
  if (!ent) return null;
  const source = sourceOf(ent.store);
  return {
    tier: active['artist'] ? 'artist' : 'fan',
    source,
    managementURL: source === 'this_store' ? customerInfo.managementURL : null,
  };
}

/**
 * What the paywall may sell. Upgrading Fan → Artist is only allowed within this
 * platform's store, where both products share one subscription group so the store
 * swaps the plan instead of adding a second subscription.
 */
export function purchasableTiers(sub: ActiveSubscription | null): ('fan' | 'artist')[] {
  if (!sub) return FAN_TIER_ENABLED ? ['fan', 'artist'] : ['artist'];
  if (sub.source === 'this_store' && sub.tier === 'fan') return ['artist'];
  return [];
}

export function subscriptionSourceMessage(sub: ActiveSubscription): string {
  const plan = i18n.t(sub.tier === 'artist' ? 'subscription.artist' : 'subscription.fan');
  switch (sub.source) {
    case 'web':
      // Plain text, no link: outside the US, linking to web payment pages from the
      // app is restricted by App Store rules.
      return i18n.t('subscription.source.web', { plan, website: WEBSITE_NAME });
    case 'other_store':
      return i18n.t('subscription.source.otherStore', { plan });
    case 'promotional':
      return i18n.t('subscription.source.promotional', { plan });
    default:
      return i18n.t('subscription.source.default', { plan });
  }
}

/** Opens the right management screen, or explains where to go for web/other-store subs. */
export async function openSubscriptionManagement(): Promise<{ handled: boolean; message?: string }> {
  // If RevenueCat can't answer (not set up, offline), fall back to the store's own
  // subscriptions page rather than showing an error.
  const info = await getCustomerInfo().catch(() => null);
  const sub = info ? getActiveSubscription(info) : null;
  if (sub && sub.source !== 'this_store') {
    return { handled: false, message: subscriptionSourceMessage(sub) };
  }
  const url = sub?.managementURL ?? (Platform.OS === 'ios'
    ? 'itms-apps://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions');
  await Linking.openURL(url);
  return { handled: true };
}

export function isArtistTier(tier?: SubscriptionTier | string | null): boolean {
  return tier === 'artist';
}

export function isFanOrHigher(tier?: SubscriptionTier | string | null): boolean {
  return tier === 'fan' || tier === 'artist';
}

