import i18n from '../i18n';

/** Error shown to users, in the app language. `technical` keeps the raw cause. */
export interface AppError extends Error {
  userFacing: true;
  technical?: string;
  /** 'duplicate' when the cause was a unique-constraint violation. */
  code?: 'duplicate';
}

const DUPLICATE_RE = /duplicate key|unique constraint/i;
const RATE_LIMIT_RE = /rate_limited/i;

const causeMessage = (cause: unknown): string | undefined =>
  cause == null ? undefined : cause instanceof Error ? cause.message : String((cause as any)?.message ?? cause);

/**
 * A user-facing error in the app language. The technical cause (e.g. a
 * Supabase error) is logged for debugging but never shown to the user.
 */
export function appError(key: string, cause?: unknown, options?: Record<string, unknown>): AppError {
  const technical = causeMessage(cause);
  if (technical) console.warn(`[${key}]`, technical);
  // A per-account rate limit (supabase/add_rate_limits.sql) beats the generic message.
  const message = technical && RATE_LIMIT_RE.test(technical) ? i18n.t('errors.rateLimited') : i18n.t(key, options);
  const err = new Error(message) as AppError;
  err.userFacing = true;
  err.technical = technical;
  if (technical && DUPLICATE_RE.test(technical)) err.code = 'duplicate';
  return err;
}

/**
 * For service catch blocks: rethrows errors that are already user-facing,
 * otherwise replaces the raw message with the translated fallback `key`.
 */
export function toAppError(cause: unknown, key: string): Error {
  if ((cause as AppError)?.userFacing) return cause as AppError;
  return appError(key, cause);
}

/** True when an error came from a unique-constraint violation (e.g. already added). */
export function isDuplicateError(e: unknown): boolean {
  return (e as AppError)?.code === 'duplicate' || DUPLICATE_RE.test(causeMessage(e) ?? '');
}

/** True when the server rejected the action for going too fast (rate limit). */
export function isRateLimited(e: unknown): boolean {
  return RATE_LIMIT_RE.test(causeMessage(e) ?? '') || RATE_LIMIT_RE.test((e as AppError)?.technical ?? '');
}
