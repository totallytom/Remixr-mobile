import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Linking,
} from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, Eye, EyeOff, ArrowLeft } from 'lucide-react-native';
import { AuthService } from '../../services/authService';
import { supabase } from '../../services/supabase';
import { AuthStackParamList } from '../../navigation/AuthStack';

interface ResetPasswordForm {
  password: string;
  confirmPassword: string;
}

type AuthNav = NativeStackNavigationProp<AuthStackParamList>;

// Parse key=value pairs from a URL hash or query string fragment.
function parseUrlParams(url: string): Record<string, string> {
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const start = hashIndex !== -1 ? hashIndex + 1 : queryIndex !== -1 ? queryIndex + 1 : -1;
  if (start === -1) return {};

  const params: Record<string, string> = {};
  url
    .slice(start)
    .split('&')
    .forEach(pair => {
      const [k, v] = pair.split('=');
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
    });
  return params;
}

function isRecoveryUrl(url: string): boolean {
  return url.includes('type=recovery') || url.includes('access_token=');
}

const ResetPasswordScreen: React.FC = () => {
  const navigation = useNavigation<AuthNav>();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null);

  const { control, handleSubmit, getValues, formState: { errors } } = useForm<ResetPasswordForm>();

  // Attempt to establish a Supabase recovery session from a deep-link URL.
  // Supabase sends: sypher://reset-password#access_token=TOKEN&refresh_token=REFRESH&type=recovery
  async function processRecoveryUrl(url: string) {
    if (!isRecoveryUrl(url)) {
      setHasRecoverySession(false);
      return;
    }

    const params = parseUrlParams(url);
    const accessToken = params['access_token'];
    const refreshToken = params['refresh_token'];

    if (accessToken && refreshToken) {
      try {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        setHasRecoverySession(true);
        return;
      } catch {
        // Fall through to auth state listener as fallback
      }
    }

    // Fallback: let the auth state listener resolve it
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasRecoverySession(!!session);
    });
  }

  useEffect(() => {
    let cancelled = false;

    // 1. Check if app was cold-launched from the reset link
    Linking.getInitialURL().then(url => {
      if (cancelled) return;
      if (url && isRecoveryUrl(url)) {
        processRecoveryUrl(url);
      } else {
        setHasRecoverySession(false);
      }
    });

    // 2. Handle case where app was already open and the link opens it
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (!cancelled && isRecoveryUrl(url)) {
        processRecoveryUrl(url);
      }
    });

    // 3. Auth state listener as a safety net (catches PASSWORD_RECOVERY event
    //    if Supabase processes the token internally before we do)
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (cancelled) return;
        if (event === 'PASSWORD_RECOVERY' || (event === 'INITIAL_SESSION' && session)) {
          setHasRecoverySession(true);
        }
      },
    );

    return () => {
      cancelled = true;
      subscription.remove();
      authSub?.unsubscribe();
    };
  }, []);

  const onSubmit = async (data: ResetPasswordForm) => {
    if (data.password !== data.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await AuthService.setNewPassword(data.password);
      setSuccess(true);
      setTimeout(() => {
        navigation.navigate('Login');
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Reset Password</Text>
              <Text style={styles.subtitle}>
                {hasRecoverySession === null
                  ? 'Checking your reset link…'
                  : hasRecoverySession
                  ? 'Enter your new password below'
                  : 'Use the link from your email to set a new password.'}
              </Text>
            </View>

            {/* No valid recovery link */}
            {hasRecoverySession === false && (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  This screen is only valid when opened from the "Reset your password" email. The
                  link may have expired or already been used.
                </Text>
                <TouchableOpacity
                  style={styles.backLink}
                  onPress={() => navigation.navigate('Login')}
                >
                  <ArrowLeft size={16} color={PURPLE_LIGHT} />
                  <Text style={styles.backLinkText}>Back to login to request a new link</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Error */}
            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Success */}
            {success && (
              <View style={styles.successBox}>
                <Text style={styles.successText}>
                  Password reset successful! Redirecting to login…
                </Text>
              </View>
            )}

            {/* Form — shown while checking or when recovery session is confirmed */}
            {(hasRecoverySession === null || hasRecoverySession === true) && (
              <View style={styles.form}>
                {/* New Password */}
                <View style={styles.field}>
                  <Text style={styles.label}>New Password</Text>
                  <View style={styles.inputRow}>
                    <Lock size={20} color={MUTED} style={styles.inputIcon} />
                    <Controller
                      control={control}
                      name="password"
                      rules={{
                        required: 'Password is required',
                        minLength: {
                          value: 6,
                          message: 'Password must be at least 6 characters',
                        },
                      }}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                          style={[styles.input, styles.inputWithAction]}
                          placeholder="Enter new password"
                          placeholderTextColor={MUTED}
                          secureTextEntry={!showPassword}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          value={value}
                        />
                      )}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(v => !v)}
                      style={styles.eyeButton}
                    >
                      {showPassword ? (
                        <EyeOff size={20} color={MUTED} />
                      ) : (
                        <Eye size={20} color={MUTED} />
                      )}
                    </TouchableOpacity>
                  </View>
                  {errors.password && (
                    <Text style={styles.fieldError}>{errors.password.message}</Text>
                  )}
                </View>

                {/* Confirm Password */}
                <View style={styles.field}>
                  <Text style={styles.label}>Confirm New Password</Text>
                  <View style={styles.inputRow}>
                    <Lock size={20} color={MUTED} style={styles.inputIcon} />
                    <Controller
                      control={control}
                      name="confirmPassword"
                      rules={{
                        required: 'Please confirm your password',
                        validate: value =>
                          value === getValues('password') || 'Passwords do not match',
                      }}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                          style={[styles.input, styles.inputWithAction]}
                          placeholder="Confirm new password"
                          placeholderTextColor={MUTED}
                          secureTextEntry={!showConfirmPassword}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          value={value}
                        />
                      )}
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPassword(v => !v)}
                      style={styles.eyeButton}
                    >
                      {showConfirmPassword ? (
                        <EyeOff size={20} color={MUTED} />
                      ) : (
                        <Eye size={20} color={MUTED} />
                      )}
                    </TouchableOpacity>
                  </View>
                  {errors.confirmPassword && (
                    <Text style={styles.fieldError}>{errors.confirmPassword.message}</Text>
                  )}
                </View>

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (isLoading || hasRecoverySession !== true) && styles.buttonDisabled,
                  ]}
                  onPress={handleSubmit(onSubmit)}
                  disabled={isLoading || hasRecoverySession !== true}
                  activeOpacity={0.85}
                >
                  {hasRecoverySession === null ? (
                    <View style={styles.buttonInner}>
                      <ActivityIndicator size="small" color="#fff" style={styles.spinner} />
                      <Text style={styles.primaryButtonText}>Checking link…</Text>
                    </View>
                  ) : isLoading ? (
                    <View style={styles.buttonInner}>
                      <ActivityIndicator size="small" color="#fff" style={styles.spinner} />
                      <Text style={styles.primaryButtonText}>Resetting Password…</Text>
                    </View>
                  ) : (
                    <Text style={styles.primaryButtonText}>Reset Password</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backLink}
                  onPress={() => navigation.navigate('Login')}
                >
                  <ArrowLeft size={16} color={MUTED} />
                  <Text style={styles.mutedLinkText}>Back to login</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const PURPLE = '#7c3aed';
const PURPLE_LIGHT = '#8b5cf6';
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
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 20,
  },
  header: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },
  infoBox: {
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    gap: 12,
    alignItems: 'center',
  },
  infoText: {
    color: MUTED,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  errorBox: {
    padding: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 8,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
  },
  successBox: {
    padding: 12,
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
    borderRadius: 8,
  },
  successText: {
    color: '#4ade80',
    fontSize: 13,
  },
  form: {
    gap: 16,
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
  primaryButton: {
    backgroundColor: PURPLE,
    borderRadius: 10,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
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
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  backLinkText: {
    color: PURPLE_LIGHT,
    fontSize: 13,
  },
  mutedLinkText: {
    color: MUTED,
    fontSize: 13,
  },
});

export default ResetPasswordScreen;
