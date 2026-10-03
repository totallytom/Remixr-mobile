/**
 * Guest mode. People can browse and listen without an account; anything that
 * needs one goes through requireAuth(), which shows a sheet asking them to
 * sign in or sign up instead of doing the action.
 *
 *   if (!requireAuth('like')) return;
 */
import React, { useSyncExternalStore } from 'react';
import { Modal, Pressable, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { UserPlus, X } from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { openAuthScreen } from '../../navigation/navigationRef';
import { B, BrutalButton, Raised } from '../ui/brutal';
import { FONTS } from '../../utils/fonts';

export type GuestAction =
  | 'like' | 'follow' | 'comment' | 'playlist' | 'upload' | 'chat' | 'challenge'
  | 'report' | 'block' | 'subscribe' | 'profile' | 'generic';

// ── Tiny store for the open prompt ───────────────────────────────────────────
let current: GuestAction | null = null;
const listeners = new Set<() => void>();
const setPrompt = (v: GuestAction | null) => { current = v; listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => current;

/** True when signed in. Otherwise opens the sign-in prompt and returns false. */
export function requireAuth(action: GuestAction = 'generic'): boolean {
  if (useStore.getState().isAuthenticated) return true;
  // Short delay: callers often close a menu (its own Modal) first, and iOS
  // won't present a new modal while another is still dismissing.
  setTimeout(() => setPrompt(action), 300);
  return false;
}

export function useIsGuest(): boolean {
  return !useStore((s: any) => s.isAuthenticated);
}

const go = (screen: 'Login' | 'Signup') => {
  setPrompt(null);
  // Let the sheet start closing before the auth screen slides up.
  setTimeout(() => openAuthScreen(screen), 250);
};

/** Mount once (MainTabs). */
export const GuestPromptHost: React.FC = () => {
  const action = useSyncExternalStore(subscribe, snapshot, snapshot);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!action} transparent animationType="slide" onRequestClose={() => setPrompt(null)}>
      <Pressable style={st.backdrop} onPress={() => setPrompt(null)} accessibilityLabel={t('common.close')} />
      <View style={[st.sheet, { paddingBottom: 24 + insets.bottom }]}>
        <Pressable onPress={() => setPrompt(null)} hitSlop={10} style={st.close} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <X size={18} color={B.black} />
        </Pressable>
        <View style={st.icon}><UserPlus size={22} color={B.black} /></View>
        <Text style={st.title}>{t(`guest.prompt.${action ?? 'generic'}`)}</Text>
        <Text style={st.body}>{t('guest.promptBody')}</Text>
        <View style={{ gap: 12, alignSelf: 'stretch', marginTop: 8 }}>
          <BrutalButton label={t('guest.signUp')} tone="teal" full onPress={() => go('Signup')} />
          <BrutalButton label={t('guest.signIn')} tone="white" full onPress={() => go('Login')} />
        </View>
      </View>
    </Modal>
  );
};

/** Slim strip above the tab bar while browsing as a guest. */
export const GUEST_BANNER_HEIGHT = 48;

export const GuestBanner: React.FC = () => {
  const { t } = useTranslation();
  return (
    <View style={st.banner}>
      <Text style={st.bannerText} numberOfLines={2}>{t('guest.banner')}</Text>
      <Pressable onPress={() => openAuthScreen('Login')} hitSlop={6} accessibilityRole="button">
        <Text style={st.bannerLink}>{t('guest.signIn')}</Text>
      </Pressable>
      <Pressable onPress={() => openAuthScreen('Signup')} accessibilityRole="button">
        {({ pressed }) => (
          <Raised offset={2} radius={8} pressed={pressed} style={st.bannerBtn}>
            <Text style={st.bannerBtnText}>{t('guest.signUp')}</Text>
          </Raised>
        )}
      </Pressable>
    </View>
  );
};

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: B.cream,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: B.black,
    paddingHorizontal: 24,
    paddingTop: 28,
    alignItems: 'center',
    gap: 8,
  },
  close: {
    position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 8,
    borderWidth: 2, borderColor: B.black, backgroundColor: B.white, alignItems: 'center', justifyContent: 'center',
  },
  icon: {
    width: 52, height: 52, borderRadius: 14, borderWidth: 2, borderColor: B.black,
    backgroundColor: B.teal, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  title: { color: B.black, fontSize: 20, fontFamily: FONTS.bold, textAlign: 'center' },
  body: { color: B.muted, fontSize: 14, fontFamily: FONTS.medium, textAlign: 'center', lineHeight: 20 },
  banner: {
    height: GUEST_BANNER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    backgroundColor: B.cream,
    borderTopWidth: 2,
    borderTopColor: B.black,
  },
  bannerText: { flex: 1, color: B.black, fontSize: 12, fontFamily: FONTS.semibold },
  bannerLink: { color: B.black, fontSize: 13, fontFamily: FONTS.bold, textDecorationLine: 'underline' },
  bannerBtn: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 2, borderColor: B.black, backgroundColor: B.teal },
  bannerBtnText: { color: B.black, fontSize: 13, fontFamily: FONTS.bold },
});
