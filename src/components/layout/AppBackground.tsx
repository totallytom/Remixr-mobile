import React, { useEffect } from 'react';
import { View, ImageBackground, StyleSheet } from 'react-native';
import { useStore } from '../../store/useStore';
import { getPreset } from '../../config/backgroundPresets';

interface AppBackgroundProps {
  children: React.ReactNode;
}

export default function AppBackground({ children }: AppBackgroundProps) {
  const backgroundPresetId = useStore((s) => s.backgroundPresetId);
  const initBackgroundPreset = useStore((s) => s.initBackgroundPreset);

  useEffect(() => {
    initBackgroundPreset();
  }, []);

  const preset = getPreset(backgroundPresetId);

  if (preset.image) {
    return (
      <ImageBackground
        source={preset.image}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      >
        {/* Dark overlay so existing UI text stays readable */}
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: `rgba(0,0,0,${preset.overlay ?? 0.55})` },
          ]}
        />
        {children}
      </ImageBackground>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: preset.color }]}>
      {children}
    </View>
  );
}
