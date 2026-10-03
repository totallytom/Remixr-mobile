import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text as RNText, type TextProps } from 'react-native';
import { NavigationContainer, DarkTheme, getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';
import { FONTS } from '../utils/fonts';
import { colors } from '../theme'

const Text = ({ style, ...props }: TextProps) => (
  <RNText style={[{ fontFamily: FONTS.body }, style]} {...props} />
);
import type { LinkingOptions } from '@react-navigation/native';
import { useStore } from '../store/useStore';
import { isOnboardingPending } from '../utils/onboardingPending';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import { navigationRef } from './navigationRef';
import OnboardingStack from './OnboardingStack';
import MainTabs from './MainTabs';

const AppTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
    border: '#1f2937',
  },
};

const linking: LinkingOptions<any> = {
  prefixes: [
    'sypher://',
    'https://www.re-mixed.net',
    'https://info.re-mixed.net',
  ],
  config: {
    screens: {
      // ── Main tabs ──────────────────────────────────────────────────────────
      Main: {
       screens: {
      HomeTab: {
        screens: {
          HomePager: {
            screens: {
              HomeMain: '',       // re-mixed.net/  or  sypher://
              Charts:   'charts',
            },
          },
          Artist:         { path: 'artist/:artistId' },
          AlbumTracks:    { path: 'album/:albumId' },
          PlaylistTracks: { path: 'playlist/:playlistId' },
        },
      },
      DiscoverTab: {
        screens: { Discover: 'discover' },
      },
      FeedTab: {
        screens: { Feed: 'feed' },
      },
      ProfileTab: {
        screens: {
          Profile:    'profile',
          ProfileById: { path: 'user/:userId' },
          Artist:     { path: 'artist/:artistId' },
          MyTickets:  'tickets',   // ticket-checkout returns here: sypher://tickets?checkout=success
        },
      },
       },
      },
      // ── Auth screens ───────────────────────────────────────────────────────
      Login:         'login',
      Signup:        'signup',
      ResetPassword: 'reset-password',
    },
  },

  // /@handle vanity URLs can't be expressed as a plain path pattern because
  // React Navigation path segments can't start with @.  We intercept them here
  // and build the navigation state manually, then fall back to the default
  // parser for everything else.
  getStateFromPath(path, options) {
    const vanityMatch = path.match(/^\/?@([A-Za-z0-9_-]+)/);
    if (vanityMatch) {
      return {
        routes: [
          {
            name: 'Main',
            state: {
              routes: [
                {
                  name: 'ProfileTab',
                  state: {
                    routes: [
                      {
                        name: 'ProfileById',
                        params: { handle: vanityMatch[1] },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      };
    }
    return defaultGetStateFromPath(path, options);
  },
};

const RootStack = createNativeStackNavigator();

export default function RootNavigator() {
  const { isAuthenticated, isAuthInitialized, user } = useStore();
  const [onboardingPending, setOnboardingPending] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    if (!isAuthInitialized) return;
    if (!isAuthenticated || !user?.id) {
      setOnboardingPending(false);
      setOnboardingChecked(true);
      return;
    }
    isOnboardingPending(user.id)
      .then(setOnboardingPending)
      .finally(() => setOnboardingChecked(true));
  }, [isAuthenticated, isAuthInitialized, user?.id]);

  if (!isAuthInitialized || !onboardingChecked) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#000000" />
      </View>
    );
  }

  // Guests browse the main tabs too; Login/Signup open on top of them and are
  // removed once signed in, which drops the guest back where they were.
  const showOnboarding = isAuthenticated && onboardingPending;

  return (
    <NavigationContainer theme={AppTheme} linking={linking} ref={navigationRef}>
      <RootStack.Navigator id="Root" screenOptions={{ headerShown: false }}>
        {showOnboarding ? (
          <RootStack.Screen name="Onboarding" component={OnboardingStack} />
        ) : (
          <>
            <RootStack.Screen name="Main" component={MainTabs} />
            {!isAuthenticated && (
              <RootStack.Group screenOptions={{ presentation: 'modal' }}>
                <RootStack.Screen name="Login" component={LoginScreen} />
                <RootStack.Screen name="Signup" component={SignupScreen} />
                <RootStack.Screen name="ResetPassword" component={ResetPasswordScreen} />
              </RootStack.Group>
            )}
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
