import 'react-native-gesture-handler';
import './global.css';
import './src/i18n';
import { cssInterop } from 'nativewind';
import { Image as ExpoImage } from 'expo-image';
import React, { useEffect } from 'react';
import { FONTS, FONT_SOURCES, applyGlobalTextFont } from './src/utils/fonts';
import * as Font from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useStore } from './src/store/useStore';
import RootNavigator from './src/navigation/RootNavigator';
import AppBackground from './src/components/layout/AppBackground';

// Let NativeWind `className` style expo-image like it did RN's Image.
cssInterop(ExpoImage, { className: 'style' });


function AppContent() {
  const initializeAuth = useStore((s) => s.initializeAuth);
  const initializeAudio = useStore((s) => s.initializeAudio);
  const initPlayerPalette = useStore((s) => s.initPlayerPalette);
  const initializeRevenueCat = useStore((s) => s.initializeRevenueCat);

  useEffect(() => {
    initializeAudio();
    initPlayerPalette();
    initializeRevenueCat();
    const cleanup = initializeAuth();
    return () => { cleanup?.(); };
  }, []);

  // The mini player (MusicPlayer) is mounted once in
  // MainTabs.tsx, not here — this used to also mount its own MusicPlayer
  // instance, which meant two independent mini-player bars rendering
  // simultaneously off the same store state once MainTabs.tsx started
  // mounting one too (see Phase 3). RootNavigator only shows MainTabs once
  // authenticated anyway, so the player has no business rendering over
  // Auth/Onboarding screens.
  return (
    <AppBackground>
      <RootNavigator />
    </AppBackground>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = Font.useFonts(FONT_SOURCES);

  if (fontError) console.error('[fonts] Failed to load:', fontError);
  if (!fontsLoaded) return null;

  applyGlobalTextFont(FONTS.body);

  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
