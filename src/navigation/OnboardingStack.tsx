import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import OnboardingLiveScreen from '../screens/onboarding/OnboardingLiveScreen';
import OnboardingUploadScreen from '../screens/onboarding/OnboardingUploadScreen';

export type OnboardingStackParamList = {
  Onboarding: undefined;
  OnboardingLive: undefined;
  OnboardingUpload: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export default function OnboardingStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Onboarding">
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="OnboardingLive" component={OnboardingLiveScreen} />
      <Stack.Screen name="OnboardingUpload" component={OnboardingUploadScreen} />
    </Stack.Navigator>
  );
}
