/**
 * Shared "neo-brutalist" building blocks: 2px black borders, hard offset shadows,
 * flat bright fills. Mirrors the website's src/components/ui/brutal.tsx so the
 * app and site look the same (used by Settings and the playlist page).
 */
import React from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { FONTS } from '../../utils/fonts';

/** Tailwind values the website uses. */
export const B = {
  cream: '#faf6ec',
  black: '#000000',
  white: '#ffffff',
  teal: '#5eead4',       // teal-300
  tealSoft: '#f0fdfa',   // teal-50
  tealTint: '#ccfbf1',   // teal-100
  tealDark: '#0d9488',   // teal-600
  tealText: '#115e59',   // teal-800
  yellow: '#fde047',     // yellow-300
  yellowSoft: '#fef08a', // yellow-200
  green: '#86efac',      // green-300
  red: '#fca5a5',        // red-300
  redStrong: '#f87171',  // red-400
  redSoft: '#fef2f2',    // red-50
  redText: '#b91c1c',    // red-700
  muted: 'rgba(0,0,0,0.6)',
  faint: 'rgba(0,0,0,0.4)',
  label: 'rgba(0,0,0,0.7)',
  hairline: 'rgba(0,0,0,0.1)',
};

/**
 * Hard offset shadow (the website's `4px 4px 0 0 #000`). Drawn as a block behind
 * the content so it looks identical on iOS and Android (elevation can't do offset
 * shadows). `pressed` collapses it, like the website's buttons.
 */
export const Raised: React.FC<{
  offset?: number;
  radius?: number;
  pressed?: boolean;
  shadowColor?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}> = ({ offset = 4, radius = 16, pressed, shadowColor = B.black, style, children }) => (
  <View style={{ marginRight: offset, marginBottom: offset }}>
    {!pressed && (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: offset, left: offset, right: -offset, bottom: -offset,
          borderRadius: radius, backgroundColor: shadowColor,
        }}
      />
    )}
    <View
      style={[
        { borderRadius: radius },
        pressed && { transform: [{ translateX: offset }, { translateY: offset }] },
        style,
      ]}
    >
      {children}
    </View>
  </View>
);

export type BrutalTone = 'black' | 'white' | 'teal' | 'danger';

const TONE_BG: Record<BrutalTone, string> = {
  black: B.black,
  white: B.white,
  teal: B.teal,
  danger: B.redStrong,
};

/** Button that "presses in" (shadow collapses) when tapped. */
export const BrutalButton: React.FC<{
  label: string;
  onPress: () => void;
  tone?: BrutalTone;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  full?: boolean;
  accessibilityLabel?: string;
}> = ({ label, onPress, tone = 'black', size = 'md', icon, loading, loadingLabel, disabled, full, accessibilityLabel }) => {
  const offset = size === 'sm' ? 2 : 4;
  const fg = tone === 'black' ? B.white : B.black;
  const inactive = !!(disabled || loading);
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      style={{ alignSelf: full ? 'stretch' : 'flex-start' }}
    >
      {({ pressed }) => (
        <Raised
          offset={offset}
          radius={size === 'sm' ? 8 : 12}
          pressed={pressed && !inactive}
          style={[ks.btn, size === 'sm' && ks.btnSm, { backgroundColor: TONE_BG[tone], opacity: inactive ? 0.6 : 1 }]}
        >
          {loading ? <ActivityIndicator size="small" color={fg} /> : icon}
          <Text style={[ks.btnText, size === 'sm' && ks.btnTextSm, { color: fg }]}>
            {loading ? (loadingLabel ?? 'Loading…') : label}
          </Text>
        </Raised>
      )}
    </Pressable>
  );
};

/** Small tilted label, e.g. "Active". */
export const Sticker: React.FC<{ label: string; rotate?: number; color?: string; icon?: React.ReactNode }> = ({
  label, rotate = -3, color = B.yellow, icon,
}) => (
  <View style={{ transform: [{ rotate: `${rotate}deg` }] }}>
    <Raised offset={2} radius={6} style={[ks.sticker, { backgroundColor: color }]}>
      {icon}
      <Text style={ks.stickerText}>{label}</Text>
    </Raised>
  </View>
);

/** On/off switch: black knob, teal when on. */
export const BrutalToggle: React.FC<{
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}> = ({ value, onChange, disabled, label }) => (
  <Pressable
    onPress={() => onChange(!value)}
    disabled={disabled}
    hitSlop={8}
    accessibilityRole="switch"
    accessibilityLabel={label}
    accessibilityState={{ checked: value, disabled }}
    style={{ opacity: disabled ? 0.5 : 1 }}
  >
    <View style={[ks.toggle, value && { backgroundColor: B.teal }]}>
      <View style={[ks.toggleKnob, value && { transform: [{ translateX: 20 }] }]} />
    </View>
  </Pressable>
);

/** Row of pill buttons where one is selected (selected = black, pressed in). */
export function ChoiceChips<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string; dot?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={ks.chips} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
          >
            <Raised offset={2} radius={12} pressed={active} style={[ks.chip, active && { backgroundColor: B.black }]}>
              {o.dot ? <View style={[ks.chipDot, { backgroundColor: o.dot }]} /> : null}
              <Text style={[ks.chipText, active && { color: B.white }]}>{o.label}</Text>
            </Raised>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Text input look (the website's `brutalInput`). */
export const brutalInput: ViewStyle & { color: string; fontSize: number } = {
  backgroundColor: B.white,
  borderWidth: 2,
  borderColor: B.black,
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
  color: B.black,
  fontSize: 15,
};

const ks = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: B.black,
  },
  btnSm: { paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  btnText: { fontSize: 14, fontFamily: FONTS.bold },
  btnTextSm: { fontSize: 12 },

  sticker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 2,
    borderColor: B.black,
  },
  stickerText: { color: B.black, fontSize: 11, fontFamily: FONTS.bold, letterSpacing: 0.5, textTransform: 'uppercase' },

  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: B.black,
    backgroundColor: B.white,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: B.black },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: B.black,
    backgroundColor: B.white,
  },
  chipDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: B.black },
  chipText: { color: B.black, fontSize: 14, fontFamily: FONTS.bold },
});
