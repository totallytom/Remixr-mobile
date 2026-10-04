import { Platform, Text } from 'react-native';

/**
 * On iOS the fonts are compiled into the app (expo-font plugin in app.json) and
 * referenced by their PostScript names, so nothing loads at launch. Elsewhere
 * they load at runtime under the file-style names below.
 */
export const EMBEDDED_FONTS = Platform.OS === 'ios';
const pick = (ios: string, other: string) => (EMBEDDED_FONTS ? ios : other);

export const FONTS = {
  body: pick('x12y12pxMaruMinyaHangul', 'MaruMinyaHangul'),
  mono: pick('JetBrainsMono-Regular', 'jetbrains_mono_regular'),
  // Website-matching faces for the neo-brutalist screens (Settings, playlists).
  // Custom fonts have a single weight, so bold text must pick a bold file —
  // `fontWeight` alone is ignored on iOS.
  display: pick('KOTRA_BOLD-Bold', 'KOTRA_BOLD'),      // the website's `font-kotra` headline face
  bold: pick('Inter24pt-Bold', 'inter_bold'),
  semibold: pick('Inter24pt-SemiBold', 'inter_semibold'),
  medium: pick('Inter24pt-Medium', 'inter_medium'),
};

/** Runtime font loading — empty on iOS, where the fonts are built in. */
export const FONT_SOURCES: Record<string, number> = EMBEDDED_FONTS ? {} : {
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
