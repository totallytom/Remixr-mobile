import { Linking } from 'react-native';
import { supabase } from './supabase';

// Deep-link scheme configured in app.json (scheme: "sypher")
const APP_SCHEME = 'sypher';
const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export interface ProSubscription {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  plan: 'monthly' | 'yearly';
  status: 'active' | 'cancelled' | 'past_due' | 'expired';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
}

function transform(row: Record<string, unknown>): ProSubscription {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    stripeSubscriptionId: row.stripe_subscription_id as string,
    stripeCustomerId: row.stripe_customer_id as string,
    plan: row.plan as 'monthly' | 'yearly',
    status: row.status as ProSubscription['status'],
    currentPeriodStart: new Date(row.current_period_start as string),
    currentPeriodEnd: new Date(row.current_period_end as string),
    cancelAtPeriodEnd: row.cancel_at_period_end as boolean,
    createdAt: new Date(row.created_at as string),
  };
}

export const proSubscriptionService = {
  async getSubscription(userId: string): Promise<ProSubscription | null> {
    const { data, error } = await supabase
      .from('pro_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'past_due'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return transform(data);
  },

  isProUser(subscriptionTier?: string): boolean {
    return subscriptionTier === 'pro';
  },

  async startProCheckout(stripeCustomerId: string, plan: 'monthly' | 'yearly', userId?: string, email?: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/create-subscription-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: stripeCustomerId,
        plan,
        userId,
        email,
        successUrl: `${APP_SCHEME}://upgrade?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${APP_SCHEME}://upgrade?cancelled=true`,
      }),
    });

    const text = await response.text();
    let data: Record<string, string> = {};
    try { data = JSON.parse(text); } catch { throw new Error(`API error (${response.status}): ${text.slice(0, 200)}`); }

    if (data.url) {
      await Linking.openURL(data.url);
    } else if (data.error === 'already_subscribed') {
      throw new Error('You already have an active Pro subscription. Manage it in Settings.');
    } else {
      throw new Error(data.error || 'Failed to start checkout');
    }
  },

  async openPortal(): Promise<void> {
    let { data: { session } } = await supabase.auth.getSession();
    // On React Native, getSession() can return null before AsyncStorage has
    // fully hydrated — refreshSession() forces a reload from storage.
    if (!session?.access_token) {
      const { data } = await supabase.auth.refreshSession();
      session = data.session;
    }
    const token = session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE}/api/create-portal-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ returnUrl: `${APP_SCHEME}://upgrade` }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to open billing portal');
    await Linking.openURL(data.url);
  },

  async activateFromSession(sessionId: string): Promise<void> {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      const { data } = await supabase.auth.refreshSession();
      session = data.session;
    }
    const token = session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE}/api/activate-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ sessionId }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to activate subscription');
  },

  async cancelAtPeriodEnd(subscriptionId: string): Promise<{ currentPeriodEnd: Date }> {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      const { data } = await supabase.auth.refreshSession();
      session = data.session;
    }
    const token = session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const response = await fetch(`${API_BASE}/api/cancel-pro-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ subscriptionId }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to cancel subscription');

    return { currentPeriodEnd: new Date(data.current_period_end * 1000) };
  },
};
