/**
 * "Reduce motion": stops decorative looping animations (the Home TV's bouncing
 * logo, LED ticker, cassette reels, equalizer bars, now-playing bars) for
 * people sensitive to movement.
 *
 * Until the user flips the switch in Settings → Appearance, this follows the
 * device's own setting (iOS Settings → Accessibility → Motion → Reduce Motion).
 * Once they choose, their choice is saved on this device and wins.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { storage, STORAGE_KEYS } from '../platform/storage';

let systemReduceMotion = false;
/** null = follow the system setting. */
let userChoice: boolean | null = null;
let initialized = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const effective = () => userChoice ?? systemReduceMotion;

function init() {
  if (initialized) return;
  initialized = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then((v) => { systemReduceMotion = v; emit(); })
    .catch(() => {});
  AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { systemReduceMotion = v; emit(); });
  storage.get(STORAGE_KEYS.REDUCE_MOTION)
    .then((saved) => {
      if (saved === 'on' || saved === 'off') { userChoice = saved === 'on'; emit(); }
    })
    .catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Saves the user's choice on this device. */
export function setReduceMotion(value: boolean) {
  userChoice = value;
  storage.set(STORAGE_KEYS.REDUCE_MOTION, value ? 'on' : 'off').catch(() => {});
  emit();
}

/** True when decorative animations should be still. */
export function useReduceMotion(): boolean {
  useEffect(init, []);
  return useSyncExternalStore(subscribe, effective, effective);
}
