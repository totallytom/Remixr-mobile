import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import StoreScreen from '../../screens/main/StoreScreen';

export type StoreStackParamList = {
  Store: undefined;
};

const Stack = createNativeStackNavigator<StoreStackParamList>();

export default function StoreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Store" component={StoreScreen} />
    </Stack.Navigator>
  );
}
