import 'react-native-gesture-handler';
import './global.css';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useStore } from './src/store/useStore';
import RootNavigator from './src/navigation/RootNavigator';
import MusicPlayer from './src/components/player/MusicPlayer';

function AppContent() {
  const initializeAuth = useStore((s) => s.initializeAuth);
  const initializeAudio = useStore((s) => s.initializeAudio);
  const player = useStore((s) => s.player);
  const pauseTrack = useStore((s) => s.pauseTrack);
  const resumeTrack = useStore((s) => s.resumeTrack);
  const skipToNext = useStore((s) => s.skipToNext);
  const skipToPrevious = useStore((s) => s.skipToPrevious);
  const seekTo = useStore((s) => s.seekTo);
  const togglePlayerVisibility = useStore((s) => s.togglePlayerVisibility);

  useEffect(() => {
    initializeAudio();
    const cleanup = initializeAuth();
    return () => { cleanup?.(); };
  }, []);

  const handlePlayPause = () => {
    if (player.isPlaying) pauseTrack();
    else resumeTrack();
  };

  return (
    <View style={{ flex: 1 }}>
      <RootNavigator />
      <MusicPlayer
        currentTrack={player.currentTrack}
        isPlaying={player.isPlaying}
        onPlayPause={handlePlayPause}
        onNext={skipToNext}
        onPrevious={skipToPrevious}
        onSeek={seekTo}
        currentTime={player.currentTime}
        duration={player.duration}
        visible={player.visible}
        onToggleVisibility={togglePlayerVisibility}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
