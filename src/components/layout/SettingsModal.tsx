import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Switch,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  Linking,
  Share,
  Animated,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import * as ImagePicker from 'expo-image-picker';
import {
  X, User, Mail, Lock, Shield, LogOut,
  Eye, EyeOff, Save, Check, Globe, Camera,
  ChevronRight, Trash2, Star, CreditCard, ExternalLink, Share2, Palette,
} from 'lucide-react-native';
import { BACKGROUND_PRESETS, getPreset } from '../../config/backgroundPresets';
import { useStore } from '../../store/useStore';
import { AuthService } from '../../services/authService';
import { proSubscriptionService, type ProSubscription } from '../../services/proSubscriptionService';
import { PRICING } from '../../config/pricing';
import { getAvatarUrl } from '../../utils/avatar';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SettingsModalProps { isOpen: boolean; }
type TabId = 'account' | 'security' | 'pro' | 'appearance';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:      '#0e0e0e',
  surface: '#1a1a1a',
  border:  '#2a2a2a',
  green:   '#8aec9f',
  red:     '#ef4444',
  yellow:  '#eab308',
  muted:   'rgba(255,255,255,0.35)',
  dim:     'rgba(255,255,255,0.08)',
};

// ─── Primitives ───────────────────────────────────────────────────────────────
const Divider = () => <View style={s.divider} />;
const FieldLabel: React.FC<{ t: string }> = ({ t: label }) => (
  <Text style={s.fieldLabel}>{label}</Text>
);
const Hint: React.FC<{ t: string }> = ({ t: text }) => (
  <Text style={s.hint}>{text}</Text>
);
const Card: React.FC<{ children: React.ReactNode; danger?: boolean }> = ({ children, danger }) => (
  <View style={[s.card, danger && s.cardDanger]}>{children}</View>
);
const CardHeader: React.FC<{ icon: React.ReactNode; title: string; color?: string }> = ({
  icon, title, color,
}) => (
  <View style={s.cardHeader}>
    <View style={s.cardHeaderIcon}>{icon}</View>
    <Text style={[s.cardHeaderTitle, color ? { color } : null]}>{title}</Text>
  </View>
);

// ─── Password field ───────────────────────────────────────────────────────────
const PasswordInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  editable?: boolean;
}> = ({ value, onChange, placeholder, editable = true }) => {
  const [show, setShow] = useState(false);
  return (
    <View style={s.inputRow}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        secureTextEntry={!show}
        editable={editable}
        style={{ flex: 1, color: '#fff', fontSize: 14, paddingVertical: 11 }}
      />
      <TouchableOpacity onPress={() => setShow(v => !v)} hitSlop={8}>
        {show ? <EyeOff size={16} color={C.muted} /> : <Eye size={16} color={C.muted} />}
      </TouchableOpacity>
    </View>
  );
};

// ─── Primary button ───────────────────────────────────────────────────────────
const Btn: React.FC<{
  label: string;
  onPress: () => void;
  loading?: boolean;
  loadingLabel?: string;
  variant?: 'green' | 'red' | 'outline' | 'yellow';
  icon?: React.ReactNode;
  full?: boolean;
}> = ({ label, onPress, loading, loadingLabel, variant = 'green', icon, full }) => {
  const bg =
    variant === 'red'     ? C.red :
    variant === 'outline' ? 'transparent' :
    variant === 'yellow'  ? C.yellow :
    C.green;
  const textColor =
    variant === 'outline' ? C.green :
    variant === 'green'   ? '#000' : '#fff';
  const border = variant === 'outline' ? { borderWidth: 1, borderColor: C.green } : {};

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.75}
      style={[
        s.btn,
        { backgroundColor: bg },
        border,
        full && { alignSelf: 'stretch', justifyContent: 'center' },
        loading && { opacity: 0.55 },
      ]}
    >
      {loading
        ? <ActivityIndicator size="small" color={textColor} />
        : icon}
      <Text style={[s.btnText, { color: textColor }]}>
        {loading ? (loadingLabel ?? 'Loading…') : label}
      </Text>
    </TouchableOpacity>
  );
};

// ─── Feedback banner ──────────────────────────────────────────────────────────
const FeedbackBanner: React.FC<{ message: string; type: 'success' | 'error' }> = ({
  message, type,
}) => (
  <View style={[
    s.banner,
    { backgroundColor: type === 'success' ? 'rgba(138,236,159,0.12)' : 'rgba(239,68,68,0.12)',
      borderColor: type === 'success' ? 'rgba(138,236,159,0.3)' : 'rgba(239,68,68,0.3)' },
  ]}>
    {type === 'success'
      ? <Check size={14} color={C.green} />
      : <X size={14} color={C.red} />}
    <Text style={[s.bannerText, { color: type === 'success' ? C.green : C.red }]}>
      {message}
    </Text>
  </View>
);

// ─── Toggle row ───────────────────────────────────────────────────────────────
const ToggleRow: React.FC<{
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, sub, value, onChange }) => (
  <View style={s.toggleRow}>
    <View style={{ flex: 1, marginRight: 12 }}>
      <Text style={s.toggleLabel}>{label}</Text>
      <Text style={s.toggleSub}>{sub}</Text>
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: C.border, true: C.green }}
      thumbColor="#fff"
    />
  </View>
);

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
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [tab, setTab] = useState<TabId>((settingsInitialTab as TabId) ?? 'account');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError]   = useState('');

  // avatar
  const [avatarUri, setAvatarUri]   = useState<string | null>(user?.avatar ?? null);
  const [avatarDirty, setAvatarDirty] = useState(false);

  // email change
  const [newEmail, setNewEmail]       = useState('');
  const [emailPw, setEmailPw]         = useState('');

  // password change
  const [curPw, setCurPw]   = useState('');
  const [newPw, setNewPw]   = useState('');
  const [confPw, setConfPw] = useState('');

  // reset password
  const [resetEmail, setResetEmail]     = useState(user?.email ?? '');
  const [resetBusy, setResetBusy]       = useState(false);
  const [resetSent, setResetSent]       = useState(false);
  const [resetErr, setResetErr]         = useState('');

  // privacy / delete
  const [privacyBusy, setPrivacyBusy]       = useState(false);
  const [deleteBusy, setDeleteBusy]         = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // pro tab
  const [proSub, setProSub]       = useState<ProSubscription | null>(null);
  const [proLoading, setProLoading] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalErr, setPortalErr]   = useState('');


  useEffect(() => {
    if (isOpen) setTab((settingsInitialTab as TabId) ?? 'account');
  }, [isOpen, settingsInitialTab]);

  useEffect(() => { if (user?.email) setResetEmail(user.email); }, [user?.email]);
  useEffect(() => { setAvatarUri(user?.avatar ?? null); setAvatarDirty(false); }, [user?.avatar]);

  useEffect(() => {
    if (!isOpen || tab !== 'pro' || !user?.id) return;
    setProLoading(true);
    refreshUser()
      .then(() => proSubscriptionService.getSubscription(user.id))
      .then(setProSub)
      .finally(() => setProLoading(false));
  }, [isOpen, tab, user?.id]);

  const flash = (msg: string, type: 'success' | 'error') => {
    if (type === 'success') { setSuccess(msg); setError(''); }
    else { setError(msg); setSuccess(''); }
    setTimeout(() => { setSuccess(''); setError(''); }, 3500);
  };

  const translateY = useRef(new Animated.Value(800)).current;

  // Slide in from bottom each time the modal opens
  useEffect(() => {
    if (isOpen) {
      translateY.setValue(800);
      Animated.spring(translateY, {
        toValue: 0,
        damping: 22,
        stiffness: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [isOpen]);

  const animateClose = () => {
    Animated.timing(translateY, {
      toValue: 800,
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
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
      // Never try non-capture claiming — that lets ScrollViews fight back every frame
      onMoveShouldSetPanResponder: () => false,
      // Only capture once the user has clearly committed to a downward drag.
      // After capture the gesture is ours exclusively — no more stutter.
      onMoveShouldSetPanResponderCapture: (_, { dy, dx }) =>
        dy > 20 && dy > Math.abs(dx) * 1.5,
      onPanResponderGrant: (_, { dy }) => {
        // Jump to the real dy so the sheet starts from where the finger already is
        translateY.setValue(Math.max(0, dy));
      },
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) translateY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 100 || vy > 0.8) {
          animateClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 10,
          }).start();
        }
      },
      // If something else steals the gesture, snap back cleanly
      onPanResponderTerminate: () => {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  // ── Avatar ───────────────────────────────────────────────────────────────────
  const pickAvatar = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission required', 'Please allow photo library access.');
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
      flash('Avatar updated!', 'success');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed to update avatar', 'error');
    } finally { setBusy(false); }
  };

  const removeAvatar = async () => {
    try {
      await updateProfile({ avatar: null });
      setUserAvatar(null);
      setAvatarUri(null);
      setAvatarDirty(false);
      flash('Avatar removed', 'success');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed to remove avatar', 'error');
    }
  };

  // ── Email change ─────────────────────────────────────────────────────────────
  const submitEmail = async () => {
    if (!newEmail.trim()) return;
    setBusy(true);
    try {
      await updateProfile({ email: newEmail.trim() });
      setNewEmail(''); setEmailPw('');
      flash('Email updated! Check your inbox to confirm.', 'success');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed to update email', 'error');
    } finally { setBusy(false); }
  };

  // ── Password change ──────────────────────────────────────────────────────────
  const submitPassword = async () => {
    if (newPw !== confPw) { flash('New passwords do not match', 'error'); return; }
    if (!newPw) return;
    setBusy(true);
    try {
      await changePassword(curPw, newPw);
      setCurPw(''); setNewPw(''); setConfPw('');
      flash('Password updated!', 'success');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed to update password', 'error');
    } finally { setBusy(false); }
  };

  // ── Reset password ───────────────────────────────────────────────────────────
  const sendReset = async () => {
    const email = resetEmail.trim();
    if (!email) { setResetErr('Enter your email'); return; }
    setResetBusy(true); setResetErr('');
    try {
      await AuthService.resetPassword(email);
      setResetSent(true);
    } catch (e) {
      setResetErr(e instanceof Error ? e.message : 'Failed to send reset email');
    } finally { setResetBusy(false); }
  };

  // ── Privacy toggle ───────────────────────────────────────────────────────────
  const togglePrivacy = async () => {
    if (!user) return;
    setPrivacyBusy(true);
    try {
      const updated = await togglePrivateAccount(user.id, !user.isPrivate);
      flash(`Account is now ${updated.isPrivate ? 'private' : 'public'}`, 'success');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed to update privacy', 'error');
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
      flash('Account deleted. Logging out…', 'success');
      setTimeout(async () => { await logout(); close(); }, 1500);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed to delete account', 'error');
    } finally {
      setDeleteBusy(false);
    }
  };

  // ── Billing portal ───────────────────────────────────────────────────────────
  const openPortal = async () => {
    setPortalBusy(true); setPortalErr('');
    try {
      await proSubscriptionService.openPortal();
    } catch (e) {
      setPortalErr(e instanceof Error ? e.message : 'Could not open billing portal');
    } finally { setPortalBusy(false); }
  };

  // ── Account tab ──────────────────────────────────────────────────────────────
  const AccountTab = () => (
    <View style={{ gap: 12 }}>
      {/* Avatar */}
      <Card>
        <CardHeader icon={<Camera size={15} color={C.green} />} title="Profile Picture" />
        <Divider />
        <View style={s.avatarRow}>
          <Image
            source={{ uri: getAvatarUrl(avatarUri) }}
            style={s.avatar}
            resizeMode="cover"
          />
          <View style={{ flex: 1, gap: 8 }}>
            <Btn label="Change photo" onPress={pickAvatar} variant="outline" icon={<Camera size={14} color={C.green} />} />
            <TouchableOpacity onPress={removeAvatar}>
              <Text style={{ color: C.red, fontSize: 13 }}>Remove photo</Text>
            </TouchableOpacity>
          </View>
          {avatarDirty && (
            <Btn label="Save" onPress={saveAvatar} loading={busy} icon={<Save size={13} color="#000" />} />
          )}
        </View>
      </Card>

      {/* Profile info */}
      <Card>
        <CardHeader icon={<User size={15} color={C.green} />} title="Profile Information" />
        <Divider />
        <View style={{ gap: 10 }}>
          <View>
            <FieldLabel t="Username" />
            <TextInput
              value={user?.username ?? ''}
              editable={false}
              style={[s.input, { color: C.muted }]}
            />
            <Hint t="Username cannot be changed" />
          </View>
          <View>
            <FieldLabel t="Email" />
            <TextInput
              value={user?.email ?? ''}
              editable={false}
              style={[s.input, { color: C.muted }]}
            />
          </View>
        </View>
      </Card>

      {/* Status */}
      <Card>
        <CardHeader icon={<User size={15} color={C.green} />} title="Status" />
        <Divider />
        <Text style={s.subtext}>Choose how you appear to others.</Text>
        <View style={s.pillRow}>
          {([
            { id: 'online'    as const, label: 'Online',  dot: '#4ade80' },
            { id: 'idle'      as const, label: 'Idle',    dot: '#fbbf24' },
            { id: 'invisible' as const, label: 'Offline', dot: '#6b7280' },
          ]).map(({ id, label, dot }) => {
            const active = userStatus === id;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => setUserStatus(id)}
                activeOpacity={0.75}
                style={[s.pill, active && s.pillActive]}
              >
                <View style={[s.statusDot, { backgroundColor: dot }]} />
                <Text style={[s.pillText, active && { color: '#fff' }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* Privacy */}
      <Card>
        <CardHeader icon={<Shield size={15} color={C.green} />} title="Private Account" />
        <Divider />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[s.subtext, { flex: 1, marginRight: 12 }]}>
            Only approved followers can see your profile.
          </Text>
          <Switch
            value={user?.isPrivate ?? false}
            onValueChange={togglePrivacy}
            disabled={privacyBusy}
            trackColor={{ false: C.border, true: C.green }}
            thumbColor="#fff"
          />
        </View>
      </Card>

      {/* Language */}
      <Card>
        <CardHeader icon={<Globe size={15} color={C.green} />} title={t('settings.language.title')} />
        <Divider />
        <Text style={s.subtext}>{t('settings.language.subtitle')}</Text>
        <View style={s.pillRow}>
          {(['en', 'ko', 'ja'] as const).map(lang => {
            const active = i18n.language === lang;
            return (
              <TouchableOpacity
                key={lang}
                onPress={() => i18n.changeLanguage(lang)}
                activeOpacity={0.75}
                style={[s.pill, active && s.pillActive]}
              >
                <Text style={[s.pillText, active && { color: '#fff' }]}>
                  {t(`settings.language.${lang}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* Change email */}
      <Card>
        <CardHeader icon={<Mail size={15} color={C.green} />} title="Change Email" />
        <Divider />
        <View style={{ gap: 10 }}>
          <View>
            <FieldLabel t="New Email" />
            <TextInput
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="Enter new email"
              placeholderTextColor={C.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              style={s.input}
            />
          </View>
          <View>
            <FieldLabel t="Current Password" />
            <PasswordInput value={emailPw} onChange={setEmailPw} placeholder="Confirm with your password" />
          </View>
          <Btn
            label="Update Email"
            onPress={submitEmail}
            loading={busy}
            loadingLabel="Updating…"
            icon={<Save size={13} color="#000" />}
          />
        </View>
      </Card>

      {/* Legal */}
      <Card>
        <CardHeader icon={<Shield size={15} color={C.muted} />} title="Legal" />
        <Divider />
        <TouchableOpacity
          onPress={() => Linking.openURL('https://info.re-mixed.net/privacy')}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}
          activeOpacity={0.7}
        >
          <Text style={{ color: '#fff', fontSize: 14 }}>Privacy Policy</Text>
          <ExternalLink size={14} color={C.muted} />
        </TouchableOpacity>
        <Divider />
        <TouchableOpacity
          onPress={() => Linking.openURL('https://info.re-mixed.net/terms')}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}
          activeOpacity={0.7}
        >
          <Text style={{ color: '#fff', fontSize: 14 }}>Terms of Service</Text>
          <ExternalLink size={14} color={C.muted} />
        </TouchableOpacity>
      </Card>

      {/* Delete account */}
      <Card danger>
        <CardHeader icon={<Trash2 size={15} color={C.red} />} title="Delete Account" color={C.red} />
        <Divider />
        <Text style={s.subtext}>
          Permanently deletes your account and all data. This cannot be undone.
        </Text>
        <Btn
          label="Delete Account"
          onPress={confirmDelete}
          loading={deleteBusy}
          loadingLabel="Deleting…"
          variant="red"
          icon={<Trash2 size={13} color="#fff" />}
        />
      </Card>
    </View>
  );

  // ── Security tab ─────────────────────────────────────────────────────────────
  const SecurityTab = () => (
    <View style={{ gap: 12 }}>
      <Card>
        <CardHeader icon={<Lock size={15} color={C.green} />} title="Change Password" />
        <Divider />
        <View style={{ gap: 10 }}>
          <View>
            <FieldLabel t="Current Password" />
            <PasswordInput value={curPw} onChange={setCurPw} placeholder="Current password" />
          </View>
          <View>
            <FieldLabel t="New Password" />
            <PasswordInput value={newPw} onChange={setNewPw} placeholder="New password" />
          </View>
          <View>
            <FieldLabel t="Confirm New Password" />
            <PasswordInput value={confPw} onChange={setConfPw} placeholder="Confirm new password" />
          </View>
          <Btn
            label="Update Password"
            onPress={submitPassword}
            loading={busy}
            loadingLabel="Updating…"
            icon={<Save size={13} color="#000" />}
          />
        </View>
      </Card>

      <Card>
        <CardHeader icon={<Mail size={15} color={C.green} />} title="Forgot Password?" />
        <Divider />
        <Text style={s.subtext}>We'll send a reset link to your email address.</Text>
        {resetSent ? (
          <View style={s.resetSentBox}>
            <Check size={14} color={C.green} />
            <Text style={{ color: C.green, fontSize: 13, flex: 1 }}>
              Check your inbox for a password reset link.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <View>
              <FieldLabel t="Email address" />
              <TextInput
                value={resetEmail}
                onChangeText={setResetEmail}
                placeholder="Enter your email"
                placeholderTextColor={C.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!resetBusy}
                style={s.input}
              />
            </View>
            {resetErr ? <Text style={{ color: C.red, fontSize: 13 }}>{resetErr}</Text> : null}
            <Btn
              label="Send reset link"
              onPress={sendReset}
              loading={resetBusy}
              loadingLabel="Sending…"
              icon={<Mail size={13} color="#000" />}
            />
          </View>
        )}
      </Card>

      <Card danger>
        <CardHeader icon={<LogOut size={15} color={C.red} />} title="Logout" color={C.red} />
        <Divider />
        <Text style={s.subtext}>Sign out of your account on this device.</Text>
        <Btn
          label="Logout"
          onPress={async () => { try { await logout(); } catch {} close(); }}
          variant="red"
          icon={<LogOut size={13} color="#fff" />}
        />
      </Card>
    </View>
  );


  // ── Pro tab ──────────────────────────────────────────────────────────────────
  const ProTab = () => {
    const isPro =
      user?.subscriptionTier === 'pro' ||
      Boolean(proSub && (proSub.status === 'active' || proSub.status === 'past_due'));

    if (proLoading) {
      return (
        <View style={{ paddingVertical: 48, alignItems: 'center', gap: 10 }}>
          <ActivityIndicator color={C.green} />
          <Text style={{ color: C.muted, fontSize: 13 }}>Loading subscription…</Text>
        </View>
      );
    }

    const renewDate = proSub?.currentPeriodEnd
      ? new Date(proSub.currentPeriodEnd).toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', year: 'numeric',
        })
      : null;

    return (
      <View style={{ gap: 12 }}>
        {/* Current plan status */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[s.planIcon, isPro && { backgroundColor: 'rgba(234,179,8,0.15)' }]}>
                <Star size={16} color={isPro ? C.yellow : C.muted} fill={isPro ? C.yellow : 'none'} />
              </View>
              <View>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
                  {isPro ? 'Remixr Pro' : 'Free plan'}
                </Text>
                {isPro && renewDate ? (
                  <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                    {proSub?.cancelAtPeriodEnd ? `Cancels ${renewDate}` : `Renews ${renewDate}`}
                  </Text>
                ) : (
                  <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                    10 tracks · 2 albums · core features
                  </Text>
                )}
              </View>
            </View>
            <View style={[
              s.planBadge,
              isPro
                ? { backgroundColor: 'rgba(74,222,128,0.12)', borderColor: 'rgba(74,222,128,0.3)' }
                : { backgroundColor: C.dim, borderColor: C.border },
            ]}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: isPro ? '#4ade80' : C.muted }}>
                {isPro ? 'ACTIVE' : 'FREE'}
              </Text>
            </View>
          </View>
        </Card>

        {/* Cancellation notice */}
        {isPro && proSub?.cancelAtPeriodEnd && (
          <View style={s.cancelNotice}>
            <Star size={14} color={C.yellow} />
            <Text style={{ color: C.yellow, fontSize: 13, flex: 1 }}>
              Your Pro access ends on {renewDate}. You won't be charged again. Resubscribe any time to keep Pro.
            </Text>
          </View>
        )}

        {/* Manage billing (Pro users) */}
        {isPro && (
          <Card>
            <CardHeader icon={<CreditCard size={15} color={C.green} />} title="Manage Subscription" />
            <Divider />
            <View style={s.instructionBox}>
              <Text style={s.instructionTitle}>How to manage your billing</Text>
              {([
                'Go to app.re-mixed.net',
                'Sign into your account',
                'Access Settings',
                'Click on the Pro tab',
                'Press Manage Subscriptions',
              ] as const).map((step, i) => (
                <View key={i} style={s.instructionRow}>
                  <View style={s.instructionBadge}>
                    <Text style={s.instructionBadgeText}>{i + 1}</Text>
                  </View>
                  <Text style={s.instructionText}>{step}</Text>
                </View>
              ))}
            </View>
            <Btn
              label="Link to site  ↗"
              onPress={() => Linking.openURL('https://www.re-mixed.net')}
              icon={<CreditCard size={13} color="#000" />}
            />
          </Card>
        )}

        {/* Upgrade CTA (free users) */}
        {!isPro && (
          <Card>
            <CardHeader icon={<Star size={15} color={C.yellow} />} title="Unlock Remixr Pro" color={C.yellow} />
            <Divider />

            {/* Features + pricing */}
            <Text style={s.subtext}>
              Unlimited uploads, priority Discover placement, analytics, and more.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={s.pricePill}>
                <Text style={s.pricePillAmount}>{PRICING.monthly.display}</Text>
                <Text style={s.pricePillPeriod}>per month</Text>
              </View>
              <View style={[s.pricePill, { borderColor: 'rgba(234,179,8,0.4)', backgroundColor: 'rgba(234,179,8,0.08)', flex: 1 }]}>
                <Text style={[s.pricePillAmount, { color: C.yellow }]}>{PRICING.yearly.display}</Text>
                <Text style={s.pricePillPeriod}>/ mo, billed yearly</Text>
                <View style={s.savingBadge}>
                  <Text style={s.savingBadgeText}>2 months free</Text>
                </View>
              </View>
            </View>

            {/* How to subscribe — instruction list */}
            <View style={s.instructionBox}>
              <Text style={s.instructionTitle}>How to subscribe</Text>
              {([
                'Open a browser on any device',
                'Visit app.re-mixed.net',
                'Sign in with this account',
                'Go to Settings → Pro and choose a plan',
                'Complete payment — Pro activates instantly',
              ] as const).map((step, i) => (
                <View key={i} style={s.instructionRow}>
                  <View style={s.instructionBadge}>
                    <Text style={s.instructionBadgeText}>{i + 1}</Text>
                  </View>
                  <Text style={s.instructionText}>{step}</Text>
                </View>
              ))}
            </View>

            {/* Policy-safe action buttons */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => Linking.openURL('https://app.re-mixed.net')}
                activeOpacity={0.75}
                style={s.openWebBtn}
              >
                <ExternalLink size={14} color="#000" />
                <Text style={s.openWebBtnText}>Open website</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Share.share({
                  message: 'Subscribe to Remixr Pro at https://app.re-mixed.net',
                  url: 'https://app.re-mixed.net',
                })}
                activeOpacity={0.75}
                style={s.shareBtn}
              >
                <Share2 size={16} color={C.muted} />
              </TouchableOpacity>
            </View>

            <Text style={s.managedNote}>
              Subscriptions are managed on app.re-mixed.net
            </Text>
          </Card>
        )}
      </View>
    );
  };

  // ── Appearance tab ───────────────────────────────────────────────────────────
  const AppearanceTab = () => (
    <View style={{ gap: 12 }}>
      <Card>
        <CardHeader icon={<Palette size={15} color={C.green} />} title="App Background" />
        <Divider />
        <Text style={{ color: C.muted, fontSize: 12, marginBottom: 14, lineHeight: 18 }}>
          Choose a background that appears behind every screen. Your choice is saved locally.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {BACKGROUND_PRESETS.map((preset) => {
            const active = backgroundPresetId === preset.id;
            return (
              <TouchableOpacity
                key={preset.id}
                onPress={() => setBackgroundPreset(preset.id)}
                activeOpacity={0.75}
                style={{
                  width: '30%',
                  aspectRatio: 0.6,
                  borderRadius: 12,
                  overflow: 'hidden',
                  borderWidth: active ? 2 : 1.5,
                  borderColor: active ? C.green : C.border,
                }}
              >
                {/* Colour fill / image preview */}
                <View style={{ flex: 1, backgroundColor: preset.color }}>
                  {preset.image && (
                    <View style={{ ...StyleSheet.absoluteFillObject, opacity: 0.7 }}>
                      {/* Image thumbnail rendered at reduced opacity */}
                    </View>
                  )}
                </View>

                {/* Label row */}
                <View style={{
                  backgroundColor: 'rgba(0,0,0,0.65)',
                  paddingVertical: 5,
                  paddingHorizontal: 6,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>
                    {preset.label}
                  </Text>
                  {active && <Check size={10} color={C.green} strokeWidth={3} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </Card>
    </View>
  );

  const tabs: { id: TabId; label: string }[] = [
    { id: 'account',    label: t('settings.tabs.account') },
    { id: 'security',   label: t('settings.tabs.security') },
    { id: 'pro',        label: 'Pro' },
    { id: 'appearance', label: 'Appearance' },
  ];

  const TAB_IDS: TabId[] = tabs.map(t => t.id);
  const tabBarRef = useRef<ScrollView>(null);
  const pagerRef = useRef<ScrollView>(null);
  const [pageWidth, setPageWidth] = useState(0);

  // Keep tab bar indicator in sync with whichever tab is active
  useEffect(() => {
    const idx = TAB_IDS.indexOf(tab);
    tabBarRef.current?.scrollTo({ x: idx * 80, animated: true });
  }, [tab]);

  const goToTab = (id: TabId) => {
    const idx = TAB_IDS.indexOf(id);
    pagerRef.current?.scrollTo({ x: idx * pageWidth, animated: true });
    setTab(id);
  };

  const renderTabContent = (id: TabId) => {
    switch (id) {
      case 'account':    return <AccountTab />;
      case 'security':   return <SecurityTab />;
      case 'pro':        return <ProTab />;
      case 'appearance': return <AppearanceTab />;
    }
  };

  return (
    <>
    <Modal
      visible={isOpen}
      transparent
      animationType="none"
      onRequestClose={animateClose}
    >
      <View style={s.backdrop}>
        <Animated.View
          {...dismissGesture.panHandlers}
          style={[s.sheet, { paddingBottom: insets.bottom + 4, transform: [{ translateY }] }]}
        >

          {/* Drag handle */}
          <View style={{ alignItems: 'center', paddingVertical: 10 }}>
            <View style={s.dragHandle} />
          </View>

          {/* Header */}
          <View style={s.header}>
            <Text style={s.headerTitle}>{t('settings.title')}</Text>
            <TouchableOpacity onPress={animateClose} style={s.closeBtn} hitSlop={8}>
              <X size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {/* Feedback */}
          {success ? <FeedbackBanner message={success} type="success" /> : null}
          {error   ? <FeedbackBanner message={error}   type="error"   /> : null}

          {/* Tab bar */}
          <ScrollView
            ref={tabBarRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.tabBarScroll}
            contentContainerStyle={s.tabBar}
          >
            {tabs.map(({ id, label }) => {
              const active = tab === id;
              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => goToTab(id)}
                  activeOpacity={0.75}
                  style={[s.tabItem, active && s.tabItemActive]}
                >
                  <Text style={[s.tabLabel, active && s.tabLabelActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Paged content — mirrors HomePager's horizontal slide behaviour */}
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
            onLayout={e => setPageWidth(e.nativeEvent.layout.width)}
            onMomentumScrollEnd={e => {
              if (pageWidth === 0) return;
              const idx = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
              const next = TAB_IDS[idx];
              if (next && next !== tab) setTab(next);
            }}
          >
            {TAB_IDS.map(id => (
              <ScrollView
                key={id}
                style={{ width: pageWidth }}
                contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {renderTabContent(id)}
              </ScrollView>
            ))}
          </ScrollView>

        </Animated.View>
      </View>
    </Modal>

    {/* Delete Account Confirmation Modal */}
    <Modal
      visible={showDeleteModal}
      transparent
      animationType="fade"
      onRequestClose={() => { if (!deleteBusy) setShowDeleteModal(false); }}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: '100%', backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: '#3a1a1a', padding: 24, gap: 16 }}>

          {/* Header */}
          <View style={{ alignItems: 'center', gap: 8 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(239,68,68,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              <Trash2 size={24} color={C.red} />
            </View>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Delete Account</Text>
            <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 18 }}>
              This will permanently delete your account, all your tracks, playlists, and data. This action cannot be undone.
            </Text>
          </View>

          {/* Type to confirm */}
          <View style={{ gap: 8 }}>
            <Text style={{ color: C.muted, fontSize: 12 }}>
              Type <Text style={{ color: C.red, fontWeight: '700' }}>DELETE</Text> to confirm
            </Text>
            <TextInput
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="DELETE"
              placeholderTextColor="rgba(255,255,255,0.2)"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deleteBusy}
              style={{
                backgroundColor: C.bg,
                borderWidth: 1,
                borderColor: deleteConfirmText === 'DELETE' ? C.red : C.border,
                borderRadius: 10,
                paddingHorizontal: 14,
                paddingVertical: 11,
                color: '#fff',
                fontSize: 15,
                fontWeight: '600',
                letterSpacing: 1,
              }}
            />
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              onPress={() => { setShowDeleteModal(false); setDeleteConfirmText(''); }}
              disabled={deleteBusy}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: C.dim, alignItems: 'center' }}
              activeOpacity={0.7}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={executeDelete}
              disabled={deleteConfirmText !== 'DELETE' || deleteBusy}
              style={{
                flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                backgroundColor: deleteConfirmText === 'DELETE' && !deleteBusy ? C.red : 'rgba(239,68,68,0.3)',
              }}
              activeOpacity={0.8}
            >
              {deleteBusy
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Delete Forever</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.border,
    height: '88%',
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.5, shadowRadius: 20 },
      android: { elevation: 24 },
    }),
  },
  dragHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: C.surface,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  tabBarScroll: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    flexGrow: 0,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 8,
  },
  tabItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: C.green,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: C.muted,
  },
  tabLabelActive: {
    color: C.green,
    fontWeight: '600',
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 12,
  },
  cardDanger: {
    borderColor: 'rgba(239,68,68,0.25)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: C.dim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
  },
  fieldLabel: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  hint: {
    color: C.muted,
    fontSize: 11,
    marginTop: 4,
  },
  subtext: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#fff',
    fontSize: 14,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  btnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: C.green,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  pillActive: {
    backgroundColor: C.dim,
    borderColor: C.green,
  },
  pillText: {
    color: C.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  toggleLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  toggleSub: {
    color: C.muted,
    fontSize: 12,
    marginTop: 2,
  },
  resetSentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(138,236,159,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(138,236,159,0.25)',
  },
  planIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.dim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  cancelNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    backgroundColor: 'rgba(234,179,8,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.25)',
  },
  pricePill: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.dim,
    alignItems: 'center',
    position: 'relative',
  },
  pricePillAmount: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  pricePillPeriod: {
    color: C.muted,
    fontSize: 11,
    marginTop: 2,
  },
  savingBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: C.yellow,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  savingBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
  },
  instructionBox: {
    backgroundColor: 'rgba(234,179,8,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.2)',
    padding: 14,
    gap: 10,
  },
  instructionTitle: {
    color: C.yellow,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  instructionBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(234,179,8,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  instructionBadgeText: {
    color: C.yellow,
    fontSize: 10,
    fontWeight: '700',
  },
  instructionText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  openWebBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: C.yellow,
  },
  openWebBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '600',
  },
  shareBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: C.dim,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  managedNote: {
    color: C.muted,
    fontSize: 11,
    textAlign: 'center',
  },
});

export default SettingsModal;
