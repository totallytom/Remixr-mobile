import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { X } from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { useImageColors, PALETTES } from '../../hooks/useImageColors';
import WaveformSeekBar from './WaveformSeekBar';

// ─── Layout ───────────────────────────────────────────────────────────────────
const { width: SW, height: SH } = Dimensions.get('window');
const LAND_W    = SH;
const LAND_H    = SW;
const LAND_LEFT = (SW - SH) / 2;
const LAND_TOP  = (SH - SW) / 2;

const CASSETTE_W = Math.round(LAND_W * 0.88);
const CASSETTE_H = Math.round(LAND_H * 0.97);
const LABEL_H    = Math.round(CASSETTE_H * 0.42);
const TAPE_H     = Math.round(CASSETTE_H * 0.36);
const CTRL_H     = CASSETTE_H - LABEL_H - TAPE_H;

const REEL_SIZE    = Math.round(TAPE_H * 0.78);
const REEL_Y       = Math.round((TAPE_H - REEL_SIZE) / 2);
const LEFT_REEL_X  = Math.round(CASSETTE_W * 0.20 - REEL_SIZE / 2);
const RIGHT_REEL_X = Math.round(CASSETTE_W * 0.80 - REEL_SIZE / 2);

// Reel centers within the tape window
const REEL_R        = REEL_SIZE / 2;
const LEFT_REEL_CX  = LEFT_REEL_X + REEL_R;
const RIGHT_REEL_CX = RIGHT_REEL_X + REEL_R;
const REEL_CY       = REEL_Y + REEL_R;

// Tape spool radius at each reel (changes with playback progress)
const MIN_TAPE_R = Math.round(REEL_R * 0.26);
const MAX_TAPE_R = Math.round(REEL_R * 0.72);

// Guide capstan and aperture geometry
const GUIDE_R   = 4;
const GUIDE_Y   = TAPE_H - 14;
const APERTURE_H = 8;
const APERTURE_W = Math.round(CASSETTE_W * 0.38);
const APERTURE_X = Math.round((CASSETTE_W - APERTURE_W) / 2);

// Center logo / graffiti
const LOGO_SIZE      = Math.round(TAPE_H * 0.52);
const LOGO_LEFT      = Math.round((CASSETTE_W - LOGO_SIZE) / 2);
const LOGO_TOP       = Math.round((TAPE_H - LOGO_SIZE) / 2);
const GRAFFITI_LEFT  = LOGO_LEFT + LOGO_SIZE + 10;
const GRAFFITI_WIDTH = RIGHT_REEL_X - GRAFFITI_LEFT - 6;

// ─── Reel SVG ─────────────────────────────────────────────────────────────────
function Reel({ size, tapeR }: { size: number; tapeR: number }) {
  const r      = size / 2;
  const hubR   = r * 0.22;
  const spkEnd = r * 0.86;
  const accent = '#c0b090';
  const angles = Array.from({ length: 5 }, (_, i) => (i * 2 * Math.PI) / 5);
  return (
    <Svg width={size} height={size}>
      {/* Outer rim */}
      <Circle cx={r} cy={r} r={r - 1}       fill="#181818" stroke="#404040" strokeWidth={2} />
      {/* Inner rim groove */}
      <Circle cx={r} cy={r} r={r - 7}       fill="none"   stroke="#0d0d0d" strokeWidth={2.5} />
      {/* Wound tape spool */}
      <Circle cx={r} cy={r} r={tapeR}        fill="#4a2f12" />
      <Circle cx={r} cy={r} r={tapeR}        fill="none"   stroke="#6e4422" strokeWidth={1.5} />
      <Circle cx={r} cy={r} r={tapeR * 0.70} fill="none"   stroke="#3a2010" strokeWidth={0.6} />
      <Circle cx={r} cy={r} r={tapeR * 0.42} fill="none"   stroke="#3a2010" strokeWidth={0.6} />
      {/* Spokes */}
      {angles.map((a, i) => (
        <Line
          key={i}
          x1={r + Math.cos(a) * hubR}  y1={r + Math.sin(a) * hubR}
          x2={r + Math.cos(a) * spkEnd} y2={r + Math.sin(a) * spkEnd}
          stroke={accent} strokeWidth={1.8} strokeLinecap="round"
        />
      ))}
      {/* Hub */}
      <Circle cx={r} cy={r} r={hubR}        fill="#0e0e0e" stroke={accent} strokeWidth={1.5} />
      {/* Spindle hole */}
      <Circle cx={r} cy={r} r={hubR * 0.44} fill="#040404" stroke={accent} strokeWidth={0.5} />
      {/* Rim specular */}
      <Circle cx={r * 0.68} cy={r * 0.68}   r={r * 0.05}  fill="rgba(255,255,255,0.07)" />
    </Svg>
  );
}

// ─── Tape path (renders behind reels) ─────────────────────────────────────────
function TapePath({ leftTapeR, rightTapeR }: { leftTapeR: number; rightTapeR: number }) {
  const leftExitY  = REEL_CY + leftTapeR;
  const rightExitY = REEL_CY + rightTapeR;
  return (
    <Svg
      width={CASSETTE_W}
      height={TAPE_H}
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
    >
      {/* Left vertical drop */}
      <Line x1={LEFT_REEL_CX}  y1={leftExitY}        x2={LEFT_REEL_CX}  y2={GUIDE_Y - GUIDE_R}
            stroke="#3d2510" strokeWidth={2.5} />
      {/* Tape across the head */}
      <Line x1={LEFT_REEL_CX}  y1={GUIDE_Y}           x2={RIGHT_REEL_CX} y2={GUIDE_Y}
            stroke="#3d2510" strokeWidth={2.5} />
      {/* Right vertical rise */}
      <Line x1={RIGHT_REEL_CX} y1={GUIDE_Y - GUIDE_R} x2={RIGHT_REEL_CX} y2={rightExitY}
            stroke="#3d2510" strokeWidth={2.5} />
      {/* Tape sheen */}
      <Line x1={LEFT_REEL_CX + 12} y1={GUIDE_Y - 0.5} x2={RIGHT_REEL_CX - 12} y2={GUIDE_Y - 0.5}
            stroke="rgba(140,90,45,0.5)" strokeWidth={0.8} />

      {/* Left capstan */}
      <Circle cx={LEFT_REEL_CX}  cy={GUIDE_Y} r={GUIDE_R}       fill="#1c1c1c" stroke="#484848" strokeWidth={1} />
      <Circle cx={LEFT_REEL_CX}  cy={GUIDE_Y} r={GUIDE_R * 0.4} fill="#2e2e2e" />
      {/* Right capstan */}
      <Circle cx={RIGHT_REEL_CX} cy={GUIDE_Y} r={GUIDE_R}       fill="#1c1c1c" stroke="#484848" strokeWidth={1} />
      <Circle cx={RIGHT_REEL_CX} cy={GUIDE_Y} r={GUIDE_R * 0.4} fill="#2e2e2e" />

      {/* Playback head block */}
      <Rect x={(CASSETTE_W - 20) / 2} y={GUIDE_Y - 5} width={20} height={9} rx={2}
            fill="#181818" stroke="#555" strokeWidth={1} />
      <Rect x={(CASSETTE_W - 10) / 2} y={GUIDE_Y - 2} width={10} height={4} rx={1}
            fill="#222" stroke="#666" strokeWidth={0.5} />
    </Svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

function CtrlBtn({ label, onPress, active = false }: { label: string; onPress: () => void; active?: boolean }) {
  const [pressed, setPressed] = useState(false);
  const down = active || pressed;
  return (
    <TouchableOpacity
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      activeOpacity={1}
      style={[s.btn, down && s.btnDown]}
    >
      <Text style={[s.btnLabel, down && s.btnLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onClose: () => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (t: number) => void;
  currentTime: number;
  duration: number;
}

const CassettePlayer: React.FC<Props> = ({
  visible, onClose, isPlaying, onPlayPause, onNext, onPrevious, onSeek, currentTime, duration,
}) => {
  const { player, setPlayerPalette, playerPaletteIndex } = useStore() as any;
  const track    = player.currentTrack;
  const palette  = useImageColors(track?.cover);
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);
  const [barW, setBarW] = useState(0);
  const [showPalette, setShowPalette] = useState(false);

  const { top: insetTop, bottom: insetBottom } = useSafeAreaInsets();
  const beigePad = Math.round((LAND_W - CASSETTE_W) / 2);
  const safeL    = Math.max(0, insetTop    - beigePad);
  const safeR    = Math.max(0, insetBottom - Math.round((LAND_H - CASSETTE_H) / 2));

  const startSpinLoop = () => {
    if (spinLoop.current) return; // already running — don't restart mid-rotation
    spinAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true })
    );
    spinLoop.current = loop;
    loop.start();
  };

  const stopSpinLoop = () => {
    spinLoop.current?.stop();
    spinLoop.current = null;
  };

  useEffect(() => {
    if (isPlaying && visible) {
      startSpinLoop();
    } else {
      stopSpinLoop();
    }
    return () => stopSpinLoop();
  }, [isPlaying, visible]);

  const spin       = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const progress   = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const title      = track?.title  ?? '— — —';
  const artist     = track?.artist ?? '';

  // Left reel loses tape, right gains tape as song progresses
  const leftTapeR  = Math.round(MIN_TAPE_R + (MAX_TAPE_R - MIN_TAPE_R) * (1 - progress));
  const rightTapeR = Math.round(MIN_TAPE_R + (MAX_TAPE_R - MIN_TAPE_R) * progress);

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar hidden />

      <View style={s.backdrop}>
        <View style={[s.landscape, { left: LAND_LEFT, top: LAND_TOP, width: LAND_W, height: LAND_H }]}>

          <View style={s.cassette}>
            {/* Plastic rim highlight */}
            <View style={s.rimHighlight} />

            {/* ── Label ── */}
            <View style={[s.label, { height: LABEL_H, backgroundColor: palette.dark }]}>
              <View style={[s.labelTop, { paddingLeft: safeL + 16, paddingRight: safeR + 16 }]}>
                <View style={s.sideA}>
                  <Text style={s.sideAText}>SIDE{'\n'}A</Text>
                </View>
                <View style={s.labelCenter}>
                  <Text style={s.titleText} numberOfLines={1}>{title}</Text>
                  <WaveformSeekBar
                    currentTime={currentTime}
                    duration={duration}
                    isPlaying={isPlaying}
                    color={palette.accent}
                    seed={track?.id ?? title}
                    barCount={40}
                    height={16}
                  />
                  <Text style={s.artistText} numberOfLines={1}>{artist}</Text>
                </View>
                <View style={s.noiseBox}>
                  <Text style={s.noiseTitle}>NOISE REDUCTION</Text>
                  <View style={s.noiseRow}>
                    <Text style={s.noiseOpt}>ON</Text>
                    <View style={[s.noiseIndicator, { backgroundColor: palette.accent }]} />
                    <Text style={s.noiseOpt}>OFF</Text>
                  </View>
                </View>
              </View>
              <View style={[s.brandRow, { paddingLeft: safeL + 16, paddingRight: safeR + 16 }]}>
                <Text style={s.brandCursive}>Fine-Brewed Tape</Text>
                <Text style={s.brandSmall}>TestDrive-1</Text>
                <Text style={s.brandCursive}>Remixr</Text>
                <Text style={s.brandSmall}>Low input / High Volume</Text>
                <Text style={s.cModel}>C-130</Text>
              </View>
            </View>

            {/* ── Palette overlay (floats over label area) ── */}
            {showPalette && (
              <View style={[s.paletteOverlay, { height: LABEL_H, paddingLeft: safeL + 16, paddingRight: safeR + 16 }]}>
                <Text style={s.paletteTitle}>PLAYER COLOR</Text>
                <View style={s.paletteGrid}>
                  <TouchableOpacity
                    onPress={() => { setPlayerPalette(null); setShowPalette(false); }}
                    style={[s.paletteSwatch, { backgroundColor: '#2a2a2a', borderWidth: 2, borderColor: playerPaletteIndex === null ? '#fff' : 'transparent' }]}
                    activeOpacity={0.7}
                  >
                    <Text style={s.paletteAutoText}>A</Text>
                  </TouchableOpacity>
                  {PALETTES.map(([accent]: [string, string], i: number) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => { setPlayerPalette(i); setShowPalette(false); }}
                      style={[s.paletteSwatch, { backgroundColor: accent, borderWidth: 2, borderColor: playerPaletteIndex === i ? '#fff' : 'transparent' }]}
                      activeOpacity={0.7}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* ── Tape window ── */}
            <View style={[s.tapeWindow, { height: TAPE_H }]}>
              {/* Progress bar */}
              <TouchableOpacity
                style={s.progressTrack}
                activeOpacity={1}
                onLayout={e => setBarW(e.nativeEvent.layout.width)}
                onPress={e => { if (barW > 0 && duration > 0) onSeek((e.nativeEvent.locationX / barW) * duration); }}
              >
                <View style={[s.progressFill, { flex: progress, backgroundColor: palette.accent }]} />
                <View style={[s.progressEmpty, { flex: Math.max(0, 1 - progress) }]} />
              </TouchableOpacity>

              {/* Time labels */}
              <View style={[s.timeRow, { paddingLeft: safeL + 14, paddingRight: safeR + 14 }]}>
                <Text style={s.timeText}>{fmt(currentTime)}</Text>
                <Text style={s.timeText}>{fmt(duration)}</Text>
              </View>

              {/* Tape path + guide pins + playback head (behind reels) */}
              <TapePath leftTapeR={leftTapeR} rightTapeR={rightTapeR} />

              {/* Reels */}
              <Animated.View style={[s.reel, { left: LEFT_REEL_X,  top: REEL_Y, transform: [{ rotate: spin }] }]}>
                <Reel size={REEL_SIZE} tapeR={leftTapeR} />
              </Animated.View>
              <Animated.View style={[s.reel, { left: RIGHT_REEL_X, top: REEL_Y, transform: [{ rotate: spin }] }]}>
                <Reel size={REEL_SIZE} tapeR={rightTapeR} />
              </Animated.View>

              {/* Tape aperture slot at playing edge */}
              <View style={[s.aperture, { left: APERTURE_X, width: APERTURE_W }]} />

              {/* Center logo */}
              <View style={[s.logoWrap, { left: LOGO_LEFT, top: LOGO_TOP, width: LOGO_SIZE, height: LOGO_SIZE }]}>
                <Image source={require('../../../assets/logo.png')} style={s.logoImg} resizeMode="contain" />
              </View>

              {/* Graffiti */}
              <View style={[s.graffitiWrap, { left: GRAFFITI_LEFT, top: LOGO_TOP + LOGO_SIZE * 0.18, width: GRAFFITI_WIDTH }]}>
                <Text style={s.graffitiText}>Property{'\n'}of YOU</Text>
              </View>
            </View>

            {/* ── Control bar ── */}
            <View style={[s.ctrlBar, { height: CTRL_H, paddingLeft: safeL + 12, paddingRight: safeR + 12 }]}>
              <View style={s.knobWrap}>
                <View style={s.knobOuter}>
                  <View style={s.knobInner} />
                </View>
                <Text style={s.knobLabel}>VOL</Text>
              </View>
              <View style={s.btnRow}>
                <CtrlBtn label="▶  PLAY"  onPress={() => { if (!isPlaying) { startSpinLoop(); onPlayPause(); } }} active={isPlaying} />
                <CtrlBtn label="◀◀  REW"  onPress={onPrevious} />
                <CtrlBtn label="FF  ▶▶"   onPress={onNext} />
                <CtrlBtn label="■  STOP"  onPress={() => { if (isPlaying) { stopSpinLoop(); onPlayPause(); } }} active={!isPlaying && !!track} />
                <CtrlBtn label="CLR"      onPress={() => setShowPalette(v => !v)} active={showPalette} />
                <CtrlBtn label="MENU"     onPress={onClose} />
              </View>
              <TouchableOpacity style={s.closeBtn} onPress={onClose} activeOpacity={0.7}>
                <X size={13} color="#888" />
              </TouchableOpacity>
            </View>
          </View>

        </View>
      </View>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#e8dfd0',
    overflow: 'hidden',
  },
  landscape: {
    position: 'absolute',
    transform: [{ rotate: '-90deg' }],
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cassette: {
    width: CASSETTE_W,
    height: CASSETTE_H,
    backgroundColor: '#1c1816',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 16,
  },
  rimHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.10)',
    zIndex: 20,
  },

  // Label
  label: {
    backgroundColor: '#4b0000',
    paddingTop: 12,
    paddingBottom: 8,
    justifyContent: 'space-between',
    borderBottomWidth: 2,
    borderBottomColor: '#0d0d0d',
  },
  labelTop:    { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  sideA: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  sideAText:   { color: '#000', fontSize: 9, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  labelCenter: { flex: 1 },
  titleText:   { color: '#fff', fontSize: 30, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 0.5 },
  titleLine:   { height: 1, backgroundColor: 'rgba(255,255,255,0.35)', marginVertical: 5 },
  artistText:  { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontFamily: 'monospace' },
  noiseBox: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  noiseTitle:     { color: 'rgba(255,255,255,0.9)', fontSize: 6.5, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  noiseRow:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noiseOpt:       { color: 'rgba(255,255,255,0.65)', fontSize: 7, fontWeight: '600' },
  noiseIndicator: { width: 18, height: 8, backgroundColor: '#f59e0b', borderRadius: 2 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 2,
  },
  brandCursive: { color: '#fff', fontSize: 15, fontStyle: 'italic', fontWeight: '900' },
  brandSmall:   { color: 'rgba(255,255,255,0.6)', fontSize: 7, letterSpacing: 0.3 },
  brandMain:    { color: 'rgba(255,255,255,0.9)', fontSize: 8, fontWeight: '600', letterSpacing: 0.3 },
  cModel:       { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 2 },

  // Palette overlay
  paletteOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.93)',
    zIndex: 10,
    paddingTop: 12,
    paddingBottom: 12,
    justifyContent: 'center',
  },
  paletteTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 8,
    fontWeight: '800',
    fontFamily: 'monospace',
    letterSpacing: 2,
    marginBottom: 10,
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paletteSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paletteAutoText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'monospace',
  },

  // Tape window
  tapeWindow: {
    backgroundColor: '#060606',
    borderTopWidth: 3,
    borderBottomWidth: 3,
    borderColor: '#141414',
    overflow: 'hidden',
  },
  reel: { position: 'absolute' },
  aperture: {
    position: 'absolute',
    bottom: 0,
    height: APERTURE_H,
    backgroundColor: '#0a0805',
    borderTopWidth: 1,
    borderTopColor: '#282828',
  },
  logoWrap: {
    position: 'absolute',
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#080808',
    opacity: 0.85,
  },
  logoImg: { width: '100%', height: '100%' },
  graffitiWrap: {
    position: 'absolute',
    transform: [{ rotate: '-8deg' }],
  },
  graffitiText: {
    fontSize: 15,
    fontWeight: '900',
    fontStyle: 'italic',
    fontFamily: 'monospace',
    color: '#fff290',
    letterSpacing: 0.5,
    lineHeight: 13,
    textShadowColor: '#00000099',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  progressTrack: {
    height: 4,
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
  },
  progressFill:  { height: '100%', backgroundColor: '#c0a870' },
  progressEmpty: { height: '100%' },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  timeText: { color: '#fff', fontSize: 9, fontFamily: 'monospace', fontWeight: '700' },

  // Control bar
  ctrlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#141210',
    borderTopWidth: 1,
    borderTopColor: '#222018',
  },
  knobWrap:  { alignItems: 'center', gap: 3 },
  knobOuter: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3a3530',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#4a4540',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  knobInner: { width: 5, height: 13, backgroundColor: '#888', borderRadius: 3, marginTop: -6 },
  knobLabel: { color: '#555', fontSize: 7, fontWeight: '700', letterSpacing: 1 },

  btnRow: { flex: 1, flexDirection: 'row', gap: 5 },
  btn: {
    flex: 1,
    height: 36,
    backgroundColor: '#2c2824',
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#3e3a36',
  },
  btnDown: {
    borderBottomWidth: 1,
    borderTopColor: '#222',
    transform: [{ translateY: 2 }],
    backgroundColor: '#1e1c1a',
  },
  btnLabel:       { fontSize: 8, fontWeight: '700', color: '#8a8278', letterSpacing: 0.5 },
  btnLabelActive: { color: '#c8b89a' },

  closeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2a2620',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3a3630',
  },
});

export default CassettePlayer;