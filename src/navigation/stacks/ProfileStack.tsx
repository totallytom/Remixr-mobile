import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProfileScreen from '../../screens/main/ProfileScreen';
import ProfileByIdScreen from '../../screens/main/ProfileByIdScreen';
import ArtistScreen from '../../screens/main/ArtistScreen';
import UpgradeScreen from '../../screens/main/UpgradeScreen';
import PlaylistsScreen from '../../screens/main/PlaylistsScreen';

export type ProfileStackParamList = {
  Profile: undefined;
  ProfileById: { userId: string };
  Artist: { artistId: string };
  Upgrade: {
    success?: boolean;
    cancelled?: boolean;
    sessionId?: string;
  };
  Playlists: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Profile"      component={ProfileScreen} />
      <Stack.Screen name="ProfileById"  component={ProfileByIdScreen} />
      <Stack.Screen name="Artist"       component={ArtistScreen} />
      <Stack.Screen
        name="Upgrade"
        component={UpgradeScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="Playlists" component={PlaylistsScreen} />
    </Stack.Navigator>
  );
}
