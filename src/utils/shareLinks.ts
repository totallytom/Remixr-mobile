/**
 * Public links for sharing. These are website URLs so the person receiving
 * them gets a link preview (logo + title, from the site's og: tags) and can
 * open them with or without the app.
 */
export const SITE_URL = 'https://www.re-mixed.net';

/** A user's public profile page: their vanity handle if set, else username/id. */
export function profileShareUrl(user: { id: string; username?: string | null; vanityUrl?: string | null }): string {
  const vanity = user.vanityUrl?.trim();
  if (vanity) return `${SITE_URL}/@${vanity}`;
  return `${SITE_URL}/profile/${encodeURIComponent(user.username?.trim() || user.id)}`;
}
