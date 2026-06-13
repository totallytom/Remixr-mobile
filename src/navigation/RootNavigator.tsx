import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DarkTheme, getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import { useStore } from '../store/useStore';
import { isOnboardingPending } from '../utils/onboardingPending';
import AuthStack from './AuthStack';
import OnboardingStack from './OnboardingStack';
import MainTabs from './MainTabs';

const AppTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#000000',
    card: '#121212',
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
      };
    }
    return defaultGetStateFromPath(path, options);
  },
};

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
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  let ActiveNavigator: React.ComponentType;
  if (!isAuthenticated) {
    ActiveNavigator = AuthStack;
  } else if (onboardingPending) {
    ActiveNavigator = OnboardingStack;
  } else {
    ActiveNavigator = MainTabs;
  }

  return (
    <NavigationContainer theme={AppTheme} linking={linking}>
      <ActiveNavigator />
    </NavigationContainer>
  );
}
