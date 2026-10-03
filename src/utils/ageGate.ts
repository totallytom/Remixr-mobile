// Neutral age screen for signup (COPPA).
//
// • Ask for date of birth without hinting at the cutoff.
// • Under MIN_SIGNUP_AGE: block, send nothing to the server, and remember the
//   block on this device so going back and changing the date doesn't work.
// • The database re-checks the date on every new account (enforce_signup_age
//   trigger, sypher/supabase/migrations/*_signup_age_gate.sql), so this is the
//   user-facing half, not the only check.
//
// Keep in sync with sypher/src/utils/ageGate.ts.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const MIN_SIGNUP_AGE = 13;

const BLOCK_KEY = 'rmx_signup_age_block';

export const AGE_BLOCK_MESSAGE =
  "Sorry, we can't create an account for you right now.";

/** Returns a valid calendar date (local time) or null. */
export function parseDateOfBirth(year: number, month: number, day: number): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const date = new Date(year, month - 1, day);
  // Rejects impossible dates like 31 February (JS would roll them over).
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  const today = new Date();
  if (date > today) return null;
  if (year < today.getFullYear() - 120) return null;
  return date;
}

/** Whole years between dob and today. */
export function ageInYears(dob: Date, today: Date = new Date()): number {
  let age = today.getFullYear() - dob.getFullYear();
  const hadBirthday =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}

/** 'YYYY-MM-DD', the format the database expects. */
export function toIsoDate(dob: Date): string {
  const mm = String(dob.getMonth() + 1).padStart(2, '0');
  const dd = String(dob.getDate()).padStart(2, '0');
  return `${dob.getFullYear()}-${mm}-${dd}`;
}

export async function isSignupBlocked(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(BLOCK_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function blockSignup(): Promise<void> {
  try {
    await AsyncStorage.setItem(BLOCK_KEY, '1');
  } catch {
    // Storage unavailable — the in-memory block still applies for this session.
  }
}
