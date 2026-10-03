/**
 * Settings sheet. Visual design mirrors the website's settings modal
 * (sypher repo: src/components/layout/SettingsModal.tsx + components/ui/brutal.tsx):
 * neo-brutalist cream panel, 2px black borders, hard offset shadows, bright fills.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  Linking,
  Animated,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trans, useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { localizeAuthError } from '../../utils/authErrors';
import * as ImagePicker from 'expo-image-picker';
import {
  X, User, Mail, Lock, Shield, LogOut, Eye, EyeOff, Check, Globe, Camera,
  Trash2, Star, CreditCard, ExternalLink, Palette, Ban, Circle, Sparkles, FileText, Accessibility,
} from 'lucide-react-native';
import { setReduceMotion, useReduceMotion } from '../../hooks/useReduceMotion';
import { BlockService, type BlockedUser } from '../../services/blockService';
import { BACKGROUND_PRESETS } from '../../config/backgroundPresets';
import { useStore } from '../../store/useStore';
import { AuthService } from '../../services/authService';
import { getAvatarUrl } from '../../utils/avatar';
import { FONTS } from '../../utils/fonts';
import SubscriptionModal from '../subscriptions/SubscriptionModal';
import { openSubscriptionManagement } from '../../services/revenueCatService';
import { B, Raised, BrutalButton, Sticker, BrutalToggle, ChoiceChips } from '../ui/brutal';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SettingsModalProps { isOpen: boolean; }
type TabId = 'account' | 'security' | 'pro' | 'appearance';
type IconType = React.ComponentType<{ size?: number; color?: string }>;

// ─── Settings building blocks ─────────────────────────────────────────────────

const Section: React.FC<{
  icon: IconType;
  title: string;
  description?: string;
  danger?: boolean;
  aside?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ icon: Icon, title, description, danger, aside, children }) => (
  <Raised style={[s.section, danger && { backgroundColor: B.redSoft }]}>
    <View style={s.sectionHead}>
      <View style={[s.sectionIcon, { backgroundColor: danger ? B.red : B.teal }]}>
        <Icon size={18} color={B.black} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.sectionTitle}>{title}</Text>
        {description ? <Text style={s.sectionDesc}>{description}</Text> : null}
      </View>
      {aside}
    </View>
    {children ? <View style={s.sectionBody}>{children}</View> : null}
  </Raised>
);

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={s.fieldLabel}>{children}</Text>
);

const PasswordInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}> = ({ value, onChange, placeholder }) => {
  const [show, setShow] = useState(false);
  return (
    <View style={s.inputRow}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={B.faint}
        secureTextEntry={!show}
        autoCapitalize="none"
        style={s.inputRowField}
      />
      <TouchableOpacity
        onPress={() => setShow(v => !v)}
        hitSlop={8}
        accessibilityLabel={show ? i18n.t('settings.hidePassword') : i18n.t('settings.showPassword')}
      >
        {show ? <EyeOff size={16} color={B.muted} /> : <Eye size={16} color={B.muted} />}
      </TouchableOpacity>
    </View>
  );
};

const Banner: React.FC<{ message: string; type: 'success' | 'error' }> = ({ message, type }) => (
  <Raised offset={3} radius={12} style={[s.banner, { backgroundColor: type === 'success' ? B.green : B.red }]}>
    {type === 'success' ? <Check size={16} color={B.black} /> : <X size={16} color={B.black} />}
    <Text style={s.bannerText} accessibilityRole={type === 'error' ? 'alert' : undefined}>{message}</Text>
  </Raised>
);

const LinkRow: React.FC<{ label: string; url: string }> = ({ label, url }) => (
  <TouchableOpacity onPress={() => Linking.openURL(url)} style={s.linkRow} activeOpacity={0.7} accessibilityRole="link">
    <Text style={s.linkText}>{label}</Text>
    <ExternalLink size={14} color={B.black} />
  </TouchableOpacity>
);

// ─── Blocked accounts ─────────────────────────────────────────────────────────
// Module-level so its loaded list survives the parent's re-renders.
const BlockedAccountsSection: React.FC<{ userId: string }> = ({ userId }) => {
  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    BlockService.getBlockedUsers(userId).then(setBlocked).catch(() => setBlocked([]));
  }, [userId]);

  const unblock = async (target: BlockedUser) => {
    setBusyId(target.id);
    try {
      await BlockService.unblockUser(userId, target.id);
      setBlocked(prev => (prev ?? []).filter(b => b.id !== target.id));
    } catch {
      Alert.alert(i18n.t('common.error'), i18n.t('settings.blocked.unblockFailed', { name: target.username }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Section
      icon={Ban}
      title={i18n.t('settings.blocked.title')}
      description={blocked && blocked.length === 0
        ? i18n.t('settings.blocked.none')
        : i18n.t('settings.blocked.some')}
    >
      {blocked === null ? (
        <ActivityIndicator size="small" color={B.black} style={{ alignSelf: 'flex-start' }} />
      ) : blocked.length > 0 ? (
        <View style={{ gap: 10 }}>
          {blocked.map(b => (
            <View key={b.id} style={s.blockedRow}>
              <Image source={{ uri: getAvatarUrl(b.avatar) }} style={s.blockedAvatar} />
              <Text style={s.blockedName} numberOfLines={1}>{b.artistName || b.username}</Text>
              <BrutalButton
                label={i18n.t('settings.blocked.unblock')}
                size="sm"
                tone="white"
                loading={busyId === b.id}
                loadingLabel="…"
                onPress={() => unblock(b)}
              />
            </View>
          ))}
        </View>
      ) : null}
    </Section>
  );
};

// ─── Main modal ───────────────────────────────────────────────────────────────
const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen }) => {
  const {
    user, setSettingsOpen, setUserAvatar,
    updateProfile, changePassword, togglePrivateAccount,
    logout, userStatus, setUserStatus, refreshUser,
    settingsInitialTab, setSettingsInitialTab,
    backgroundPresetId, setBackgroundPreset,
  } = useStore();
  const { t } = useTranslation();
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<TabId>((settingsInitialTab as TabId) ?? 'account');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // avatar
  const [avatarUri, setAvatarUri] = useState<string | null>(user?.avatar ?? null);
  const [avatarDirty, setAvatarDirty] = useState(false);

  // email change
  const [newEmail, setNewEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');

  // password change
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confPw, setConfPw] = useState('');

  // reset password
  const [resetEmail, setResetEmail] = useState(user?.email ?? '');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetErr, setResetErr] = useState('');

  // privacy / delete
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // subscription tab
  const [subscriptionModalVisible, setSubscriptionModalVisible] = useState(false);
  const [manageErr, setManageErr] = useState('');

  useEffect(() => {
    if (isOpen) setTab((settingsInitialTab as TabId) ?? 'account');
  }, [isOpen, settingsInitialTab]);

  useEffect(() => { if (user?.email) setResetEmail(user.email); }, [user?.email]);
  useEffect(() => { setAvatarUri(user?.avatar ?? null); setAvatarDirty(false); }, [user?.avatar]);

  useEffect(() => {
    if (!isOpen || tab !== 'pro' || !user?.id) return;
    refreshUser();
  }, [isOpen, tab, user?.id]);

  const flash = (msg: string, type: 'success' | 'error') => {
    if (type === 'success') { setSuccess(msg); setError(''); }
    else { setError(msg); setSuccess(''); }
    setTimeout(() => { setSuccess(''); setError(''); }, 3500);
  };

  // ── Sheet animation + swipe-down to dismiss ─────────────────────────────────
  const translateY = useRef(new Animated.Value(800)).current;

  useEffect(() => {
    if (isOpen) {
      translateY.setValue(800);
      Animated.spring(translateY, { toValue: 0, damping: 22, stiffness: 220, useNativeDriver: true }).start();
    }
  }, [isOpen]);

  const animateClose = () => {
    Animated.timing(translateY, { toValue: 800, duration: 280, useNativeDriver: true }).start(() => {
      setSettingsOpen(false);
      setSettingsInitialTab('account');
    });
  };

  // Instant close used only for programmatic cases (e.g. after account deletion)
  const close = () => { setSettingsOpen(false); setSettingsInitialTab('account'); };

  const dismissGesture = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: () => false,
      // Only capture once the user has clearly committed to a downward drag.
      onMoveShouldSetPanResponderCapture: (_, { dy, dx }) => dy > 20 && dy > Math.abs(dx) * 1.5,
      onPanResponderGrant: (_, { dy }) => { translateY.setValue(Math.max(0, dy)); },
      onPanResponderMove: (_, { dy }) => { if (dy > 0) translateY.setValue(dy); },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 100 || vy > 0.8) animateClose();
        else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 10 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  // ── Avatar ───────────────────────────────────────────────────────────────────
  const pickAvatar = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert(t('settings.flash.permissionTitle'), t('settings.flash.photoPermission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled) return;
    setAvatarUri(result.assets[0].uri);
    setAvatarDirty(true);
  };

  const saveAvatar = async () => {
    if (!avatarUri) return;
    setBusy(true);
    try {
      await updateProfile({ avatar: avatarUri });
      setUserAvatar(avatarUri);
      setAvatarDirty(false);
      flash(t('settings.flash.avatarUpdated'), 'success');
    } catch (e) {
      flash(e instanceof Error ? e.message : t('settings.flash.avatarUpdateFailed'), 'error');
    } finally { setBusy(false); }
  };

  const removeAvatar = async () => {
    try {
      await updateProfile({ avatar: null });
      setUserAvatar(null);
      setAvatarUri(null);
      setAvatarDirty(false);
      flash(t('settings.flash.avatarRemoved'), 'success');
    } catch (e) {
      flash(e instanceof Error ? e.message : t('settings.flash.avatarRemoveFailed'), 'error');
    }
  };

  // ── Email change ─────────────────────────────────────────────────────────────
  const submitEmail = async () => {
    if (!newEmail.trim()) return;
    setBusy(true);
    try {
      await updateProfile({ email: newEmail.trim() });
      setNewEmail(''); setEmailPw('');
      flash(t('settings.flash.emailUpdated'), 'success');
    } catch (e) {
      flash(localizeAuthError(e, 'settings.flash.emailUpdateFailed'), 'error');
    } finally { setBusy(false); }
  };

  // ── Password change ──────────────────────────────────────────────────────────
  const submitPassword = async () => {
    if (newPw !== confPw) { flash(t('settings.flash.passwordsMismatch'), 'error'); return; }
    if (!newPw) return;
    setBusy(true);
    try {
      await changePassword(curPw, newPw);
      setCurPw(''); setNewPw(''); setConfPw('');
      flash(t('settings.flash.passwordUpdated'), 'success');
    } catch (e) {
      flash(localizeAuthError(e, 'settings.flash.passwordUpdateFailed'), 'error');
    } finally { setBusy(false); }
  };

  // ── Reset password ───────────────────────────────────────────────────────────
  const sendReset = async () => {
    const email = resetEmail.trim();
    if (!email) { setResetErr(t('settings.flash.enterEmail')); return; }
    setResetBusy(true); setResetErr('');
    try {
      await AuthService.resetPassword(email);
      setResetSent(true);
    } catch (e) {
      setResetErr(localizeAuthError(e, 'settings.flash.resetFailed'));
    } finally { setResetBusy(false); }
  };

  // ── Privacy toggle ───────────────────────────────────────────────────────────
  const togglePrivacy = async () => {
    if (!user) return;
    setPrivacyBusy(true);
    try {
      const updated = await togglePrivateAccount(user.id, !user.isPrivate);
      flash(t(updated.isPrivate ? 'settings.flash.nowPrivate' : 'settings.flash.nowPublic'), 'success');
    } catch (e) {
      flash(e instanceof Error ? e.message : t('settings.flash.privacyFailed'), 'error');
    } finally { setPrivacyBusy(false); }
  };

  // ── Delete account ───────────────────────────────────────────────────────────
  const confirmDelete = () => {
    setDeleteConfirmText('');
    setShowDeleteModal(true);
  };

  const executeDelete = async () => {
    if (!user) return;
    setDeleteBusy(true);
    try {
      await AuthService.deleteAccount(user.id);
      setShowDeleteModal(false);
      flash(t('settings.flash.deleted'), 'success');
      setTimeout(async () => { await logout(); close(); }, 1500);
    } catch (e) {
      flash(e instanceof Error ? e.message : t('settings.flash.deleteFailed'), 'error');
    } finally {
      setDeleteBusy(false);
    }
  };

  // ── Subscription management ─────────────────────────────────────────────────
  // App subscribers manage through the App Store/Play Store; web (Stripe)
  // subscribers are told to manage it on the website.
  const openManageSubscription = async () => {
    setManageErr('');
    try {
      const result = await openSubscriptionManagement();
      if (!result.handled && result.message) Alert.alert(t('subscription.manage'), result.message);
    } catch (e) {
      setManageErr(t('settings.flash.manageFailed'));
    }
  };

  // Tabs are rendered with plain functions (not components defined in render),
  // so typing in a field doesn't remount the tab and drop the keyboard.

  // ── Account tab ──────────────────────────────────────────────────────────────
  const renderAccountTab = () => (
    <>
      <Section icon={User} title={t('settings.account.profile')} description={t('settings.account.profileDesc')}>
        <View style={s.avatarRow}>
          <Image source={{ uri: getAvatarUrl(avatarUri) }} style={s.avatar} resizeMode="cover" />
          <View style={{ flex: 1, gap: 10 }}>
            <BrutalButton
              label={t('settings.account.changePhoto')}
              size="sm"
              tone="white"
              icon={<Camera size={13} color={B.black} />}
              onPress={pickAvatar}
            />
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              {avatarDirty && (
                <BrutalButton label={t('common.save')} size="sm" tone="teal" loading={busy} loadingLabel={t('settings.account.saving')} onPress={saveAvatar} />
              )}
              <TouchableOpacity onPress={removeAvatar} hitSlop={6}>
                <Text style={s.removeText}>{t('settings.account.removePhoto')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <View>
          <FieldLabel>{t('settings.account.username')}</FieldLabel>
          <TextInput value={user?.username ?? ''} editable={false} style={[s.input, s.inputDisabled]} />
          <Text style={s.hint}>{t('settings.account.usernameHint')}</Text>
        </View>
        <View>
          <FieldLabel>{t('settings.account.email')}</FieldLabel>
          <TextInput value={user?.email ?? ''} editable={false} style={[s.input, s.inputDisabled]} />
        </View>
      </Section>

      <Section icon={Circle} title={t('settings.account.status')} description={t('settings.account.statusDesc')}>
        <ChoiceChips
          value={userStatus as 'online' | 'idle' | 'invisible'}
          onChange={setUserStatus}
          options={[
            { value: 'online', label: t('settings.account.online'), dot: '#4ade80' },
            { value: 'idle', label: t('settings.account.idle'), dot: '#fbbf24' },
            { value: 'invisible', label: t('settings.account.offline'), dot: '#9ca3af' },
          ]}
        />
      </Section>

      <Section
        icon={Shield}
        title={t('settings.account.private')}
        description={t('settings.account.privateDesc')}
        aside={
          <BrutalToggle
            value={user?.isPrivate ?? false}
            onChange={togglePrivacy}
            disabled={privacyBusy}
            label={t('settings.account.private')}
          />
        }
      />

      {user?.id && <BlockedAccountsSection userId={user.id} />}

      <Section icon={Globe} title={t('settings.language.title')} description={t('settings.language.subtitle')}>
        <ChoiceChips
          value={(['en', 'ko', 'ja'].includes(i18n.language) ? i18n.language : 'en') as 'en' | 'ko' | 'ja'}
          onChange={(lang) => i18n.changeLanguage(lang)}
          options={(['en', 'ko', 'ja'] as const).map(lang => ({ value: lang, label: t(`settings.language.${lang}`) }))}
        />
      </Section>

      <Section icon={Mail} title={t('settings.account.changeEmail')}>
        <View>
          <FieldLabel>{t('settings.account.newEmail')}</FieldLabel>
          <TextInput
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder="you@example.com"
            placeholderTextColor={B.faint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={s.input}
          />
        </View>
        <View>
          <FieldLabel>{t('settings.account.currentPassword')}</FieldLabel>
          <PasswordInput value={emailPw} onChange={setEmailPw} placeholder={t('settings.account.confirmWithPassword')} />
        </View>
        <BrutalButton label={t('settings.account.updateEmail')} loading={busy} loadingLabel={t('settings.account.updating')} onPress={submitEmail} />
      </Section>

      <Section icon={FileText} title={t('settings.account.legal')}>
        <View style={s.linkList}>
          <LinkRow label={t('settings.account.privacyPolicy')} url="https://info.re-mixed.net/privacy" />
          <View style={s.linkDivider} />
          <LinkRow label={t('settings.account.termsOfService')} url="https://info.re-mixed.net/terms" />
        </View>
      </Section>

      <Section
        icon={Trash2}
        danger
        title={t('settings.account.deleteAccount')}
        description={t('settings.account.deleteDesc')}
      >
        <BrutalButton
          label={t('settings.account.deleteAccount')}
          tone="danger"
          icon={<Trash2 size={14} color={B.black} />}
          loading={deleteBusy}
          loadingLabel={t('settings.account.deleting')}
          onPress={confirmDelete}
        />
      </Section>
    </>
  );

  // ── Security tab ─────────────────────────────────────────────────────────────
  const renderSecurityTab = () => (
    <>
      <Section icon={Lock} title={t('settings.security.changePassword')}>
        <View>
          <FieldLabel>{t('settings.account.currentPassword')}</FieldLabel>
          <PasswordInput value={curPw} onChange={setCurPw} placeholder={t('settings.security.currentPassword')} />
        </View>
        <View>
          <FieldLabel>{t('settings.security.newPassword')}</FieldLabel>
          <PasswordInput value={newPw} onChange={setNewPw} placeholder={t('settings.security.newPassword')} />
        </View>
        <View>
          <FieldLabel>{t('settings.security.confirmNewPassword')}</FieldLabel>
          <PasswordInput value={confPw} onChange={setConfPw} placeholder={t('settings.security.confirmNewPassword')} />
        </View>
        <BrutalButton label={t('settings.security.updatePassword')} loading={busy} loadingLabel={t('settings.account.updating')} onPress={submitPassword} />
      </Section>

      <Section icon={Mail} title={t('settings.security.forgot')} description={t('settings.security.forgotDesc')}>
        {resetSent ? (
          <View style={s.resetSent}>
            <Check size={16} color={B.black} />
            <Text style={s.resetSentText}>{t('settings.security.resetSent')}</Text>
          </View>
        ) : (
          <>
            <View>
              <FieldLabel>{t('settings.security.emailAddress')}</FieldLabel>
              <TextInput
                value={resetEmail}
                onChangeText={setResetEmail}
                placeholder="you@example.com"
                placeholderTextColor={B.faint}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!resetBusy}
                style={s.input}
              />
            </View>
            {resetErr ? <Text style={s.errorText}>{resetErr}</Text> : null}
            <BrutalButton label={t('settings.security.sendReset')} tone="white" loading={resetBusy} loadingLabel={t('settings.security.sending')} onPress={sendReset} />
          </>
        )}
      </Section>

      <Section icon={LogOut} title={t('settings.security.logout')} description={t('settings.security.logoutDesc')}>
        <BrutalButton
          label={t('settings.security.logout')}
          tone="white"
          icon={<LogOut size={14} color={B.black} />}
          onPress={async () => { try { await logout(); } catch {} close(); }}
        />
      </Section>
    </>
  );

  // ── Subscription tab ─────────────────────────────────────────────────────────
  const renderSubscriptionTab = () => {
    const tier = user?.subscriptionTier ?? 'free';
    const isSubscribed = tier !== 'free';
    const planName = t(tier === 'artist' ? 'settings.plan.artist' : tier === 'fan' ? 'settings.plan.fan' : 'settings.plan.free');

    return (
      <>
        <View style={{ paddingTop: 8 }}>
          <Raised offset={5} style={[s.planCard, isSubscribed && { backgroundColor: B.teal }]}>
            {isSubscribed && (
              <View style={s.planSticker}>
                <Sticker label={t('settings.plan.active')} rotate={6} icon={<Sparkles size={11} color={B.black} />} />
              </View>
            )}
            <Text style={s.planKicker}>{t('settings.plan.yourPlan')}</Text>
            <Text style={s.planName}>{planName}</Text>
            {!isSubscribed && <Text style={s.planSub}>{t('settings.plan.freeSub')}</Text>}
          </Raised>
        </View>

        {isSubscribed ? (
          <Section
            icon={CreditCard}
            title={t('settings.plan.billing')}
            description={t('settings.plan.billingDesc', { store: Platform.OS === 'ios' ? 'Apple ID' : 'Google Play' })}
          >
            {manageErr ? <Text style={s.errorText}>{manageErr}</Text> : null}
            <BrutalButton label={t('settings.plan.manage')} tone="white" onPress={openManageSubscription} />
          </Section>
        ) : (
          <Raised style={s.section}>
            <Text style={s.sectionTitle}>{t('settings.plan.unlock')}</Text>
            <Text style={[s.sectionDesc, { marginBottom: 16 }]}>
              {t('settings.plan.unlockDesc')}
            </Text>
            <BrutalButton
              label={t('settings.plan.seePlans')}
              full
              icon={<Sparkles size={16} color={B.white} />}
              onPress={() => setSubscriptionModalVisible(true)}
            />
          </Raised>
        )}
      </>
    );
  };

  // ── Appearance tab ───────────────────────────────────────────────────────────
  const renderAppearanceTab = () => (
    <>
    <Section
      icon={Accessibility}
      title={t('settings.reduceMotion.title')}
      description={t('settings.reduceMotion.description')}
      aside={<BrutalToggle value={reduceMotion} onChange={setReduceMotion} label={t('settings.reduceMotion.title')} />}
    />
    <Section icon={Palette} title={t('settings.appearance.background')} description={t('settings.appearance.backgroundDesc')}>
      <View style={s.presetGrid}>
        {BACKGROUND_PRESETS.map((preset) => {
          const active = backgroundPresetId === preset.id;
          return (
            <Pressable
              key={preset.id}
              onPress={() => setBackgroundPreset(preset.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={t(`settings.appearance.preset.${preset.id}`, { defaultValue: preset.label })}
              style={[s.presetTile, active && s.presetTileActive]}
            >
              <View style={{ flex: 1, backgroundColor: preset.color }}>
                {preset.image ? (
                  <Image source={preset.image} style={StyleSheet.absoluteFill} resizeMode="cover" />
                ) : null}
              </View>
              <View style={[s.presetLabel, active && { backgroundColor: B.teal }]}>
                <Text style={s.presetLabelText} numberOfLines={1}>{t(`settings.appearance.preset.${preset.id}`, { defaultValue: preset.label })}</Text>
                {active && <Check size={11} color={B.black} strokeWidth={3} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </Section>
    </>
  );

  const tabs: { id: TabId; label: string; icon: IconType }[] = [
    { id: 'account', label: t('settings.tabs.account'), icon: User },
    { id: 'security', label: t('settings.tabs.security'), icon: Shield },
    { id: 'pro', label: t('settings.tabs.subscription'), icon: Star },
    { id: 'appearance', label: t('settings.tabs.appearance'), icon: Palette },
  ];

  const renderTabContent = () => {
    switch (tab) {
      case 'account': return renderAccountTab();
      case 'security': return renderSecurityTab();
      case 'pro': return renderSubscriptionTab();
      case 'appearance': return renderAppearanceTab();
    }
  };

  return (
    <Modal visible={isOpen} transparent animationType="none" onRequestClose={animateClose}>
      <View style={s.backdrop}>
        <Animated.View
          {...dismissGesture.panHandlers}
          style={[s.sheet, { paddingBottom: insets.bottom, transform: [{ translateY }] }]}
        >
          {/* Drag handle */}
          <View style={s.handleWrap}>
            <View style={s.handle} />
          </View>

          {/* Header */}
          <View style={s.header}>
            <Image source={{ uri: getAvatarUrl(user?.avatar) }} style={s.headerAvatar} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.headerTitle}>{t('settings.title')}</Text>
              {user?.username ? <Text style={s.headerSub} numberOfLines={1}>@{user.username}</Text> : null}
            </View>
            <Pressable onPress={animateClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('settings.close')}>
              {({ pressed }) => (
                <Raised offset={2} radius={12} pressed={pressed} style={s.closeBtn}>
                  <X size={18} color={B.black} />
                </Raised>
              )}
            </Pressable>
          </View>

          {/* Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.tabBarScroll}
            contentContainerStyle={s.tabBar}
          >
            {tabs.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => setTab(id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={[s.tabItem, active && s.tabItemActive]}
                >
                  <Icon size={16} color={active ? B.white : B.black} />
                  <Text style={[s.tabLabel, active && { color: B.white }]}>{label}</Text>
                  {id === 'pro' && user?.subscriptionTier === 'artist' && (
                    <View style={[s.tabBadge, active ? { borderColor: 'rgba(255,255,255,0.6)' } : { backgroundColor: B.teal }]}>
                      <Text style={[s.tabBadgeText, active && { color: B.white }]}>{t('settings.plan.artistBadge')}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Content */}
          <ScrollView
            key={tab}
            style={{ flex: 1 }}
            contentContainerStyle={s.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {success ? <Banner message={success} type="success" /> : null}
            {error ? <Banner message={error} type="error" /> : null}
            {renderTabContent()}
          </ScrollView>
        </Animated.View>
      </View>

      {/* Delete confirmation and paywall are nested inside the Settings modal: iOS
          won't present a sibling modal while another one is already showing, so as
          siblings they silently never appeared. */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!deleteBusy) setShowDeleteModal(false); }}
        statusBarTranslucent
      >
        <View style={s.dialogBackdrop}>
          <Raised offset={6} radius={20} style={s.dialog}>
            <View style={{ alignItems: 'center', gap: 10 }}>
              <View style={[s.sectionIcon, s.dialogIcon]}>
                <Trash2 size={24} color={B.black} />
              </View>
              <Text style={s.dialogTitle}>{t('settings.delete.title')}</Text>
              <Text style={s.dialogBody}>
                {t('settings.delete.body')}
              </Text>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={s.fieldLabel}>
                <Trans i18nKey="settings.delete.typeToConfirm" components={{ red: <Text style={{ color: B.redText }} /> }} />
              </Text>
              <TextInput
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                placeholder="DELETE"
                placeholderTextColor={B.faint}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!deleteBusy}
                style={[s.input, s.deleteInput, deleteConfirmText === 'DELETE' && { borderColor: B.redText }]}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <BrutalButton
                  label={t('settings.delete.cancel')}
                  tone="white"
                  full
                  disabled={deleteBusy}
                  onPress={() => { setShowDeleteModal(false); setDeleteConfirmText(''); }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <BrutalButton
                  label={t('settings.delete.confirm')}
                  tone="danger"
                  full
                  loading={deleteBusy}
                  loadingLabel={t('settings.account.deleting')}
                  disabled={deleteConfirmText !== 'DELETE'}
                  onPress={executeDelete}
                />
              </View>
            </View>
          </Raised>
        </View>
      </Modal>

      <SubscriptionModal
        visible={subscriptionModalVisible}
        onClose={() => setSubscriptionModalVisible(false)}
      />
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '90%',
    backgroundColor: B.cream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: B.black,
    overflow: 'hidden',
  },
  handleWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 6, backgroundColor: B.white },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: B.black },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 14,
    backgroundColor: B.white,
    borderBottomWidth: 2,
    borderBottomColor: B.black,
  },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 12,
    borderWidth: 2, borderColor: B.black, backgroundColor: B.white,
  },
  headerTitle: { color: B.black, fontSize: 24, fontFamily: FONTS.display, lineHeight: 28 },
  headerSub: { color: B.muted, fontSize: 12, marginTop: 2 },
  closeBtn: {
    padding: 8,
    backgroundColor: B.white,
    borderWidth: 2,
    borderColor: B.black,
  },

  tabBarScroll: {
    flexGrow: 0,
    borderBottomWidth: 2,
    borderBottomColor: B.black,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  tabBar: { flexDirection: 'row', gap: 8, padding: 12 },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tabItemActive: { backgroundColor: B.black, borderColor: B.black },
  tabLabel: { color: B.black, fontSize: 14, fontFamily: FONTS.bold },
  tabBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: B.black,
  },
  tabBadgeText: { color: B.black, fontSize: 9, fontFamily: FONTS.bold },

  content: { padding: 16, paddingBottom: 48, gap: 18 },

  section: {
    backgroundColor: B.white,
    borderWidth: 2,
    borderColor: B.black,
    padding: 18,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sectionIcon: {
    width: 36, height: 36, borderRadius: 9,
    borderWidth: 2, borderColor: B.black,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { color: B.black, fontSize: 16, fontFamily: FONTS.bold, lineHeight: 20 },
  sectionDesc: { color: B.muted, fontSize: 14, lineHeight: 19, marginTop: 2 },
  sectionBody: { marginTop: 16, gap: 14 },

  fieldLabel: {
    color: B.label,
    fontSize: 12,
    fontFamily: FONTS.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  hint: { color: B.muted, fontSize: 12, marginTop: 6 },
  errorText: { color: B.redText, fontSize: 13, fontFamily: FONTS.bold },

  input: {
    backgroundColor: B.white,
    borderWidth: 2,
    borderColor: B.black,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: B.black,
    fontSize: 15,
  },
  inputDisabled: { backgroundColor: 'rgba(0,0,0,0.05)', color: 'rgba(0,0,0,0.5)' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: B.white,
    borderWidth: 2,
    borderColor: B.black,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  inputRowField: { flex: 1, color: B.black, fontSize: 15, paddingVertical: 12 },





  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderWidth: 2,
    borderColor: B.black,
  },
  bannerText: { flex: 1, color: B.black, fontSize: 14, fontFamily: FONTS.bold },

  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: {
    width: 80, height: 80, borderRadius: 16,
    borderWidth: 2, borderColor: B.black, backgroundColor: B.white,
  },
  removeText: { color: B.redText, fontSize: 13, fontFamily: FONTS.bold },

  blockedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  blockedAvatar: { width: 34, height: 34, borderRadius: 10, borderWidth: 2, borderColor: B.black },
  blockedName: { flex: 1, color: B.black, fontSize: 14, fontFamily: FONTS.bold },

  linkList: { borderWidth: 2, borderColor: B.black, borderRadius: 12, overflow: 'hidden' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: B.white,
  },
  linkText: { color: B.black, fontSize: 14, fontFamily: FONTS.bold },
  linkDivider: { height: 2, backgroundColor: B.black },

  resetSent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: B.black,
    backgroundColor: B.green,
  },
  resetSentText: { flex: 1, color: B.black, fontSize: 14, fontFamily: FONTS.semibold },

  planCard: {
    backgroundColor: B.white,
    borderWidth: 2,
    borderColor: B.black,
    padding: 20,
  },
  planSticker: { position: 'absolute', top: -14, right: 18, zIndex: 1 },
  planKicker: { color: B.label, fontSize: 11, fontFamily: FONTS.bold, letterSpacing: 2 },
  planName: { color: B.black, fontSize: 30, fontFamily: FONTS.display, marginTop: 4 },
  planSub: { color: B.muted, fontSize: 14, marginTop: 4 },

  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  presetTile: {
    width: '30%',
    aspectRatio: 0.6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: B.black,
    overflow: 'hidden',
    backgroundColor: B.white,
  },
  presetTileActive: { borderWidth: 3 },
  presetLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: B.white,
    borderTopWidth: 2,
    borderTopColor: B.black,
  },
  presetLabelText: { color: B.black, fontSize: 10, fontFamily: FONTS.bold, flexShrink: 1 },

  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: B.cream,
    borderWidth: 2,
    borderColor: B.black,
    padding: 22,
    gap: 18,
  },
  dialogIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: B.red },
  dialogTitle: { color: B.black, fontSize: 20, fontFamily: FONTS.bold },
  dialogBody: { color: B.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  deleteInput: { fontFamily: FONTS.bold, letterSpacing: 1 },
});

export default SettingsModal;
