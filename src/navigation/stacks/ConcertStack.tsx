import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ConcertScreen from '../../screens/main/ConcertScreen';

export type ConcertStackParamList = {
  Concert: undefined;
};

const Stack = createNativeStackNavigator<ConcertStackParamList>();

export default function ConcertStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Concert" component={ConcertScreen} />
    </Stack.Navigator>
  );
}
