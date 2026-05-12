import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import * as ImagePicker from 'expo-image-picker';
import {
  X, User, Mail, Lock, Shield, Bell,
  LogOut, Eye, EyeOff, Save, Check,
  Circle, Moon, Globe,
} from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { AuthService } from '../../services/authService';
import { getAvatarUrl } from '../../utils/avatar';

interface SettingsModalProps {
  isOpen: boolean;
}

type TabId = 'account' | 'security' | 'notifications';

interface ChangeEmailForm { newEmail: string; password: string; }
interface ChangePasswordForm { currentPassword: string; newPassword: string; confirmPassword: string; }

// ─── Reusable section card ─────────────────────────────────────────────────────
const Section: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View className="bg-white/5 border border-white/10 rounded-xl p-5 gap-4 mb-4">
    {children}
  </View>
);

const SectionTitle: React.FC<{
  icon: React.ReactNode;
  label: string;
  color?: string;
}> = ({ icon, label, color }) => (
  <View className="flex-row items-center gap-2">
    {icon}
    <Text className={`text-base font-semibold ${color ?? 'text-white'}`}>{label}</Text>
  </View>
);

// ─── Password field ────────────────────────────────────────────────────────────
const PasswordInput: React.FC<{
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}> = ({ value, onChangeText, placeholder, disabled }) => {
  const [show, setShow] = useState(false);
  return (
    <View className="flex-row items-center bg-dark-700 border border-dark-600 rounded-lg px-4">
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.25)"
        secureTextEntry={!show}
        editable={!disabled}
        className="flex-1 py-3 text-white"
      />
      <TouchableOpacity onPress={() => setShow(s => !s)} className="p-1">
        {show
          ? <EyeOff size={16} color="#6b7280" />
          : <Eye size={16} color="#6b7280" />}
      </TouchableOpacity>
    </View>
  );
};

// ─── Submit button ─────────────────────────────────────────────────────────────
const SubmitButton: React.FC<{
  onPress: () => void;
  loading: boolean;
  label: string;
  loadingLabel?: string;
  icon?: React.ReactNode;
  danger?: boolean;
}> = ({ onPress, loading, label, loadingLabel, icon, danger }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={loading}
    className={`flex-row items-center gap-2 self-start px-5 py-2.5 rounded-lg ${
      danger ? 'bg-red-600' : 'bg-blue-600'
    } ${loading ? 'opacity-50' : ''}`}
    activeOpacity={0.8}
  >
    {loading ? <ActivityIndicator size="small" color="#fff" /> : icon}
    <Text className="text-white font-semibold text-sm">
      {loading ? (loadingLabel ?? 'Loading…') : label}
    </Text>
  </TouchableOpacity>
);

// ─── Feedback banner ───────────────────────────────────────────────────────────
const FeedbackBanner: React.FC<{ message: string; type: 'success' | 'error' }> = ({ message, type }) => (
  <View className={`mx-4 mt-3 p-3 rounded-lg flex-row items-center gap-2 ${
    type === 'success' ? 'bg-green-600' : 'bg-red-600'
  }`}>
    {type === 'success'
      ? <Check size={15} color="#fff" />
      : <X size={15} color="#fff" />}
    <Text className="text-white text-sm flex-1">{message}</Text>
  </View>
);

// ─── Notification toggle row ───────────────────────────────────────────────────
const NotificationRow: React.FC<{ label: string; sub: string; defaultValue: boolean }> = ({
  label, sub, defaultValue,
}) => {
  const [enabled, setEnabled] = useState(defaultValue);
  return (
    <View className="flex-row items-center justify-between py-1">
      <View className="flex-1 mr-4">
        <Text className="text-sm font-medium text-white">{label}</Text>
        <Text className="text-xs text-white/40">{sub}</Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={setEnabled}
        trackColor={{ false: '#374151', true: '#2563eb' }}
        thumbColor="#fff"
      />
    </View>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────
const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen }) => {
  const {
    user, setSettingsOpen, setUserAvatar,
    updateProfile, changePassword, togglePrivateAccount,
    logout, userStatus, setUserStatus,
  } = useStore();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabId>('account');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const [avatarUri, setAvatarUri] = useState<string | null>(user?.avatar ?? null);
  const [avatarDirty, setAvatarDirty] = useState(false);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [resetEmail, setResetEmail] = useState(user?.email ?? '');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');

  const [emailForm, setEmailForm] = useState<ChangeEmailForm>({ newEmail: '', password: '' });
  const [passwordForm, setPasswordForm] = useState<ChangePasswordForm>({
    currentPassword: '', newPassword: '', confirmPassword: '',
  });

  useEffect(() => { if (user?.email) setResetEmail(user.email); }, [user?.email]);
  useEffect(() => { setAvatarUri(user?.avatar ?? null); setAvatarDirty(false); }, [user?.avatar]);

  const flash = (msg: string, type: 'success' | 'error') => {
    if (type === 'success') { setSuccessMessage(msg); setErrorMessage(''); }
    else { setErrorMessage(msg); setSuccessMessage(''); }
    setTimeout(() => { setSuccessMessage(''); setErrorMessage(''); }, 3000);
  };

  // ── Avatar ──────────────────────────────────────────────────────────────────
  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
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
    try {
      await updateProfile({ avatar: avatarUri });
      setUserAvatar(avatarUri);
      setAvatarDirty(false);
      flash('Avatar updated!', 'success');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed to update avatar', 'error');
    }
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

  // ── Email ───────────────────────────────────────────────────────────────────
  const handleEmailSubmit = async () => {
    if (!emailForm.newEmail.trim()) return;
    setIsLoading(true);
    try {
      await updateProfile({ email: emailForm.newEmail });
      setEmailForm({ newEmail: '', password: '' });
      flash('Email updated!', 'success');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed to update email', 'error');
    } finally { setIsLoading(false); }
  };

  // ── Password ────────────────────────────────────────────────────────────────
  const handlePasswordSubmit = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      flash('New passwords do not match', 'error'); return;
    }
    setIsLoading(true);
    try {
      await changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      flash('Password updated!', 'success');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed to update password', 'error');
    } finally { setIsLoading(false); }
  };

  // ── Reset password ──────────────────────────────────────────────────────────
  const handleResetPassword = async () => {
    const email = resetEmail.trim();
    if (!email) { setResetError('Please enter your email'); return; }
    setResetLoading(true);
    setResetError('');
    try {
      await AuthService.resetPassword(email);
      setResetSent(true);
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Failed to send reset email');
    } finally { setResetLoading(false); }
  };

  // ── Privacy ─────────────────────────────────────────────────────────────────
  const handlePrivacyToggle = async () => {
    if (!user) return;
    setPrivacyLoading(true);
    try {
      const updated = await togglePrivateAccount(user.id, !user.isPrivate);
      flash(`Account is now ${updated.isPrivate ? 'private' : 'public'}`, 'success');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed to update privacy', 'error');
    } finally { setPrivacyLoading(false); }
  };

  // ── Delete account ──────────────────────────────────────────────────────────
  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Permanently delete your account and all data? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            if (!user) return;
            setDeleteLoading(true);
            try {
              await AuthService.deleteAccount(user.id);
              flash('Account deleted. Logging out…', 'success');
              setTimeout(async () => { await logout(); setSettingsOpen(false); }, 1500);
            } catch (e) {
              flash(e instanceof Error ? e.message : 'Failed to delete account', 'error');
            } finally { setDeleteLoading(false); }
          },
        },
      ],
    );
  };

  // ── Logout ──────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try { await logout(); } catch { /* force logout */ }
    setSettingsOpen(false);
  };

  // ── Tabs config ─────────────────────────────────────────────────────────────
  const tabs: { id: TabId; label: string; Icon: React.FC<any> }[] = [
    { id: 'account', label: t('settings.tabs.account'), Icon: User },
    { id: 'security', label: t('settings.tabs.security'), Icon: Shield },
    { id: 'notifications', label: t('settings.tabs.notifications'), Icon: Bell },
  ];

  // ── Account tab ─────────────────────────────────────────────────────────────
  const renderAccount = () => (
    <View>
      <Section>
        <SectionTitle icon={<User size={18} color="#3b82f6" />} label="Profile Picture" />
        <View className="flex-row items-center gap-4">
          <Image
            source={{ uri: getAvatarUrl(avatarUri) }}
            className="w-16 h-16 rounded-full border-2 border-primary-500"
            resizeMode="cover"
          />
          <View className="gap-2">
            <TouchableOpacity onPress={pickAvatar} className="px-4 py-2 bg-primary-600 rounded-lg" activeOpacity={0.8}>
              <Text className="text-white text-sm font-medium">Change photo</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={removeAvatar} activeOpacity={0.8}>
              <Text className="text-red-400 text-xs">Remove photo</Text>
            </TouchableOpacity>
          </View>
          {avatarDirty && (
            <TouchableOpacity onPress={saveAvatar} className="ml-auto px-4 py-2 bg-blue-600 rounded-lg" activeOpacity={0.8}>
              <Text className="text-white text-sm font-medium">Save</Text>
            </TouchableOpacity>
          )}
        </View>
      </Section>

      <Section>
        <SectionTitle icon={<User size={18} color="#3b82f6" />} label="Profile Information" />
        <View>
          <Text className="text-xs text-white/50 mb-1">Username</Text>
          <TextInput
            value={user?.username ?? ''}
            editable={false}
            className="px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white/50"
          />
          <Text className="text-xs text-white/30 mt-1">Username cannot be changed</Text>
        </View>
        <View>
          <Text className="text-xs text-white/50 mb-1">Current Email</Text>
          <TextInput
            value={user?.email ?? ''}
            editable={false}
            className="px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white/50"
          />
        </View>
      </Section>

      <Section>
        <SectionTitle icon={<Circle size={18} color="#3b82f6" />} label="Status" />
        <Text className="text-sm text-white/50">Choose how you appear to others.</Text>
        <View className="flex-row flex-wrap gap-2">
          {([
            { id: 'online' as const, label: 'Online', activeClass: 'bg-green-600' },
            { id: 'idle' as const, label: 'Idle', activeClass: 'bg-amber-600' },
            { id: 'invisible' as const, label: 'Offline', activeClass: 'bg-dark-600' },
          ]).map(s => (
            <TouchableOpacity
              key={s.id}
              onPress={() => setUserStatus(s.id)}
              className={`flex-row items-center gap-2 px-4 py-2.5 rounded-lg border ${
                userStatus === s.id ? `${s.activeClass} border-transparent` : 'border-dark-600'
              }`}
              activeOpacity={0.8}
            >
              {s.id === 'online' && <View className="w-2.5 h-2.5 rounded-full bg-green-400" />}
              {s.id === 'idle' && <Moon size={14} color={userStatus === s.id ? '#fff' : '#6b7280'} />}
              {s.id === 'invisible' && <EyeOff size={14} color={userStatus === s.id ? '#fff' : '#6b7280'} />}
              <Text className={`text-sm font-medium ${userStatus === s.id ? 'text-white' : 'text-white/50'}`}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>

      <Section>
        <View className="flex-row items-center justify-between">
          <View className="flex-1 gap-1 mr-4">
            <SectionTitle icon={<Shield size={18} color="#3b82f6" />} label="Private Account" />
            <Text className="text-sm text-white/50">Only approved followers can see your profile.</Text>
          </View>
          <TouchableOpacity
            onPress={handlePrivacyToggle}
            disabled={privacyLoading}
            className={`px-4 py-2 rounded-lg ${user?.isPrivate ? 'bg-blue-600' : 'bg-dark-600'} ${privacyLoading ? 'opacity-50' : ''}`}
            activeOpacity={0.8}
          >
            <Text className="text-white font-semibold text-sm">
              {privacyLoading ? 'Saving…' : user?.isPrivate ? 'Private' : 'Public'}
            </Text>
          </TouchableOpacity>
        </View>
      </Section>

      <Section>
        <SectionTitle icon={<Globe size={18} color="#3b82f6" />} label={t('settings.language.title')} />
        <Text className="text-sm text-white/50">{t('settings.language.subtitle')}</Text>
        <View className="flex-row flex-wrap gap-2">
          {(['en', 'ko', 'ja'] as const).map(lang => (
            <TouchableOpacity
              key={lang}
              onPress={() => i18n.changeLanguage(lang)}
              className={`px-4 py-2 rounded-lg border ${
                i18n.language === lang ? 'bg-blue-600 border-blue-600' : 'border-dark-600'
              }`}
              activeOpacity={0.8}
            >
              <Text className={`text-sm font-medium ${i18n.language === lang ? 'text-white' : 'text-white/50'}`}>
                {t(`settings.language.${lang}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>

      <Section>
        <SectionTitle icon={<Mail size={18} color="#3b82f6" />} label="Change Email" />
        <View>
          <Text className="text-xs text-white/50 mb-1">New Email</Text>
          <TextInput
            value={emailForm.newEmail}
            onChangeText={v => setEmailForm(f => ({ ...f, newEmail: v }))}
            placeholder="Enter new email"
            placeholderTextColor="rgba(255,255,255,0.25)"
            keyboardType="email-address"
            autoCapitalize="none"
            className="px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white"
          />
        </View>
        <View>
          <Text className="text-xs text-white/50 mb-1">Current Password</Text>
          <PasswordInput
            value={emailForm.password}
            onChangeText={v => setEmailForm(f => ({ ...f, password: v }))}
            placeholder="Enter current password"
          />
        </View>
        <SubmitButton
          onPress={handleEmailSubmit}
          loading={isLoading}
          label="Update Email"
          loadingLabel="Updating…"
          icon={<Save size={14} color="#fff" />}
        />
      </Section>

      <Section>
        <SectionTitle icon={<LogOut size={18} color="#ef4444" />} label="Delete Account" color="text-red-400" />
        <Text className="text-sm text-white/50">Permanently delete your account and all data. This cannot be undone.</Text>
        <SubmitButton
          onPress={confirmDeleteAccount}
          loading={deleteLoading}
          label="Delete Account"
          loadingLabel="Deleting…"
          danger
        />
      </Section>
    </View>
  );

  // ── Security tab ────────────────────────────────────────────────────────────
  const renderSecurity = () => (
    <View>
      <Section>
        <SectionTitle icon={<Lock size={18} color="#3b82f6" />} label="Change Password" />
        <View>
          <Text className="text-xs text-white/50 mb-1">Current Password</Text>
          <PasswordInput
            value={passwordForm.currentPassword}
            onChangeText={v => setPasswordForm(f => ({ ...f, currentPassword: v }))}
            placeholder="Enter current password"
          />
        </View>
        <View>
          <Text className="text-xs text-white/50 mb-1">New Password</Text>
          <PasswordInput
            value={passwordForm.newPassword}
            onChangeText={v => setPasswordForm(f => ({ ...f, newPassword: v }))}
            placeholder="Enter new password"
          />
        </View>
        <View>
          <Text className="text-xs text-white/50 mb-1">Confirm New Password</Text>
          <PasswordInput
            value={passwordForm.confirmPassword}
            onChangeText={v => setPasswordForm(f => ({ ...f, confirmPassword: v }))}
            placeholder="Confirm new password"
          />
        </View>
        <SubmitButton
          onPress={handlePasswordSubmit}
          loading={isLoading}
          label="Update Password"
          loadingLabel="Updating…"
          icon={<Save size={14} color="#fff" />}
        />
      </Section>

      <Section>
        <SectionTitle icon={<Mail size={18} color="#3b82f6" />} label="Forgot your password?" />
        <Text className="text-sm text-white/50">
          Enter your account email and we'll send you a reset link.
        </Text>
        {resetSent ? (
          <View className="flex-row items-center gap-2 p-3 bg-green-900/30 border border-green-700 rounded-lg">
            <Check size={15} color="#4ade80" />
            <Text className="text-sm text-green-400 flex-1">
              Check your email for a password reset link.
            </Text>
          </View>
        ) : (
          <View>
            <Text className="text-xs text-white/50 mb-1">Email address</Text>
            <TextInput
              value={resetEmail}
              onChangeText={setResetEmail}
              placeholder="Enter your email"
              placeholderTextColor="rgba(255,255,255,0.25)"
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!resetLoading}
              className="px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white mb-3"
            />
            {resetError ? <Text className="text-sm text-red-400 mb-3">{resetError}</Text> : null}
            <SubmitButton
              onPress={handleResetPassword}
              loading={resetLoading}
              label="Send reset link"
              loadingLabel="Sending…"
              icon={<Mail size={14} color="#fff" />}
            />
          </View>
        )}
      </Section>

      <Section>
        <SectionTitle icon={<LogOut size={18} color="#ef4444" />} label="Logout" />
        <Text className="text-sm text-white/50">Sign out of your account.</Text>
        <SubmitButton
          onPress={handleLogout}
          loading={false}
          label="Logout"
          icon={<LogOut size={14} color="#fff" />}
          danger
        />
      </Section>
    </View>
  );

  // ── Notifications tab ───────────────────────────────────────────────────────
  const renderNotifications = () => (
    <View>
      <Section>
        <SectionTitle icon={<Bell size={18} color="#3b82f6" />} label="Notification Preferences" />
        <NotificationRow label="New Music" sub="When artists you follow release new music" defaultValue={true} />
        <NotificationRow label="Comments" sub="When someone comments on your posts" defaultValue={true} />
        <NotificationRow label="Messages" sub="When you receive new messages" defaultValue={false} />
      </Section>
    </View>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'account': return renderAccount();
      case 'security': return renderSecurity();
      case 'notifications': return renderNotifications();
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setSettingsOpen(false)}
    >
      <View className="flex-1 bg-black/70 items-center justify-center p-4">
        <View
          className="w-full max-w-lg bg-dark-900 border border-dark-700 rounded-2xl overflow-hidden"
          style={{ maxHeight: '90%' }}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-700">
            <Text className="text-xl font-bold text-white">{t('settings.title')}</Text>
            <TouchableOpacity
              onPress={() => setSettingsOpen(false)}
              className="p-2 rounded-lg bg-dark-700"
              activeOpacity={0.7}
            >
              <X size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {/* Feedback banners */}
          {successMessage ? <FeedbackBanner message={successMessage} type="success" /> : null}
          {errorMessage ? <FeedbackBanner message={errorMessage} type="error" /> : null}

          {/* Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="border-b border-dark-700"
            contentContainerStyle={{ flexDirection: 'row' }}
          >
            {tabs.map(({ id, label, Icon }) => (
              <TouchableOpacity
                key={id}
                onPress={() => setActiveTab(id)}
                className={`flex-row items-center gap-1.5 px-4 py-3 border-b-2 ${
                  activeTab === id ? 'border-blue-500 bg-blue-600/10' : 'border-transparent'
                }`}
                activeOpacity={0.7}
              >
                <Icon size={15} color={activeTab === id ? '#3b82f6' : '#6b7280'} />
                <Text className={`text-sm font-medium ${activeTab === id ? 'text-blue-400' : 'text-white/40'}`}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Content */}
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {renderContent()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default SettingsModal;
