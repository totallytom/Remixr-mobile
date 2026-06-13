import React, { useEffect, useRef, useState } from 'react';
import { View, PanResponder, StyleSheet } from 'react-native';

const BAR_GAP = 2;
const THUMB_R = 7; // thumb radius in px

function generateBars(seed: string, count: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return Array.from({ length: count }, (_, i) => {
    const raw = Math.sin((Math.abs(h) + i * 127) * 0.1234) * 0.5 + 0.5;
    const envelope = 1 - Math.pow(Math.abs((i / (count - 1)) - 0.5) * 1.6, 1.5);
    return Math.max(0.08, raw * Math.max(0.25, envelope));
  });
}

interface Props {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  color: string;
  seed: string;
  onSeek?: (t: number) => void;
  barCount?: number;
  height?: number;
}

const WaveformSeekBar: React.FC<Props> = ({
  currentTime,
  duration,
  isPlaying,
  color,
  seed,
  onSeek,
  barCount = 60,
  height = 64,
}) => {
  const [containerWidth, setContainerWidth] = useState(0);
  const [phase, setPhase] = useState(0);
  const [scrubProgress, setScrubProgress] = useState<number | null>(null);

  // ── Bar shape ──────────────────────────────────────────────────────────────
  const barsRef = useRef<number[]>([]);
  const lastSeed = useRef('');
  if (lastSeed.current !== seed) {
    lastSeed.current = seed;
    barsRef.current = generateBars(seed, barCount);
  }

  // ── Local time interpolation (smooth 20fps progress between audio updates) ─
  const localTime = useRef(currentTime);
  useEffect(() => { localTime.current = currentTime; }, [currentTime]);

  // ── Animation loop ─────────────────────────────────────────────────────────
  const containerWidthRef = useRef(0);
  const durationRef = useRef(duration);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      localTime.current = Math.min(
        durationRef.current,
        localTime.current + 0.05,
      );
      setPhase(p => p + 0.18);
    }, 50);
    return () => clearInterval(id);
  }, [isPlaying]);

  // ── Gesture ────────────────────────────────────────────────────────────────
  const startXRef = useRef(0);
  const isDragging = useRef(false);

  const clamp = (x: number) =>
    Math.max(0, Math.min(1, x / containerWidthRef.current));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !!onSeek,
      onMoveShouldSetPanResponder: (_, gs) => !!onSeek && Math.abs(gs.dx) > 4,

      onPanResponderGrant: e => {
        startXRef.current = e.nativeEvent.locationX;
        isDragging.current = false;
      },
      onPanResponderMove: (_, gs) => {
        if (!onSeek) return;
        isDragging.current = true;
        setScrubProgress(clamp(startXRef.current + gs.dx));
      },
      onPanResponderRelease: (_, gs) => {
        if (!onSeek) return;
        // startXRef + dx works for both taps (dx ≈ 0) and drags
        const p = clamp(startXRef.current + gs.dx);
        setScrubProgress(p);
        if (durationRef.current > 0) {
          localTime.current = p * durationRef.current;
          onSeek(p * durationRef.current);
        }
        // Clear scrub once audio catches up
        setTimeout(() => setScrubProgress(null), 600);
        isDragging.current = false;
      },
      onPanResponderTerminate: () => {
        setScrubProgress(null);
        isDragging.current = false;
      },
    }),
  ).current;

  // ── Render ─────────────────────────────────────────────────────────────────
  const audioProgress = duration > 0 ? Math.min(1, localTime.current / duration) : 0;
  const progress = scrubProgress !== null ? scrubProgress : audioProgress;

  const barW = containerWidth > 0
    ? Math.max(1, (containerWidth - BAR_GAP * (barCount - 1)) / barCount)
    : 0;

  return (
    <View
      onLayout={e => {
        const w = e.nativeEvent.layout.width;
        setContainerWidth(w);
        containerWidthRef.current = w;
      }}
      style={[styles.container, { height }]}
      {...(onSeek ? panResponder.panHandlers : {})}
    >
      {barW > 0 && barsRef.current.map((baseH, i) => {
        const wave = isPlaying
          ? Math.sin(phase + i * 0.38) * 0.14 * baseH
          : 0;
        const barH = Math.max(0.06, baseH + wave) * height;
        const played = (i + 0.5) / barCount <= progress;
        return (
          <View
            key={i}
            style={{
              width: barW,
              height: barH,
              alignSelf: 'flex-end',
              backgroundColor: played ? color : 'rgba(255,255,255,0.18)',
              borderRadius: barW,
              marginRight: i < barCount - 1 ? BAR_GAP : 0,
            }}
          />
        );
      })}

      {/* Playhead thumb */}
      {containerWidth > 0 && onSeek && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: progress * containerWidth - THUMB_R,
            top: height / 2 - THUMB_R,
            width: THUMB_R * 2,
            height: THUMB_R * 2,
            borderRadius: THUMB_R,
            backgroundColor: color,
            borderWidth: 2,
            borderColor: '#fff',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.35,
            shadowRadius: 4,
            elevation: 5,
          }}
        />
      )}
    </View>
  );
};

export default WaveformSeekBar;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
});
