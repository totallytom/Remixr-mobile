import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const STORAGE_KEYS = {
  USER_STATUS:      'sypher_user_status',
  THEME:            'remix-theme',
  PROFILE_CACHE:    'sypher_cached_profile',
  SUPABASE_SESSION: 'supabase.auth.session',
  deletedChats:     (userId: string) => `deleted_chats_${userId}`,
  onboardingPending:(userId: string) => `sypher_onboarding_pending_${userId}`,
} as const;

const _adapter: StorageAdapter = {
  getItem:    (key) => AsyncStorage.getItem(key),
  setItem:    (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};

export const storage = {
  get(key: string): Promise<string | null> {
    return _adapter.getItem(key);
  },
  set(key: string, value: string): Promise<void> {
    return _adapter.setItem(key, value);
  },
  remove(key: string): Promise<void> {
    return _adapter.removeItem(key);
  },
  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await _adapter.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  },
  setJSON<T>(key: string, value: T): Promise<void> {
    return _adapter.setItem(key, JSON.stringify(value));
  },
};
