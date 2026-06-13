import 'react-native-gesture-handler';
import './global.css';
import React, { useEffect } from 'react';
import { View, TouchableOpacity, Text, Image } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Play, Pause, Music2 } from 'lucide-react-native';
import { useStore } from './src/store/useStore';
import { hap } from './src/utils/haptics';
import RootNavigator from './src/navigation/RootNavigator';
import MusicPlayer from './src/components/player/MusicPlayer';
import AppBackground from './src/components/layout/AppBackground';


function AppContent() {
  const initializeAuth = useStore((s) => s.initializeAuth);
  const initializeAudio = useStore((s) => s.initializeAudio);
  const initPlayerPalette = useStore((s) => s.initPlayerPalette);
  const player = useStore((s) => s.player);
  const pauseTrack = useStore((s) => s.pauseTrack);
  const resumeTrack = useStore((s) => s.resumeTrack);
  const skipToNext = useStore((s) => s.skipToNext);
  const skipToPrevious = useStore((s) => s.skipToPrevious);
  const seekTo = useStore((s) => s.seekTo);
  const togglePlayerVisibility = useStore((s) => s.togglePlayerVisibility);
  const insets = useSafeAreaInsets();


  useEffect(() => {
    initializeAudio();
    initPlayerPalette();
    const cleanup = initializeAuth();
    return () => { cleanup?.(); };
  }, []);

  const handlePlayPause = () => {
    if (player.isPlaying) pauseTrack();
    else resumeTrack();
  };

  const bottomOffset = 40 + 16 + insets.bottom;

  return (
    <AppBackground>
      <View style={{ flex: 1 }}>
      <RootNavigator />

      {/* Mini player */}
      <View style={{ position: 'absolute', bottom: bottomOffset, left: 0, right: 0 }}>
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

      {/* Restore pill — shown when a track is loaded but the player is hidden */}
      {player.currentTrack && !player.visible && (
        <TouchableOpacity
          onPress={() => { hap.tap(); togglePlayerVisibility(); }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${player.currentTrack?.title ?? 'Track'} by ${player.currentTrack?.artist ?? 'Artist'}, ${player.isPlaying ? 'now playing' : 'paused'}`}
          accessibilityHint="Shows the music player"
          style={{
            position: 'absolute',
            bottom: bottomOffset,
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingVertical: 8,
            paddingLeft: 8,
            paddingRight: 14,
            backgroundColor: '#1f2937',
            borderRadius: 999,
            borderWidth: 1,
            borderColor: '#374151',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          {player.currentTrack.cover ? (
            <Image
              source={{ uri: player.currentTrack.cover }}
              style={{ width: 32, height: 32, borderRadius: 16 }}
            />
          ) : (
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' }}>
              <Music2 size={16} color="#9ca3af" />
            </View>
          )}
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', maxWidth: 160 }} numberOfLines={1}>
            {player.currentTrack.title}
          </Text>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#0ea5e9', alignItems: 'center', justifyContent: 'center' }}>
            {player.isPlaying
              ? <Pause size={14} color="#fff" />
              : <Play size={14} color="#fff" />}
          </View>
        </TouchableOpacity>
      )}
    </View>
    </AppBackground>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
