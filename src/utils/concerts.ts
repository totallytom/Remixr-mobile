import { Alert, Linking } from 'react-native';
import i18n from '../i18n';

const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date in the device's timezone, as YYYY-MM-DD. */
export function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Parses a typed concert date into YYYY-MM-DD, or null if it isn't a real
 * calendar date. Accepts `-`, `/` or `.` separators and unpadded parts
 * ("2026/3/7" → "2026-03-07"), but always year first so 03/07 can't be
 * read as either March 7 or July 3.
 */
export function parseConcertDateInput(input: string): string | null {
  const m = input.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  // Rejects overflow like 2026-02-31, which Date would roll into March.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/**
 * Normalizes a ticket link: adds https:// when no scheme was typed
 * ("eventbrite.com/e/123") and returns null for anything that isn't a
 * plausible http(s) URL, so "Get Tickets" never silently does nothing.
 */
export function normalizeTicketUrl(input: string | undefined | null): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`;
  const m = withScheme.match(/^https?:\/\/([^\s/?#]+)([/?#]\S*)?$/i);
  if (!m) return null;
  const host = m[1].replace(/^[^@]*@/, '').replace(/:\d+$/, '');
  // Needs a dotted host with a real-looking TLD (rules out "https://tickets").
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(host)) return null;
  return withScheme;
}

/** Opens a concert's ticket link, telling the user when it can't be opened. */
export async function openTicketUrl(url: string | undefined | null): Promise<void> {
  const normalized = normalizeTicketUrl(url);
  if (!normalized) {
    Alert.alert('Link unavailable', "This concert's ticket link isn't valid.");
    return;
  }
  try {
    await Linking.openURL(normalized);
  } catch {
    Alert.alert('Link unavailable', "Couldn't open the ticket link.");
  }
}

/** Indicative price shown on listings: "From $20" / "From $12.50". */
export function formatTicketPrice(price: number | null | undefined): string | null {
  if (price == null || !(price > 0)) return null;
  return i18n.t('concerts.from', { price: `$${Number.isInteger(price) ? price : price.toFixed(2)}` });
}

/** Shown under every external "Get Tickets" button. */
export const thirdPartyTicketsNote = () => i18n.t('concerts.thirdParty');
