import i18n from '../i18n';

/**
 * Turns the English error text Supabase Auth (and AuthService) throws into a
 * message in the user's language. Unknown messages pass through unchanged.
 */
const PATTERNS: [RegExp, string][] = [
  [/invalid login credentials/i, 'auth.errors.invalidCredentials'],
  [/email not confirmed/i, 'auth.errors.emailNotConfirmed'],
  [/already (been )?registered|already exists/i, 'auth.errors.alreadyRegistered'],
  [/rate limit|for security purposes|too many requests/i, 'auth.errors.rateLimited'],
  [/password should be|weak password/i, 'auth.errors.weakPassword'],
  [/network request failed|failed to fetch|network error/i, 'auth.errors.network'],
  [/confirmation link|row-level security policy/i, 'auth.errors.checkEmailConfirm'],
  [/connection timed out/i, 'auth.login.timeout'],
];

export function localizeAuthError(err: unknown, fallbackKey: string): string {
  const message = err instanceof Error ? err.message : '';
  if (!message) return i18n.t(fallbackKey);
  const hit = PATTERNS.find(([re]) => re.test(message));
  return hit ? i18n.t(hit[1]) : message;
}
