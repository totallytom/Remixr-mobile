import { storage, STORAGE_KEYS } from '../platform/storage';

export async function setOnboardingPending(userId: string): Promise<void> {
  await storage.set(STORAGE_KEYS.onboardingPending(userId), '1');
}

export async function clearOnboardingPending(userId: string): Promise<void> {
  await storage.remove(STORAGE_KEYS.onboardingPending(userId));
}

export async function isOnboardingPending(userId: string): Promise<boolean> {
  return (await storage.get(STORAGE_KEYS.onboardingPending(userId))) === '1';
}
