import i18n from '../i18n';

/**
 * Genres are stored in English (tracks.genre, users.genres); only how they're
 * displayed is translated. Unknown genres show as stored.
 */
export function genreLabel(genre: string): string {
  return i18n.t(`genres.${genre}`, { defaultValue: genre });
}
