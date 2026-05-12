import { useStore } from '../store/useStore';

/**
 * When the store thinks the user is logged out, wait briefly then run checkAuth
 * (session may still exist). Only redirect to signup if still unauthenticated after 6s.
 */
export function scheduleRecoveryThenSignupRedirect(
  navigate: (to: string) => void,
): () => void {
  let cancelled = false;
  let redirectTimer: ReturnType<typeof setTimeout> | undefined;
  const recoveryTimer = window.setTimeout(() => {
    void (async () => {
      try {
        await useStore.getState().checkAuth();
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      if (useStore.getState().isAuthenticated) return;
      redirectTimer = window.setTimeout(() => {
        if (!cancelled && !useStore.getState().isAuthenticated) {
          navigate('/signup');
        }
      }, 6000);
    })();
  }, 400);
  return () => {
    cancelled = true;
    window.clearTimeout(recoveryTimer);
    if (redirectTimer !== undefined) window.clearTimeout(redirectTimer);
  };
}
