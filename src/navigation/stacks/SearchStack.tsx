import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SearchScreen from '../../screens/main/SearchScreen';
import ProfileByIdScreen from '../../screens/main/ProfileByIdScreen';

export type SearchStackParamList = {
  Search: undefined;
  ProfileById: { userId?: string; handle?: string };
};

const Stack = createNativeStackNavigator<SearchStackParamList>();

export default function SearchStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="ProfileById" component={ProfileByIdScreen} />
    </Stack.Navigator>
  );
}
