import { supabase } from './supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { User } from '../store/useStore';
import { DEFAULT_AVATAR_URL } from '../utils/avatar';
import { storage, STORAGE_KEYS } from '../platform/storage';
import { appError } from '../utils/appError';

/**
 * The signed-in auth user's id + email, kept in sync with the Supabase
 * session. Used by transformUser for the user's own email, because
 * public.users no longer stores emails (privacy).
 */
let signedInAuthUser: { id: string; email: string } | null = null;
const rememberAuthUser = (u?: { id: string; email?: string | null } | null) => {
  signedInAuthUser = u?.id ? { id: u.id, email: u.email ?? '' } : null;
};
supabase.auth.getSession().then(({ data }) => rememberAuthUser(data.session?.user));
supabase.auth.onAuthStateChange((_event, session) => rememberAuthUser(session?.user));
/** The signed-in user's email if `id` is them, otherwise '' (other users' emails are private). */
const ownEmailFor = (id: string): string => {
  const me = signedInAuthUser;
  return me && me.id === id ? me.email : '';
};

export interface AuthError {
  message: string;
  status?: number;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  role: 'musician' | 'consumer';
  artistName?: string;
  bio?: string;
  /** 'YYYY-MM-DD'. Required: the database rejects signups without it (COPPA). */
  dateOfBirth: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export class AuthService {
  private static now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private static async getCachedProfile(userId: string): Promise<User | null> {
    const cached = await storage.getJSON<User>(STORAGE_KEYS.PROFILE_CACHE);
    return cached?.id === userId ? cached : null;
  }

  private static async setCachedProfile(user: User): Promise<void> {
    await storage.setJSON(STORAGE_KEYS.PROFILE_CACHE, user);
  }

  private static async clearCachedProfile(): Promise<void> {
    await storage.remove(STORAGE_KEYS.PROFILE_CACHE);
  }

  private static logDuration(label: string, start: number) {
    const duration = Math.round(this.now() - start);
  }

  private static normalizeUserRole(role: unknown): 'musician' | 'consumer' {
    const r = typeof role === 'string' ? role.toLowerCase().trim() : '';
    return r === 'musician' ? 'musician' : 'consumer';
  }

  /** Wait for `public.users` row after `signUp` — SIGNED_IN can run before upsert finishes. */
  private static async fetchProfileForSessionUser(userId: string): Promise<User | null> {
    const maxAttempts = 12;
    const delayMs = 120;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user || session.user.id !== userId) {
        return null;
      }
      const { data: profileData, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (!error && profileData) {
        rememberAuthUser(session.user);
        return this.transformUser(profileData, session.user.email_confirmed_at);
      }
      if (error) {
        console.warn(`[AUTH] profile fetch attempt ${attempt + 1}:`, error.message);
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
  }

  static async register(data: RegisterData): Promise<User> {
    try {
      const desiredRole = (data.role ?? 'consumer').toLowerCase() as 'musician' | 'consumer';

      // First, create the user in Supabase Auth with email confirmation disabled
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: "https://www.re-mixed.net/onboarding",
          data: {
            username: data.username,
            role: desiredRole,
            artist_name: data.artistName,
            bio: data.bio,
            // Checked and stored privately by the enforce_signup_age trigger.
            date_of_birth: data.dateOfBirth,
          }
        }
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (!authData.user) {
        throw appError('errors.account.createUser');
      }

      // Auto-confirm the user (for development/production convenience)
      // In production, you might want to keep email confirmation but make it seamless
      if (authData.user.email_confirmed_at === null) {
        // Email confirmation is disabled for now
      }

      // Then, create the user profile in our users table
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .upsert({
          id: authData.user.id,
          username: data.username,
          email: data.email,
          role: desiredRole,
          artist_name: data.artistName,
          bio: data.bio,
          avatar: DEFAULT_AVATAR_URL,
          followers: 0,
          following: 0,
        }, { onConflict: 'id' })
        .select()
        .single();

      if (profileError) {
        console.error('[register] users INSERT failed:', profileError.message, profileError.code);
        // Check if it's the row-level security policy error and replace with user-friendly message
        if (profileError.message && profileError.message.includes('new row violates row-level security policy')) {
          throw appError('auth.errors.checkEmailConfirm');
        }
        throw new Error(profileError.message);
      }

      // Safety net: if DB triggers/defaults mutate role unexpectedly, force it back.
      if (profileData?.role && profileData.role !== desiredRole) {
        console.warn('[register] role mismatch after upsert; correcting', { desiredRole, got: profileData.role });
        const { data: corrected, error: correctedErr } = await supabase
          .from('users')
          .update({ role: desiredRole })
          .eq('id', authData.user.id)
          .select()
          .single();
        if (!correctedErr && corrected) {
          rememberAuthUser(authData.user);
          const correctedUser = this.transformUser(corrected, authData.user.email_confirmed_at);
          await this.setCachedProfile(correctedUser);
          return correctedUser;
        }
      }

      rememberAuthUser(authData.user);
      const newUser = this.transformUser(profileData, authData.user.email_confirmed_at);
      // Pre-cache so the onAuthStateChange background fetch (which races the INSERT)
      // finds the profile immediately rather than getting null and clearing auth state.
      await this.setCachedProfile(newUser);
      return newUser;
    } catch (error) {
      // Also check for the RLS error in the general catch block
      if (error instanceof Error && error.message.includes('new row violates row-level security policy')) {
        throw appError('auth.errors.checkEmailConfirm');
      }
      throw new Error(error instanceof Error ? error.message : appError('auth.signup.failed').message);
    }
  }

  static async login(data: LoginData): Promise<User> {
    try {
      const signInStart = this.now();
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      this.logDuration('login signInWithPassword', signInStart);

      if (error) {
        throw new Error(error.message);
      }

      if (!authData.user) {
        throw appError('auth.login.failed');
      }

      // Get user profile
      const profileFetchStart = this.now();
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle();
      this.logDuration('login fetch profile', profileFetchStart);

      if (profileError) {
        throw new Error(profileError.message);
      }

      if (profileData) {
        rememberAuthUser(authData.user);
        return this.transformUser(profileData, authData.user.email_confirmed_at);
      }

      // If profile not found, create one
      const username = authData.user.email?.split('@')[0] || 'new_user';
      const metaRoleRaw =
        (authData.user.user_metadata as { role?: unknown } | undefined)?.role ??
        (authData.user.app_metadata as { role?: unknown } | undefined)?.role;
      const desiredRole: 'musician' | 'consumer' =
        metaRoleRaw === 'musician' || metaRoleRaw === 'consumer'
          ? metaRoleRaw
          : 'consumer';

      const profileCreateStart = this.now();
      const { data: newProfileData, error: newProfileError } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          username: username,
          email: authData.user.email ?? 'unknown@example.com',
          role: desiredRole,
          avatar: DEFAULT_AVATAR_URL,
          followers: 0,
          following: 0,
        })
        .select()
        .single();
      this.logDuration('login create profile', profileCreateStart);

      if (newProfileError) {
        throw new Error(newProfileError.message);
      }
      
      if (!newProfileData) {
        throw appError('errors.account.profileMissing');
      }

      rememberAuthUser(authData.user);
      return this.transformUser(newProfileData, authData.user.email_confirmed_at);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : appError('auth.login.failed').message);
    }
  }

  /**
   * Sign out locally and (when a session exists) revoke the refresh token on the server.
   * The UI can still show a cached profile while Supabase has no session (see INITIAL_SESSION
   * handler); in that case a global signOut returns 403 / "Auth session missing!" — we always
   * fall back to a local sign-out so the user can actually log out.
   */
  static async logout(): Promise<void> {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        const { error } = await supabase.auth.signOut();
        if (error) {
          const msg = error.message ?? '';
          const benign =
            /session missing|not authenticated|session_not_found/i.test(msg) ||
            (error as { status?: number }).status === 403;
          if (!benign) {
            console.warn('[auth] signOut:', msg);
          }
        }
      }
    } catch (e) {
      console.warn('[auth] logout:', e);
    } finally {
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        /* ignore */
      }
      await this.clearCachedProfile();
    }
  }

  static async getCurrentUser(): Promise<User | null> {
    try {
      // Use getSession instead of getUser - it's faster and includes the same data
      const sessionStart = this.now();
      const { data: { session }, error } = await supabase.auth.getSession();
      this.logDuration('getCurrentUser getSession', sessionStart);
      
      if (error || !session?.user) {
        return null;
      }

      const profileFetchStart = this.now();
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      this.logDuration('getCurrentUser fetch profile', profileFetchStart);

      if (profileError || !profileData) {
        console.error('Error getting user profile:', profileError);
        return null;
      }

      rememberAuthUser(session.user);
      const user = this.transformUser(profileData, session.user.email_confirmed_at);
      await this.setCachedProfile(user);
      return user;
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  }

  static async getSession(): Promise<any> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error('Error getting session:', error);
        return null;
      }
      return session;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  static async refreshSession(): Promise<void> {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('Error refreshing session:', error);
      }
    } catch (error) {
      console.error('Error refreshing session:', error);
    }
  }

  static async updateProfile(userId: string, updates: Partial<User>): Promise<User> {
    try {
      const updateData: any = {};
      
      if (updates.username) updateData.username = updates.username;
      if (updates.avatar) updateData.avatar = updates.avatar;
      if (updates.bio) updateData.bio = updates.bio;
      if (updates.artistName) updateData.artist_name = updates.artistName;
      if (updates.genres) updateData.genres = updates.genres;
      if (updates.role) updateData.role = updates.role;
      if (updates.externalLinks !== undefined) updateData.external_links = updates.externalLinks;
      if (updates.bannerUrl !== undefined) updateData.banner_url = updates.bannerUrl;
      if (updates.vanityUrl !== undefined) updateData.vanity_url = updates.vanityUrl || null;

      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return this.transformUser(data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : appError('errors.account.profileUpdate').message);
    }
  }

  static async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw appError('errors.account.notSignedIn');

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyError) throw appError('errors.account.wrongPassword');

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : appError('errors.account.passwordChange').message);
    }
  }

  static async changeEmail(newEmail: string): Promise<void> {
    try {
      const { error } = await supabase.auth.updateUser({
        email: newEmail
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : appError('errors.account.emailChange').message);
    }
  }

  static async changeUsername(userId: string, newUsername: string): Promise<User> {
    try {
      // Check if username is already taken
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('username', newUsername)
        .neq('id', userId)
        .maybeSingle();

      if (checkError) {
        throw new Error(checkError.message);
      }

      if (existingUser) {
        throw appError('errors.account.usernameTaken');
      }

      // Update username
      const { data, error } = await supabase
        .from('users')
        .update({ username: newUsername })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return this.transformUser(data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : appError('errors.account.usernameChange').message);
    }
  }

  static async togglePrivateAccount(userId: string, isPrivate: boolean): Promise<User> {
    try {
      const { data, error } = await supabase
        .from('users')
        .update({ is_private: isPrivate })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return this.transformUser(data);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : appError('errors.account.privacy').message);
    }
  }

  /** Send password reset email. Link in email redirects to app /reset-password with recovery token in hash. */
  static async resetPassword(email: string): Promise<void> {
    try {
      // The website's reset page: works wherever the email is opened (phone or
      // computer). `window.location` doesn't exist in React Native, so the old
      // origin-based link threw before any email was sent.
      const redirectTo = 'https://www.re-mixed.net/reset-password';
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : appError('auth.login.resetFailed').message);
    }
  }

  /** Set new password when user has followed the reset-password email link (recovery session). */
  static async setNewPassword(newPassword: string): Promise<void> {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : appError('auth.reset.failed').message);
    }
  }

  static async searchUsersByUsername(username: string): Promise<User[]> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .ilike('username', `%${username}%`);
      if (error) throw new Error(error.message);
      return (data || []).map((u) => this.transformUser(u));
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : appError('errors.account.userSearch').message);
    }
  }

  // All deletion happens server-side in the delete-account Edge Function (service
  // role): deleting table by table from the client was silently skipped by RLS.
  static async deleteAccount(userId: string): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.user.id !== userId) {
      throw appError('errors.account.sessionExpired');
    }

    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (error) {
      let message = error.message;
      if (error instanceof FunctionsHttpError) {
        const payload = await error.context.json().catch(() => null);
        if (payload?.error) message = payload.error;
      }
      throw new Error(message || 'Account deletion failed. Please try again.');
    }

    await supabase.auth.signOut({ scope: 'local' });
  }

  static onAuthStateChange(callback: (user: User | null) => void) {
    return supabase.auth.onAuthStateChange(async (event, session) => {
      const shouldFetchProfile =
        (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') &&
        session?.user;

      if (shouldFetchProfile) {
        // 1. Show cached profile instantly so the UI is never blocked
        const cached = await this.getCachedProfile(session.user.id);
        if (cached) callback(cached);

        // 2. Use setTimeout(0) to break the "Supabase Deadlock"
        // This lets the Auth listener finish its execution before starting the DB fetch
        setTimeout(async () => {
          const profileFetchStart = this.now();
          try {
            const freshUser = await this.fetchProfileForSessionUser(session.user.id);
            this.logDuration(`auth ${event} background fetch`, profileFetchStart);

            if (!freshUser) {
              console.warn('[AUTH] No profile after retries for:', session.user.id);
              if (!cached) callback(null);
              return;
            }

            await this.setCachedProfile(freshUser);

            if (!cached || JSON.stringify(freshUser) !== JSON.stringify(cached)) {
              callback(freshUser);
            }
          } catch (error) {
            console.error('Background profile fetch threw error:', error);
            if (!cached) callback(null);
          }
        }, 0);

        return;
      }

      if (event === 'SIGNED_OUT') {
        await this.clearCachedProfile();
        callback(null);
        return;
      }

      if (event === 'INITIAL_SESSION' && !session) {
        // Don't nuke the cache here — Supabase may fire INITIAL_SESSION before it has
        // finished hydrating the session from storage (cold-boot race condition).
        // Only clear on an explicit SIGNED_OUT above.
        const cached = await storage.getJSON<User>(STORAGE_KEYS.PROFILE_CACHE);
        if (cached?.id) {
          callback(cached);
          return;
        }
        callback(null);
        return;
      }

      if (event === 'TOKEN_REFRESH_FAILED') {
        this.clearCachedProfile();
        await supabase.auth.signOut({ scope: 'local' });
        callback(null);
      }
    });
  }

  static transformUser(dbUser: any, emailConfirmedAt?: string | null): User {
    return {
      id: dbUser.id,
      username: dbUser.username,
      // public.users no longer stores emails; the signed-in user's own email
      // comes from their auth session. Other users' emails stay private.
      email: dbUser.email ?? ownEmailFor(dbUser.id),
      avatar: dbUser.avatar,
      followers: dbUser.followers,
      following: dbUser.following,
      role: this.normalizeUserRole(dbUser.role),
      isVerified: dbUser.is_verified,
      isPrivate: dbUser.is_private,
      isAdmin: dbUser.is_admin ?? false,
      isVerifiedArtist: dbUser.is_verified_artist ?? false,
      artistName: dbUser.artist_name,
      bio: dbUser.bio,
      genres: dbUser.genres,
      externalLinks: dbUser.external_links ?? [],
      subscriptionTier: dbUser.subscription_tier ?? 'free',
      stripeCustomerId: dbUser.stripe_customer_id ?? undefined,
      bannerUrl: dbUser.banner_url ?? undefined,
      vanityUrl: dbUser.vanity_url ?? undefined,
      emailConfirmed: !!emailConfirmedAt,
    };
  }

  static async resendEmailConfirmation(email: string): Promise<void> {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw new Error(error.message);
  }
} 