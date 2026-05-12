import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PlaylistsScreen from '../../screens/main/PlaylistsScreen';
import PlaylistTracksScreen from '../../screens/main/PlaylistTracksScreen';

export type PlaylistsStackParamList = {
  Playlists: undefined;
  PlaylistTracks: { playlistId: string };
};

const Stack = createNativeStackNavigator<PlaylistsStackParamList>();

export default function PlaylistsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Playlists" component={PlaylistsScreen} />
      <Stack.Screen name="PlaylistTracks" component={PlaylistTracksScreen} />
    </Stack.Navigator>
  );
}
