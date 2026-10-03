import type { Locale } from 'date-fns';
import { enUS, ja, ko } from 'date-fns/locale';
import i18n from '../i18n';

/** date-fns locale for the current app language ("3 minutes ago" → "3분 전" / "3分前"). */
export function dateLocale(): Locale {
  const lang = i18n.language?.slice(0, 2);
  return lang === 'ko' ? ko : lang === 'ja' ? ja : enUS;
}

/** BCP-47 tag for Intl formatting (toLocaleDateString etc.) in the app language. */
export function appLocale(): string {
  const lang = i18n.language?.slice(0, 2);
  return lang === 'ko' ? 'ko-KR' : lang === 'ja' ? 'ja-JP' : 'en-US';
}

/**
 * Concert dates are stored as midnight UTC of the local show date, so they must
 * be formatted in UTC — in the user's zone they'd show a day early west of UTC.
 */
export function formatConcertDate(date: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleDateString(appLocale(), { ...opts, timeZone: 'UTC' });
}
