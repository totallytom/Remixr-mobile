import React, { useState, useRef, useEffect } from 'react';
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
import { Mail, Lock, Eye, EyeOff, User, Mic, Headphones, Music } from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { AuthService } from '../../services/authService';
import { AuthStackParamList } from '../../navigation/AuthStack';

interface LoginForm {
  email: string;
  password: string;
}

interface RegisterForm {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: 'musician' | 'consumer';
  artistName?: string;
  bio?: string;
}

type AuthNav = NativeStackNavigationProp<AuthStackParamList>;

// Module-level hint survives the short window between register() resolving
// and the auth state propagating to RootNavigator.
let pendingSignupRole: string | null = null;
let pendingOnboarding = false;

export function getSignupHints() {
  return { role: pendingSignupRole, onboarding: pendingOnboarding };
}

export function clearSignupHints() {
  pendingSignupRole = null;
  pendingOnboarding = false;
}

const LoginScreen: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [error, setError] = useState<string>('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const { login, register } = useStore();
  const navigation = useNavigation<AuthNav>();

  const logoScale = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(0)).current;
  const containerTranslateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        delay: 200,
        useNativeDriver: true,
        stiffness: 200,
      }),
      Animated.timing(containerOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(containerTranslateY, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const loginForm = useForm<LoginForm>();
  const registerForm = useForm<RegisterForm>({ defaultValues: { role: 'consumer' } });
  const forgotPasswordForm = useForm<{ email: string }>();

  const onLoginSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setError('');
    try {
      const loginPromise = login(data.email, data.password);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Connection timed out. Check your internet and try again.')),
          25000,
        ),
      );
      await Promise.race([loginPromise, timeoutPromise]);
      clearSignupHints();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const onRegisterSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    setError('');
    try {
      pendingSignupRole = data.role;
      if (data.role === 'musician') pendingOnboarding = true;

      const user = await register({
        username: data.username,
        email: data.email,
        password: data.password,
        role: data.role,
        artistName: data.artistName,
        bio: data.bio,
      });

      if (user?.id && user?.email) {
        const apiBase = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
        await fetch(`${apiBase}/api/create-stripe-customer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, email: user.email }),
        });
      }
    } catch (err) {
      clearSignupHints();
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const onForgotPasswordSubmit = async (data: { email: string }) => {
    setIsLoading(true);
    setError('');
    try {
      await AuthService.resetPassword(data.email);
      setResetEmailSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
    } finally {
      setIsLoading(false);
    }
  };

  const switchTab = (tab: 'login' | 'register') => {
    setActiveTab(tab);
    setError('');
    setShowForgotPassword(false);
    setResetEmailSent(false);
    loginForm.reset();
    registerForm.reset({ role: 'consumer' });
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
          <Animated.View
            style={[
              styles.card,
              { opacity: containerOpacity, transform: [{ translateY: containerTranslateY }] },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <Animated.View style={[styles.logoWrapper, { transform: [{ scale: logoScale }] }]}>
                <Image
                  source={require('../../../assets/logo.png')}
                  style={styles.logo}
                  resizeMode="cover"
                />
              </Animated.View>
              <Text style={styles.appTitle}>Remixr</Text>
              <Text style={styles.appSubtitle}>Connect with musicians and enthusiasts worldwide</Text>
            </View>

            {/* Error */}
            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Login Form */}
            {activeTab === 'login' && !showForgotPassword && (
              <View style={styles.form}>
                {/* Email */}
                <View style={styles.field}>
                  <Text style={styles.label}>Email Address</Text>
                  <View style={styles.inputRow}>
                    <Mail size={20} color="#6b6b8a" style={styles.inputIcon} />
                    <Controller
                      control={loginForm.control}
                      name="email"
                      rules={{
                        required: 'Email is required',
                        pattern: {
                          value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                          message: 'Invalid email address',
                        },
                      }}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                          style={styles.input}
                          placeholder="Enter your email"
                          placeholderTextColor="#6b6b8a"
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
                  {loginForm.formState.errors.email && (
                    <Text style={styles.fieldError}>{loginForm.formState.errors.email.message}</Text>
                  )}
                </View>

                {/* Password */}
                <View style={styles.field}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.inputRow}>
                    <Lock size={20} color="#6b6b8a" style={styles.inputIcon} />
                    <Controller
                      control={loginForm.control}
                      name="password"
                      rules={{
                        required: 'Password is required',
                        minLength: { value: 6, message: 'Password must be at least 6 characters' },
                      }}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                          style={[styles.input, styles.inputWithAction]}
                          placeholder="Enter your password"
                          placeholderTextColor="#6b6b8a"
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
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff size={20} color="#6b6b8a" />
                      ) : (
                        <Eye size={20} color="#6b6b8a" />
                      )}
                    </TouchableOpacity>
                  </View>
                  {loginForm.formState.errors.password && (
                    <Text style={styles.fieldError}>
                      {loginForm.formState.errors.password.message}
                    </Text>
                  )}
                  <TouchableOpacity
                    onPress={() => { hap.tap(); setShowForgotPassword(true); }}
                    style={styles.forgotLink}
                    accessibilityRole="button"
                    accessibilityLabel="Forgot your password"
                  >
                    <Text style={styles.linkText}>Forgot your password?</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={loginForm.handleSubmit(onLoginSubmit)}
                  disabled={isLoading}
                  activeOpacity={0.85}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Sign In</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Forgot Password */}
            {activeTab === 'login' && showForgotPassword && (
              <View style={styles.form}>
                {resetEmailSent ? (
                  <View style={styles.centeredSection}>
                    <Text style={styles.sectionTitle}>Check Your Email</Text>
                    <Text style={styles.sectionBody}>
                      We've sent password reset instructions to your email address.
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        hap.tap();
                        setShowForgotPassword(false);
                        setResetEmailSent(false);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Return to login"
                    >
                      <Text style={styles.linkText}>Return to login</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.sectionTitle}>Reset Your Password</Text>
                    <Text style={styles.sectionBody}>
                      Enter your email address and you will receive instructions to reset your
                      password.
                    </Text>

                    <View style={styles.field}>
                      <Text style={styles.label}>Email Address</Text>
                      <View style={styles.inputRow}>
                        <Mail size={20} color="#6b6b8a" style={styles.inputIcon} />
                        <Controller
                          control={forgotPasswordForm.control}
                          name="email"
                          rules={{
                            required: 'Email is required',
                            pattern: {
                              value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                              message: 'Invalid email address',
                            },
                          }}
                          render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                              style={styles.input}
                              placeholder="Enter your email"
                              placeholderTextColor="#6b6b8a"
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
                      {forgotPasswordForm.formState.errors.email && (
                        <Text style={styles.fieldError}>
                          {forgotPasswordForm.formState.errors.email.message}
                        </Text>
                      )}
                    </View>

                    <View style={styles.buttonRow}>
                      <TouchableOpacity
                        style={[styles.primaryButton, styles.flex, isLoading && styles.buttonDisabled]}
                        onPress={forgotPasswordForm.handleSubmit(onForgotPasswordSubmit)}
                        disabled={isLoading}
                        activeOpacity={0.85}
                      >
                        {isLoading ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.primaryButtonText}>Send Reset Instructions</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={() => { hap.tap(); setShowForgotPassword(false); }}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel"
                      >
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Register Form */}
            {activeTab === 'register' && (
              <View style={styles.form}>
                {/* Username */}
                <View style={styles.field}>
                  <Text style={styles.label}>Username</Text>
                  <View style={styles.inputRow}>
                    <User size={20} color="#6b6b8a" style={styles.inputIcon} />
                    <Controller
                      control={registerForm.control}
                      name="username"
                      rules={{
                        required: 'Username is required',
                        minLength: { value: 3, message: 'Username must be at least 3 characters' },
                      }}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                          style={styles.input}
                          placeholder="Choose a username"
                          placeholderTextColor="#6b6b8a"
                          autoCapitalize="none"
                          autoCorrect={false}
                          onChangeText={onChange}
                          onBlur={onBlur}
                          value={value}
                        />
                      )}
                    />
                  </View>
                  {registerForm.formState.errors.username && (
                    <Text style={styles.fieldError}>
                      {registerForm.formState.errors.username.message}
                    </Text>
                  )}
                </View>

                {/* Email */}
                <View style={styles.field}>
                  <Text style={styles.label}>Email Address</Text>
                  <View style={styles.inputRow}>
                    <Mail size={20} color="#6b6b8a" style={styles.inputIcon} />
                    <Controller
                      control={registerForm.control}
                      name="email"
                      rules={{
                        required: 'Email is required',
                        pattern: {
                          value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                          message: 'Invalid email address',
                        },
                      }}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                          style={styles.input}
                          placeholder="Enter your email"
                          placeholderTextColor="#6b6b8a"
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
                  {registerForm.formState.errors.email && (
                    <Text style={styles.fieldError}>
                      {registerForm.formState.errors.email.message}
                    </Text>
                  )}
                </View>

                {/* Password */}
                <View style={styles.field}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.inputRow}>
                    <Lock size={20} color="#6b6b8a" style={styles.inputIcon} />
                    <Controller
                      control={registerForm.control}
                      name="password"
                      rules={{
                        required: 'Password is required',
                        minLength: { value: 6, message: 'Password must be at least 6 characters' },
                      }}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                          style={[styles.input, styles.inputWithAction]}
                          placeholder="Create a password"
                          placeholderTextColor="#6b6b8a"
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
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff size={20} color="#6b6b8a" />
                      ) : (
                        <Eye size={20} color="#6b6b8a" />
                      )}
                    </TouchableOpacity>
                  </View>
                  {registerForm.formState.errors.password && (
                    <Text style={styles.fieldError}>
                      {registerForm.formState.errors.password.message}
                    </Text>
                  )}
                </View>

                {/* Confirm Password */}
                <View style={styles.field}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <View style={styles.inputRow}>
                    <Lock size={20} color="#6b6b8a" style={styles.inputIcon} />
                    <Controller
                      control={registerForm.control}
                      name="confirmPassword"
                      rules={{
                        required: 'Please confirm your password',
                        validate: value =>
                          value === registerForm.getValues('password') || 'Passwords do not match',
                      }}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput
                          style={[styles.input, styles.inputWithAction]}
                          placeholder="Confirm your password"
                          placeholderTextColor="#6b6b8a"
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
                        <EyeOff size={20} color="#6b6b8a" />
                      ) : (
                        <Eye size={20} color="#6b6b8a" />
                      )}
                    </TouchableOpacity>
                  </View>
                  {registerForm.formState.errors.confirmPassword && (
                    <Text style={styles.fieldError}>
                      {registerForm.formState.errors.confirmPassword.message}
                    </Text>
                  )}
                </View>

                {/* Role Picker */}
                <View style={styles.field}>
                  <Text style={styles.label}>I am a...</Text>
                  <Controller
                    control={registerForm.control}
                    name="role"
                    rules={{ required: 'Please select your role' }}
                    render={({ field: { value, onChange } }) => (
                      <View style={styles.roleRow}>
                        <TouchableOpacity
                          style={[styles.roleButton, value === 'consumer' && styles.roleButtonActive]}
                          onPress={() => onChange('consumer')}
                        >
                          <Headphones
                            size={20}
                            color={value === 'consumer' ? '#8b5cf6' : '#6b6b8a'}
                          />
                          <Text
                            style={[
                              styles.roleLabel,
                              value === 'consumer' && styles.roleLabelActive,
                            ]}
                          >
                            Listener
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.roleButton, value === 'musician' && styles.roleButtonActive]}
                          onPress={() => onChange('musician')}
                        >
                          <Mic size={20} color={value === 'musician' ? '#8b5cf6' : '#6b6b8a'} />
                          <Text
                            style={[
                              styles.roleLabel,
                              value === 'musician' && styles.roleLabelActive,
                            ]}
                          >
                            Musician
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  />
                  {registerForm.formState.errors.role && (
                    <Text style={styles.fieldError}>
                      {registerForm.formState.errors.role.message}
                    </Text>
                  )}
                </View>

                {/* Musician-only fields */}
                {registerForm.watch('role') === 'musician' && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.label}>Artist Name</Text>
                      <View style={styles.inputRow}>
                        <Music size={20} color="#6b6b8a" style={styles.inputIcon} />
                        <Controller
                          control={registerForm.control}
                          name="artistName"
                          rules={{
                            required: 'Artist name is required for musicians',
                            minLength: {
                              value: 2,
                              message: 'Artist name must be at least 2 characters',
                            },
                          }}
                          render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                              style={styles.input}
                              placeholder="Your artist/stage name"
                              placeholderTextColor="#6b6b8a"
                              onChangeText={onChange}
                              onBlur={onBlur}
                              value={value}
                            />
                          )}
                        />
                      </View>
                      {registerForm.formState.errors.artistName && (
                        <Text style={styles.fieldError}>
                          {registerForm.formState.errors.artistName.message}
                        </Text>
                      )}
                    </View>

                    <View style={styles.field}>
                      <Text style={styles.label}>Bio</Text>
                      <Controller
                        control={registerForm.control}
                        name="bio"
                        render={({ field: { onChange, onBlur, value } }) => (
                          <TextInput
                            style={styles.textarea}
                            placeholder="Tell us about your music..."
                            placeholderTextColor="#6b6b8a"
                            multiline
                            numberOfLines={3}
                            textAlignVertical="top"
                            onChangeText={onChange}
                            onBlur={onBlur}
                            value={value}
                          />
                        )}
                      />
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
                  onPress={registerForm.handleSubmit(onRegisterSubmit)}
                  disabled={isLoading}
                  activeOpacity={0.85}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Create Account</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Footer */}
            <View style={styles.footer}>
              {activeTab === 'login' ? (
                <Text style={styles.footerText}>
                  Don't have an account?{' '}
                  <Text style={styles.linkText} onPress={() => switchTab('register')}>
                    Sign up
                  </Text>
                </Text>
              ) : (
                <Text style={styles.footerText}>
                  Already have an account?{' '}
                  <Text style={styles.linkText} onPress={() => switchTab('login')}>
                    Sign in
                  </Text>
                </Text>
              )}
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const PURPLE = '#7c3aed';
const PURPLE_LIGHT = '#8b5cf6';
const PINK = '#db2777';
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
    marginBottom: 12,
  },
  logo: {
    width: 64,
    height: 64,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: PURPLE_LIGHT,
    marginBottom: 6,
    textAlign: 'center',
  },
  appSubtitle: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
  },
  errorBox: {
    marginBottom: 14,
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
  forgotLink: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  linkText: {
    color: PURPLE_LIGHT,
    fontSize: 13,
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
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelButton: {
    height: 50,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
  },
  cancelButtonText: {
    color: MUTED,
    fontSize: 14,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  roleButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: BORDER,
    gap: 6,
  },
  roleButtonActive: {
    borderColor: PURPLE,
    backgroundColor: 'rgba(124,58,237,0.1)',
  },
  roleLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: MUTED,
  },
  roleLabelActive: {
    color: PURPLE_LIGHT,
  },
  textarea: {
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
  },
  centeredSection: {
    alignItems: 'center',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  sectionBody: {
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: MUTED,
  },
});

export default LoginScreen;
