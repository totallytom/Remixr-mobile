import React, { useEffect, useRef, useState } from 'react';
import { View, Text, PanResponder, StyleSheet } from 'react-native';
import { hap } from '../../utils/haptics';
import i18n from '../../i18n';

const BAR_GAP = 2;
const THUMB_R = 7;       // thumb radius at rest
const THUMB_R_DRAG = 11; // bigger while you're holding it

/**
 * Scrub speed by how far the finger has moved *down* from the bar
 * (like Apple Music): further down = finer control for long tracks.
 */
const SPEEDS = [
  { minDy: 0, factor: 1, key: 'scrubFull' },
  { minDy: 60, factor: 0.5, key: 'scrubHalf' },
  { minDy: 120, factor: 0.25, key: 'scrubQuarter' },
  { minDy: 180, factor: 0.1, key: 'scrubFine' },
] as const;

function speedFor(dy: number) {
  let s: (typeof SPEEDS)[number] = SPEEDS[0];
  for (const candidate of SPEEDS) if (dy >= candidate.minDy) s = candidate;
  return s;
}

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

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface Props {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  color: string;
  seed: string;
  onSeek?: (t: number) => void;
  /** Lets a parent ScrollView stop scrolling while the user scrubs. */
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
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
  onScrubStart,
  onScrubEnd,
  barCount = 60,
  height = 64,
}) => {
  const [containerWidth, setContainerWidth] = useState(0);
  const [phase, setPhase] = useState(0);
  const [scrubProgress, setScrubProgress] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [speedKey, setSpeedKey] = useState<string>('scrubFull');

  // ── Bar shape ──────────────────────────────────────────────────────────────
  const barsRef = useRef<number[]>([]);
  const lastSeed = useRef('');
  if (lastSeed.current !== seed) {
    lastSeed.current = seed;
    barsRef.current = generateBars(seed, barCount);
  }

  // ── Local time interpolation (smooth 20fps progress between audio updates) ─
  const localTime = useRef(currentTime);
  /** After a seek, ignore stale player times until they reach the target. */
  const seekTargetRef = useRef<{ t: number; at: number } | null>(null);
  useEffect(() => {
    const target = seekTargetRef.current;
    if (target) {
      const caughtUp = Math.abs(currentTime - target.t) < 1.5;
      if (!caughtUp && Date.now() - target.at < 2500) return; // stale update — keep showing the target
      seekTargetRef.current = null;
      setScrubProgress(null);
    }
    localTime.current = currentTime;
  }, [currentTime]);

  const containerWidthRef = useRef(0);
  const containerXRef = useRef(0);
  const durationRef = useRef(duration);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  const onSeekRef = useRef(onSeek);
  const onScrubStartRef = useRef(onScrubStart);
  const onScrubEndRef = useRef(onScrubEnd);
  onSeekRef.current = onSeek;
  onScrubStartRef.current = onScrubStart;
  onScrubEndRef.current = onScrubEnd;

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      if (!seekTargetRef.current) {
        localTime.current = Math.min(durationRef.current, localTime.current + 0.05);
      }
      setPhase(p => p + 0.18);
    }, 50);
    return () => clearInterval(id);
  }, [isPlaying]);

  // ── Gesture ────────────────────────────────────────────────────────────────
  const viewRef = useRef<View>(null);
  const progressRef = useRef(0);
  const lastDxRef = useRef(0);
  const speedRef = useRef<(typeof SPEEDS)[number]>(SPEEDS[0]);

  const clamp01 = (p: number) => Math.max(0, Math.min(1, p));

  const endScrub = (commit: boolean) => {
    setScrubbing(false);
    setSpeedKey('scrubFull');
    onScrubEndRef.current?.();
    if (commit && durationRef.current > 0 && onSeekRef.current) {
      const t = progressRef.current * durationRef.current;
      localTime.current = t;
      seekTargetRef.current = { t, at: Date.now() };
      setScrubProgress(progressRef.current);
      onSeekRef.current(t);
    } else {
      setScrubProgress(null);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !!onSeekRef.current,
      onMoveShouldSetPanResponder: () => !!onSeekRef.current,
      // Don't let the surrounding ScrollView steal the drag halfway through.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,

      onPanResponderGrant: (_e, gs) => {
        // gs.x0 is the absolute touch point; subtract the bar's own position.
        // (locationX would be relative to whichever thin waveform bar was touched.)
        const w = containerWidthRef.current || 1;
        progressRef.current = clamp01((gs.x0 - containerXRef.current) / w);
        lastDxRef.current = 0;
        speedRef.current = SPEEDS[0];
        setScrubbing(true);
        setScrubProgress(progressRef.current);
        onScrubStartRef.current?.();
        hap.tap();
      },
      onPanResponderMove: (_e, gs) => {
        const w = containerWidthRef.current || 1;
        const speed = speedFor(Math.max(0, gs.dy));
        if (speed.key !== speedRef.current.key) {
          speedRef.current = speed;
          setSpeedKey(speed.key);
          hap.tap();
        }
        // Integrate movement so changing speed mid-drag doesn't jump the playhead.
        const ddx = gs.dx - lastDxRef.current;
        lastDxRef.current = gs.dx;
        progressRef.current = clamp01(progressRef.current + (ddx * speed.factor) / w);
        setScrubProgress(progressRef.current);
      },
      onPanResponderRelease: () => endScrub(true),
      onPanResponderTerminate: () => endScrub(false),
    }),
  ).current;

  // ── Render ─────────────────────────────────────────────────────────────────
  const audioProgress = duration > 0 ? Math.min(1, localTime.current / duration) : 0;
  const progress = scrubProgress !== null ? scrubProgress : audioProgress;

  const barW = containerWidth > 0
    ? Math.max(1, (containerWidth - BAR_GAP * (barCount - 1)) / barCount)
    : 0;
  const thumbR = scrubbing ? THUMB_R_DRAG : THUMB_R;
  const thumbX = progress * containerWidth;
  // Keep the time bubble inside the bar's edges.
  const bubbleW = 92;
  const bubbleLeft = Math.max(0, Math.min(containerWidth - bubbleW, thumbX - bubbleW / 2));

  return (
    <View
      ref={viewRef}
      onLayout={e => {
        const w = e.nativeEvent.layout.width;
        setContainerWidth(w);
        containerWidthRef.current = w;
        viewRef.current?.measureInWindow((x) => { containerXRef.current = x; });
      }}
      style={[styles.container, { height }]}
      accessibilityRole="adjustable"
      accessibilityLabel={i18n.t('player.seek')}
      accessibilityValue={{ text: `${fmt(progress * duration)} / ${fmt(duration)}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (!onSeek || duration <= 0) return;
        const step = e.nativeEvent.actionName === 'increment' ? 10 : -10;
        onSeek(Math.max(0, Math.min(duration, localTime.current + step)));
      }}
      {...(onSeek ? panResponder.panHandlers : {})}
    >
      {barW > 0 && barsRef.current.map((baseH, i) => {
        const wave = isPlaying && !scrubbing
          ? Math.sin(phase + i * 0.38) * 0.14 * baseH
          : 0;
        const barH = Math.max(0.06, baseH + wave) * height;
        const played = (i + 0.5) / barCount <= progress;
        return (
          <View
            key={i}
            pointerEvents="none"
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
            left: thumbX - thumbR,
            top: height / 2 - thumbR,
            width: thumbR * 2,
            height: thumbR * 2,
            borderRadius: thumbR,
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

      {/* While scrubbing: where you'll land, and the scrub speed */}
      {scrubbing && containerWidth > 0 && (
        <View pointerEvents="none" style={[styles.bubble, { left: bubbleLeft, width: bubbleW, bottom: height + 6 }]}>
          <Text style={styles.bubbleTime}>{fmt(progress * duration)}</Text>
          <Text style={styles.bubbleSpeed} numberOfLines={1}>{i18n.t(`player.${speedKey}`)}</Text>
        </View>
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
  bubble: {
    position: 'absolute',
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  bubbleTime: { color: '#fff', fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  bubbleSpeed: { color: 'rgba(255,255,255,0.65)', fontSize: 10, marginTop: 1 },
});
