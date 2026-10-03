import { createNavigationContainerRef } from '@react-navigation/native';

/**
 * Lets code outside a screen (the sign-in prompt, store actions) navigate,
 * e.g. to open Login/Signup on top of whatever the guest is looking at.
 */
export const navigationRef = createNavigationContainerRef<any>();

export function openAuthScreen(screen: 'Login' | 'Signup') {
  if (navigationRef.isReady()) navigationRef.navigate(screen);
}
