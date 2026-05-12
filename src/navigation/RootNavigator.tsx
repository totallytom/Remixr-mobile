import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useStore } from '../store/useStore';
import { isOnboardingPending } from '../utils/onboardingPending';
import AuthStack from './AuthStack';
import OnboardingStack from './OnboardingStack';
import MainTabs from './MainTabs';

export default function RootNavigator() {
  const { isAuthenticated, isAuthInitialized, user } = useStore();
  const [onboardingPending, setOnboardingPending] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    if (!isAuthInitialized) return;
    if (!isAuthenticated || !user?.id) {
      setOnboardingPending(false);
      setOnboardingChecked(true);
      return;
    }
    isOnboardingPending(user.id)
      .then(setOnboardingPending)
      .finally(() => setOnboardingChecked(true));
  }, [isAuthenticated, isAuthInitialized, user?.id]);

  if (!isAuthInitialized || !onboardingChecked) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  let ActiveNavigator: React.ComponentType;
  if (!isAuthenticated) {
    ActiveNavigator = AuthStack;
  } else if (onboardingPending) {
    ActiveNavigator = OnboardingStack;
  } else {
    ActiveNavigator = MainTabs;
  }

  return (
    <NavigationContainer>
      <ActiveNavigator />
    </NavigationContainer>
  );
}
