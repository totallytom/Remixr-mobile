import { Text } from 'react-native';

export const FONTS = {
  body: 'MaruMinyaHangul',
  mono: 'jetbrains_mono_regular',
  // Website-matching faces for the neo-brutalist screens (Settings, playlists).
  // Custom fonts have a single weight, so bold text must pick a bold file —
  // `fontWeight` alone is ignored on iOS.
  display: 'KOTRA_BOLD',      // the website's `font-kotra` headline face
  bold: 'inter_bold',
  semibold: 'inter_semibold',
  medium: 'inter_medium',
} as const;

export const FONT_SOURCES: Record<string, number> = {
  [FONTS.body]: require('../../assets/fonts/MaruMinyaHangul.ttf'),
  [FONTS.mono]: require('../../assets/fonts/jetbrains_mono_regular.ttf'),
  [FONTS.display]: require('../../assets/fonts/KOTRA_BOLD-Bold.ttf'),
  [FONTS.bold]: require('../../assets/fonts/inter_bold.ttf'),
  [FONTS.semibold]: require('../../assets/fonts/inter_semibold.ttf'),
  [FONTS.medium]: require('../../assets/fonts/inter_medium.ttf'),
};

let patched = false;

export function applyGlobalTextFont(fontFamily: string) {
  if (patched) return;
  const original = (Text as any).render;
  if (!original) return;
  (Text as any).render = (props: any, ref: any) =>
    original({ ...props, style: [{ fontFamily }, props.style] }, ref);
  patched = true;
}
