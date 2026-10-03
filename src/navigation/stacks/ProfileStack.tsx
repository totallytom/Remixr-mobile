import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProfileScreen from '../../screens/main/ProfileScreen';
import ProfileByIdScreen from '../../screens/main/ProfileByIdScreen';
import ArtistScreen from '../../screens/main/ArtistScreen';
import PlaylistsScreen from '../../screens/main/PlaylistsScreen';
import AdminScreen from '../../screens/admin/AdminScreen';
import AdminReportsScreen from '../../screens/admin/AdminReportsScreen';
import MyTicketsScreen from '../../screens/main/MyTicketsScreen';
import TicketScannerScreen from '../../screens/main/TicketScannerScreen';
import AnalyticsDashboardScreen from '../../screens/main/AnalyticsDashboardScreen';
import { GuestProfileGate } from '../../screens/auth/GuestGateScreen';
import { useStore } from '../../store/useStore';

// Other people's profiles (ProfileById, Artist) stay open to guests.
function OwnProfileScreen() {
  const isAuthenticated = useStore((s: any) => s.isAuthenticated);
  return isAuthenticated ? <ProfileScreen /> : <GuestProfileGate />;
}

export type ProfileStackParamList = {
  Profile: undefined;
  ProfileById: { userId: string };
  Artist: { artistId: string };
  Playlists: undefined;
  Admin: undefined;
  AdminReports: undefined;
  // checkout is set when returning from Stripe via sypher://tickets?checkout=…
  MyTickets: { checkout?: 'success' | 'cancel' } | undefined;
  TicketScanner: { concertId: string; concertTitle?: string };
  Analytics: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Profile"      component={OwnProfileScreen} />
      <Stack.Screen name="ProfileById"  component={ProfileByIdScreen} />
      <Stack.Screen name="Artist"       component={ArtistScreen} />
      <Stack.Screen name="Playlists" component={PlaylistsScreen} />
      <Stack.Screen name="Admin"     component={AdminScreen} />
      <Stack.Screen name="AdminReports" component={AdminReportsScreen} />
      <Stack.Screen name="MyTickets" component={MyTicketsScreen} />
      <Stack.Screen name="Analytics" component={AnalyticsDashboardScreen} />
      <Stack.Screen
        name="TicketScanner"
        component={TicketScannerScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}
