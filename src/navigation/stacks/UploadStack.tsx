import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import UploadScreen from '../../screens/main/UploadScreen';

export type UploadStackParamList = {
  Upload: undefined;
};

const Stack = createNativeStackNavigator<UploadStackParamList>();

export default function UploadStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Upload" component={UploadScreen} />
    </Stack.Navigator>
  );
}
