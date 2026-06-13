import React from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import HomeScreen from '../screens/main/HomeScreen';
import ChartsScreen from '../screens/main/ChartsScreen';
import PlaylistsScreen from '../screens/main/PlaylistsScreen';
import SearchScreen from '../screens/main/SearchScreen';

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
      }}
    >
      <Tab.Screen name="HomeMain" component={HomeScreen} />
      <Tab.Screen name="Charts" component={ChartsScreen} />
      <Tab.Screen name="Playlists" component={PlaylistsScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
    </Tab.Navigator>
  );
}
