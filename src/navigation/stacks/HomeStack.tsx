import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomePager from '../HomePager';
import ArtistScreen from '../../screens/main/ArtistScreen';
import AlbumTracksScreen from '../../screens/main/AlbumTracksScreen';
import PlaylistTracksScreen from '../../screens/main/PlaylistTracksScreen';

export type HomeStackParamList = {
  HomePager: undefined;
  Artist: { artistId: string };
  AlbumTracks: { albumId: string };
  PlaylistTracks: { playlistId: string };
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomePager" component={HomePager} />
      <Stack.Screen name="Artist" component={ArtistScreen} />
      <Stack.Screen name="AlbumTracks" component={AlbumTracksScreen} />
      <Stack.Screen name="PlaylistTracks" component={PlaylistTracksScreen} />
    </Stack.Navigator>
  );
}
