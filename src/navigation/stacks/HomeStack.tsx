import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../../screens/main/HomeScreen';
import ArtistScreen from '../../screens/main/ArtistScreen';
import AlbumTracksScreen from '../../screens/main/AlbumTracksScreen';

export type HomeStackParamList = {
  Home: undefined;
  Artist: { artistId: string };
  AlbumTracks: { albumId: string };
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Artist" component={ArtistScreen} />
      <Stack.Screen name="AlbumTracks" component={AlbumTracksScreen} />
    </Stack.Navigator>
  );
}
