import React from 'react';
import { View } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import HomeScreen from '../screens/main/HomeScreen';
import ChartsScreen from '../screens/main/ChartsScreen';
import PlaylistsScreen from '../screens/main/PlaylistsScreen';
import SearchScreen from '../screens/main/SearchScreen';
import { colors } from '../theme';

export type HomePagerParamList = {
  HomeMain: undefined;
  Charts: undefined;
  Playlists: undefined;
  Search: undefined;
};

const Tab = createMaterialTopTabNavigator<HomePagerParamList>();

export default function HomePager() {
  return (
    <Tab.Navigator
      initialRouteName="HomeMain"
      screenOptions={{
        tabBarStyle: { display: 'none' },
        swipeEnabled: true,
        animationEnabled: true,
        // Only Home mounts at launch; the next page preloads so a swipe is still
        // instant. (Default mounts all four pages, and their data, up front.)
        lazy: true,
        lazyPreloadDistance: 1,
        lazyPlaceholder: () => <View style={{ flex: 1, backgroundColor: colors.background }} />,
      }}
    >
      <Tab.Screen name="HomeMain" component={HomeScreen} />
      <Tab.Screen name="Charts" component={ChartsScreen} />
      <Tab.Screen name="Playlists" component={PlaylistsScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
    </Tab.Navigator>
  );
}
