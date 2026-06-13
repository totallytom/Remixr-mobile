import { StyleSheet, Platform } from 'react-native';

// ─── Color Palette ────────────────────────────────────────────────────────────
export const colors = {
  // Core
  background:    '#121212',
  surface:       '#FFFFFF',
  surfaceElevated: '#F8F9FA',
  surfaceHover:  '#E9ECEF',

  // Accents
  primary:       '#8aec9f',   // electric green — active tab, highlights
  primaryAlt:    '#8abaec',   // blue variant
  secondary:     '#c9f7d9',   // neon mint
  secondaryAlt:  '#F5FF00',   // neon yellow

  accent:        '#f97316',   // orange — Upload button
  accentSearch:  '#a3e635',   // lime-400 — Search active
  warm:          '#8aec9f',   // alias for primary

  // Text
  text:          '#000000',
  textPrimary:   '#000000',
  textSecondary: '#6C757D',
  textMuted:     '#ADB5BD',
  textWhite:     '#FFFFFF',
  textInactive:  'rgba(255,255,255,0.6)',

  // Borders
  border:        '#E9ECEF',
  borderHover:   '#DEE2E6',
  borderFocus:   '#8aec9f',

  // Dark shades
  dark50:        '#F8F9FA',
  dark100:       '#E9ECEF',
  dark200:       '#DEE2E6',
  dark500:       '#6C757D',
  dark900:       '#000000',

  // TrackCard
  trackcardSurface:      '#FFFFFF',
  trackcardSurfaceLight: '#F8F9FA',
  trackcardBorder:       '#E9ECEF',
  trackcardGlow:         '#8aec9f',

  // Sidebar
  sidebarSurface:      '#FFFFFF',
  sidebarSurfaceLight: '#F8F9FA',
  sidebarBorder:       '#8aec9f',
  sidebarGlow:         '#8aec9f',

  // Semantic aliases kept for back-compat
  bg:        '#121212',
};

// ─── Typography ───────────────────────────────────────────────────────────────
export const typography = {
  fontFamily: {
    sans:  'Inter_400Regular',
    bold:  'Inter_700Bold',
    black: 'Inter_900Black',
    mono:  Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' }),
    // Load these via expo-font / useFonts before use:
    kotra:  'KOTRA_BOLD-Bold',
    kyobo:  'KyoboHand',
    pixel:  'PressStart2P_400Regular',
  },

  fontSize: {
    xs:   11,  // caption-small
    sm:   12,  // caption
    base: 14,  // body-small
    md:   16,  // body
    lg:   18,  // body-large
    xl:   20,  // h4
    '2xl': 24, // h3
    '3xl': 32, // h2
    '4xl': 40, // h1
  },

  fontWeight: {
    regular: '400' as const,
    medium:  '500' as const,
    semibold:'600' as const,
    bold:    '700' as const,
    extrabold:'800' as const,
  },

  lineHeight: {
    tight:   1.2,
    snug:    1.3,
    normal:  1.4,
    relaxed: 1.5,
    loose:   1.6,
  },

  letterSpacing: {
    tighter: -1,    // -0.025em @ 40px
    tight:   -0.64, // -0.02em  @ 32px
    normal:  0,
    wide:    0.6,   // 0.05em   @ 12px
    wider:   0.66,  // 0.06em   @ 11px
  },
};

// ─── Spacing ──────────────────────────────────────────────────────────────────
export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  base:16,
  lg:  24,
  xl:  32,
  '2xl': 40,
  '3xl': 48,
};

// ─── Shadows (iOS shadow + Android elevation) ─────────────────────────────────
export const shadows = {
  sm: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.10,
      shadowRadius: 4,
    },
    android: { elevation: 2 },
    default: {},
  }),
  md: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
    },
    android: { elevation: 5 },
    default: {},
  }),
  lg: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.20,
      shadowRadius: 20,
    },
    android: { elevation: 10 },
    default: {},
  }),
  glow: Platform.select({
    ios: {
      shadowColor: '#8aec9f',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.6,
      shadowRadius: 12,
    },
    android: { elevation: 8 },
    default: {},
  }),
  glowBlue: Platform.select({
    ios: {
      shadowColor: '#007bff',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 15,
    },
    android: { elevation: 8 },
    default: {},
  }),
};

// ─── Border Radius ────────────────────────────────────────────────────────────
export const radius = {
  none: 0,
  sm:   4,
  md:   8,
  lg:   12,
  xl:   16,
  full: 9999,
};

// ─── Neon text shadow (iOS only — Android ignores textShadow) ─────────────────
export const neonTextShadow = Platform.select({
  ios: {
    textShadowColor: '#8aec9f',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  default: {},
});

// ─── Reusable StyleSheet ──────────────────────────────────────────────────────
export const styles = StyleSheet.create({
  // ── Layout ──
  flex1:        { flex: 1 },
  flexRow:      { flexDirection: 'row' },
  flexCenter:   { alignItems: 'center', justifyContent: 'center' },
  flexBetween:  { alignItems: 'center', justifyContent: 'space-between' },

  pageContent: {
    flex: 1,
    backgroundColor: 'rgba(7,7,7,0.77)',
    borderRadius: radius.lg,
    margin: spacing.base,
    padding: spacing.lg,
    overflow: 'hidden',
  },

  pageContentMobile: {
    flex: 1,
    backgroundColor: 'rgba(7,7,7,0.77)',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: 132, // 56px tab + 64px mini player + 12px gap
  },

  // ── Typography ──
  h1: {
    fontSize: typography.fontSize['4xl'],
    fontWeight: typography.fontWeight.extrabold,
    lineHeight: typography.fontSize['4xl'] * 1.2,
    letterSpacing: typography.letterSpacing.tighter,
    color: colors.textWhite,
  },
  h2: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.fontSize['3xl'] * 1.3,
    letterSpacing: typography.letterSpacing.tight,
    color: colors.textWhite,
  },
  h3: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.fontSize['2xl'] * 1.4,
    color: colors.textWhite,
  },
  h4: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.fontSize.xl * 1.4,
    color: colors.textWhite,
  },

  bodyLarge: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.fontSize.lg * 1.6,
    color: colors.textPrimary,
  },
  body: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.fontSize.md * 1.6,
    color: colors.textPrimary,
  },
  bodySmall: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.fontSize.base * 1.5,
    color: colors.textPrimary,
  },

  caption: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.fontSize.sm * 1.4,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.wide,
  },
  captionSmall: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.fontSize.xs * 1.3,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: typography.letterSpacing.wider,
  },

  neonHighlight: {
    color: colors.textWhite,
    ...Platform.select({
      ios: {
        textShadowColor: colors.primary,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 15,
      },
      default: {},
    }),
  },

  // ── Cards ──
  cardBase: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    ...shadows.md,
  },

  trackcardBase: {
    backgroundColor: colors.trackcardSurface,
    borderWidth: 2,
    borderColor: colors.trackcardBorder,
    borderRadius: radius.md,
    ...shadows.sm,
  },

  glassEffect: {
    backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 2,
    borderColor: colors.warm,
    borderRadius: radius.md,
    ...shadows.md,
  },

  sidebarGlassEffect: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 2,
    borderColor: colors.sidebarBorder,
    borderRadius: radius.md,
    ...shadows.md,
  },

  // ── Chat Bubbles ──
  chatBubble: {
    maxWidth: 280,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderWidth: 2,
    borderRadius: radius.none,
  },
  chatBubbleSent: {
    backgroundColor: colors.primary,
    borderColor: colors.warm,
    marginLeft: 'auto',
    ...shadows.glow,
  },
  chatBubbleReceived: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },

  // ── Buttons ──
  btnPrimary: {
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.warm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.sm,
    alignItems: 'center',
    ...shadows.glow,
  },
  btnPrimaryText: {
    color: '#000',
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.base,
    textTransform: 'uppercase',
  },

  btnSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.secondary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  btnSecondaryText: {
    color: colors.text,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.base,
    textTransform: 'uppercase',
  },

  // ── Inputs ──
  inputTheme: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    color: colors.text,
    fontSize: typography.fontSize.base,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.sm,
  },

  // ── Music Player ──
  musicPlayer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 3,
    borderTopColor: colors.warm,
    padding: spacing.base,
    zIndex: 50,
    ...shadows.lg,
  },

  // ── Sidebar ──
  sidebar: {
    width: '90%',
    backgroundColor: colors.sidebarSurface,
    borderRightWidth: 3,
    borderRightColor: colors.sidebarBorder,
    height: '100%',
    overflow: 'hidden',
    ...shadows.lg,
  },
});

// ─── Animation Configs (use with Animated.timing / Reanimated) ────────────────
export const animationConfig = {
  fadeIn:    { duration: 600 },
  slideUp:   { duration: 400 },
  cardHover: { duration: 400 },
  shimmer:   { duration: 4000, loop: true },
  warmPulse: { duration: 3000, loop: true },
  cozyFloat: { duration: 30000, loop: true },
  spin:      { duration: 1500, loop: true },
  gentleGlow:{ duration: 4000, loop: true },
};
