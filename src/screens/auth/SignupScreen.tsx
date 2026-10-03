import React, { useState, useRef, useEffect } from 'react';
import TermsAgreement from '../../components/auth/TermsAgreement';
import { hap } from '../../utils/haptics';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Animated,
  StyleSheet,
} from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { localizeAuthError } from '../../utils/authErrors';
import { Mail, Lock, Eye, EyeOff, Mic2, Headphones, ArrowRight, Music2 } from 'lucide-react-native';
import { AuthService } from '../../services/authService';
import { useStore } from '../../store/useStore';
import { AuthStackParamList } from '../../navigation/AuthStack';
import {
  MIN_SIGNUP_AGE,
  ageInYears,
  blockSignup,
  isSignupBlocked,
  parseDateOfBirth,
  toIsoDate,
} from '../../utils/ageGate';

type Role = 'musician' | 'consumer';

interface SignupForm {
  email: string;
  password: string;
}

type AuthNav = NativeStackNavigationProp<AuthStackParamList>;

// label / sublabel / nextHint are translation keys.
const ROLE_OPTIONS: {
  value: Role;
  label: string;
  sublabel: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  nextHint: string;
  activeColor: string;
  activeBorderColor: string;
  activeBg: string;
}[] = [
  {
    value: 'musician',
    label: 'auth.signup.musician',
    sublabel: 'auth.signup.musicianSub',
    Icon: Mic2,
    nextHint: 'auth.signup.musicianHint',
    activeColor: '#a855f7',
    activeBorderColor: '#a855f7',
    activeBg: 'rgba(168,85,247,0.1)',
  },
  {
    value: 'consumer',
    label: 'auth.signup.listener',
    sublabel: 'auth.signup.listenerSub',
    Icon: Headphones,
    nextHint: 'auth.signup.listenerHint',
    activeColor: '#06b6d4',
    activeBorderColor: '#06b6d4',
    activeBg: 'rgba(6,182,212,0.1)',
  },
];

const SignupScreen: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // Date of birth — empty by default so nothing nudges toward an answer.
  const [dobMonth, setDobMonth] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [ageBlocked, setAgeBlocked] = useState(false);

  const navigation = useNavigation<AuthNav>();
  const { t } = useTranslation();

  useEffect(() => {
    isSignupBlocked().then(blocked => { if (blocked) setAgeBlocked(true); });
  }, []);

  const logoScale = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(0)).current;
  const containerTranslateY = useRef(new Animated.Value(24)).current;
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const hintTranslateY = useRef(new Animated.Value(4)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        delay: 150,
        useNativeDriver: true,
        stiffness: 220,
      }),
      Animated.timing(containerOpacity, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(containerTranslateY, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Animate the "next hint" pill whenever a role is selected
  useEffect(() => {
    if (selectedRole) {
      hintOpacity.setValue(0);
      hintTranslateY.setValue(4);
      Animated.parallel([
        Animated.timing(hintOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(hintTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [selectedRole]);

  const { control, handleSubmit, formState: { errors } } = useForm<SignupForm>();

  const onSubmit = async (data: SignupForm) => {
    if (ageBlocked) return;

    const dob = parseDateOfBirth(Number(dobYear), Number(dobMonth), Number(dobDay));
    if (!dob) {
      setError(t('auth.signup.invalidDob'));
      return;
    }
    // Under the minimum age: stop here. Nothing is sent to the server, and
    // the block is remembered on this device.
    if (ageInYears(dob) < MIN_SIGNUP_AGE) {
      await blockSignup();
      setAgeBlocked(true);
      setError('');
      return;
    }

    if (!selectedRole) {
      setError(t('auth.signup.chooseRole'));
      return;
    }
    if (!acceptedTerms) {
      setError(t('auth.signup.mustAgree'));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const username = data.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
      const registeredUser = await AuthService.register({
        username,
        email: data.email,
        password: data.password,
        role: selectedRole,
        dateOfBirth: toIsoDate(dob),
      });
      // Sync the store — RootNavigator will route to OnboardingStack or MainTabs
      // based on auth state + isOnboardingPending(user.id).
      useStore.getState().applySessionUser(registeredUser);
    } catch (err) {
      setError(localizeAuthError(err, 'auth.signup.failed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Opened on top of the app while browsing as a guest: let them back out. */}
      {navigation.canGoBack() && (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('guest.notNow')}
          style={{ position: 'absolute', top: 54, right: 18, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Text style={{ color: '#8a8aa3', fontSize: 14, fontWeight: '600' }}>{t('guest.notNow')}</Text>
          <X size={16} color="#8a8aa3" />
        </TouchableOpacity>
      )}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={{
              opacity: containerOpacity,
              transform: [{ translateY: containerTranslateY }],
            }}
          >
            {/* Logo + heading */}
            <View style={styles.header}>
              <Animated.View style={[styles.logoWrapper, { transform: [{ scale: logoScale }] }]}>
                <Image
                  source={require('../../../assets/logo.png')}
                  style={styles.logo}
                  resizeMode="cover"
                />
              </Animated.View>
              <Text style={styles.appTitle}>{t('auth.signup.title')}</Text>
              <Text style={styles.appSubtitle}>{t('auth.signup.subtitle')}</Text>
            </View>

            {/* Card */}
            {ageBlocked ? (
              <View style={[styles.card, styles.blockedCard]}>
                <Text style={styles.blockedTitle}>{t('auth.signup.ageBlocked')}</Text>
                <Text style={styles.blockedText}>{t('auth.signup.blockedThanks')}</Text>
              </View>
            ) : (
            <View style={styles.card}>
              {/* Error banner */}
              {!!error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* Email */}
              <View style={styles.field}>
                <Text style={styles.label}>{t('auth.common.email')}</Text>
                <View style={styles.inputRow}>
                  <Mail size={18} color={MUTED} style={styles.inputIcon} />
                  <Controller
                    control={control}
                    name="email"
                    rules={{
                      required: t('auth.validation.emailRequired'),
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: t('auth.validation.emailInvalid'),
                      },
                    }}
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        style={styles.input}
                        placeholder="you@example.com"
                        placeholderTextColor={MUTED}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        value={value}
                      />
                    )}
                  />
                </View>
                {errors.email && <Text style={styles.fieldError}>{errors.email.message}</Text>}
              </View>

              {/* Password */}
              <View style={styles.field}>
                <Text style={styles.label}>{t('auth.common.password')}</Text>
                <View style={styles.inputRow}>
                  <Lock size={18} color={MUTED} style={styles.inputIcon} />
                  <Controller
                    control={control}
                    name="password"
                    rules={{
                      required: t('auth.validation.passwordRequired'),
                      minLength: { value: 6, message: t('auth.validation.passwordMinShort') },
                    }}
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        style={[styles.input, styles.inputWithAction]}
                        placeholder={t('auth.signup.passwordPlaceholder')}
                        placeholderTextColor={MUTED}
                        secureTextEntry={!showPassword}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        value={value}
                      />
                    )}
                  />
                  <TouchableOpacity
                    onPress={() => { hap.tap(); setShowPassword(v => !v); }}
                    style={styles.eyeButton}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? t('auth.common.hidePassword') : t('auth.common.showPassword')}
                  >
                    {showPassword ? (
                      <EyeOff size={18} color={MUTED} />
                    ) : (
                      <Eye size={18} color={MUTED} />
                    )}
                  </TouchableOpacity>
                </View>
                {errors.password && (
                  <Text style={styles.fieldError}>{errors.password.message}</Text>
                )}
              </View>

              {/* Date of birth */}
              <View style={styles.field}>
                <Text style={styles.label} nativeID="dobLabel">{t('auth.signup.dob')}</Text>
                <View style={styles.dobRow}>
                  {(() => {
                    const month = { key: 'month', placeholder: t('auth.signup.monthPlaceholder'), value: dobMonth, onChange: setDobMonth, maxLength: 2, flex: 1, a11y: t('auth.signup.month') };
                    const day = { key: 'day', placeholder: t('auth.signup.dayPlaceholder'), value: dobDay, onChange: setDobDay, maxLength: 2, flex: 1, a11y: t('auth.signup.day') };
                    const year = { key: 'year', placeholder: t('auth.signup.yearPlaceholder'), value: dobYear, onChange: setDobYear, maxLength: 4, flex: 1.6, a11y: t('auth.signup.year') };
                    return i18n.language === 'ko' || i18n.language === 'ja' ? [year, month, day] : [month, day, year];
                  })().map(f => (
                    <View key={f.key} style={[styles.inputRow, { flex: f.flex }]}>
                      <TextInput
                        style={[styles.input, styles.dobInput]}
                        placeholder={f.placeholder}
                        placeholderTextColor={MUTED}
                        keyboardType="number-pad"
                        maxLength={f.maxLength}
                        value={f.value}
                        onChangeText={v => { f.onChange(v.replace(/\D/g, '')); setError(''); }}
                        accessibilityLabel={t('auth.signup.dobA11y', { field: f.a11y })}
                        accessibilityLabelledBy="dobLabel"
                      />
                    </View>
                  ))}
                </View>
              </View>

              {/* Role selector */}
              <View style={styles.field}>
                <Text style={styles.label}>{t('auth.signup.iAmA')}</Text>
                <View style={styles.roleRow}>
                  {ROLE_OPTIONS.map(opt => {
                    const active = selectedRole === opt.value;
                    const iconColor = active ? opt.activeColor : MUTED;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.roleCard,
                          active && {
                            borderColor: opt.activeBorderColor,
                            backgroundColor: opt.activeBg,
                          },
                        ]}
                        onPress={() => {
                          hap.tap();
                          setSelectedRole(opt.value);
                          setError('');
                        }}
                        activeOpacity={0.8}
                        accessibilityRole="radio"
                        accessibilityLabel={`${t(opt.label)}. ${t(opt.sublabel)}`}
                        accessibilityState={{ checked: active }}
                      >
                        <opt.Icon size={28} color={iconColor} strokeWidth={1.5} />

                        <View style={styles.roleTextGroup}>
                          <Text
                            style={[styles.roleLabel, active && { color: '#fff' }]}
                          >
                            {t(opt.label)}
                          </Text>
                          <Text
                            style={[styles.roleSublabel, active && { color: 'rgba(255,255,255,0.55)' }]}
                          >
                            {t(opt.sublabel)}
                          </Text>
                        </View>

                        {active && (
                          <Animated.View
                            style={[
                              styles.hintPill,
                              { opacity: hintOpacity, transform: [{ translateY: hintTranslateY }] },
                            ]}
                          >
                            <Music2 size={10} color="rgba(255,255,255,0.5)" />
                            <Text style={styles.hintText}>{t(opt.nextHint)}</Text>
                          </Animated.View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <TermsAgreement
                accepted={acceptedTerms}
                onChange={setAcceptedTerms}
                textColor="rgba(255,255,255,0.55)"
                linkColor="#8b5cf6"
              />

              {/* Submit */}
              <TouchableOpacity
                style={[styles.primaryButton, (isLoading || !acceptedTerms) && styles.buttonDisabled]}
                onPress={handleSubmit(onSubmit)}
                disabled={isLoading || !acceptedTerms}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <View style={styles.buttonInner}>
                    <ActivityIndicator size="small" color="#000000" style={styles.spinner} />
                    <Text style={styles.primaryButtonText}>{t('auth.common.creatingAccount')}</Text>
                  </View>
                ) : (
                  <View style={styles.buttonInner}>
                    <Text style={styles.primaryButtonText}>{t('auth.common.createAccount')}</Text>
                    <ArrowRight size={16} color="#fff" style={styles.arrowIcon} />
                  </View>
                )}
              </TouchableOpacity>
            </View>
            )}

            {/* Sign-in link */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {t('auth.common.haveAccount')}{' '}
                <Text
                  style={styles.linkText}
                  onPress={() => navigation.navigate('Login')}
                >
                  {t('auth.common.signInLink')}
                </Text>
              </Text>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const PURPLE = '#7c3aed';
const DARK_BG = '#0a0a14';
const CARD_BG = 'rgba(255,255,255,0.05)';
const INPUT_BG = '#1a1a28';
const BORDER = '#2a2a3a';
const MUTED = '#6b6b8a';

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 2,
    borderColor: 'rgba(124,58,237,0.4)',
  },
  logo: {
    width: 64,
    height: 64,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#c084fc',
    marginBottom: 4,
    textAlign: 'center',
  },
  appSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 20,
  },
  errorBox: {
    padding: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 8,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#e2e2f0',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    color: '#fff',
    fontSize: 14,
  },
  inputWithAction: {
    paddingRight: 4,
  },
  eyeButton: {
    padding: 4,
    marginLeft: 4,
  },
  fieldError: {
    fontSize: 12,
    color: '#f87171',
  },
  dobRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dobInput: {
    textAlign: 'center',
  },
  blockedCard: {
    alignItems: 'center',
    gap: 8,
  },
  blockedTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  blockedText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  roleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roleCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: BORDER,
    gap: 8,
  },
  roleTextGroup: {
    alignItems: 'center',
    gap: 2,
  },
  roleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8b8ba0',
    textAlign: 'center',
  },
  roleSublabel: {
    fontSize: 11,
    color: '#4a4a62',
    textAlign: 'center',
  },
  hintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    width: '100%',
    justifyContent: 'center',
  },
  hintText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    flexShrink: 1,
  },
  primaryButton: {
    backgroundColor: PURPLE,
    borderRadius: 10,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spinner: {
    marginRight: 8,
  },
  arrowIcon: {
    marginLeft: 6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  linkText: {
    color: '#8b5cf6',
    fontWeight: '500',
  },
});

export default SignupScreen;
