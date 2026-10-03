import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, useAudioRecorder, type AudioPlayer } from 'expo-audio';
import {
  applyPlaybackAudioMode,
  applyRecordingAudioMode,
  createPreviewPlayer,
  releasePlayer,
  waitUntilLoaded,
} from '../../services/audio';
import { X, Mic, Square, Play, Pause, RotateCcw, Send } from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { MusicService } from '../../services/musicService';
import i18n from '../../i18n';

const MAX_SEC = 30;

type Stage = 'idle' | 'recording' | 'recorded' | 'uploading' | 'done';

export interface ChallengeTrack {
  id: string;
  title: string;
  artist?: string;
  cover?: string;
}

interface Props {
  visible: boolean;
  track: ChallengeTrack | null;
  onClose: () => void;
}

export default function ChallengeRecordModal({ visible, track, onClose }: Props) {
  const { user, pauseTrack } = useStore() as any;
  const [stage, setStage] = useState<Stage>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [uri, setUri] = useState<string | null>(null);
  const [isPlayingBack, setIsPlayingBack] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const isRecordingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playbackRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    if (visible) {
      setStage('idle');
      setElapsed(0);
      setUri(null);
      setIsPlayingBack(false);
      setError(null);
    } else {
      cleanupRecording();
      releasePlayer(playbackRef.current);
      playbackRef.current = null;
    }
  }, [visible]);

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const cleanupRecording = async () => {
    stopTimer();
    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      try { await recorder.stop(); } catch {}
      await applyPlaybackAudioMode();
    }
  };

  const startRecording = async () => {
    setError(null);
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      setError(i18n.t('challenge.micPermission'));
      return;
    }
    try {
      // A playing song would bleed into the microphone.
      await pauseTrack();
      await applyRecordingAudioMode();
      await recorder.prepareToRecordAsync();
      recorder.record();
      isRecordingRef.current = true;
      setStage('recording');
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(prev => {
          const next = prev + 1;
          if (next >= MAX_SEC) { handleStop(); return MAX_SEC; }
          return next;
        });
      }, 1000);
    } catch {
      setError(i18n.t('challenge.startFailed'));
      await applyPlaybackAudioMode();
    }
  };

  const handleStop = async () => {
    stopTimer();
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    try {
      await recorder.stop();
      const recordedUri = recorder.uri;
      if (recordedUri) { setUri(recordedUri); setStage('recorded'); }
    } catch {
      setError(i18n.t('challenge.recordFailed'));
      setStage('idle');
    } finally {
      await applyPlaybackAudioMode();
    }
  };

  const togglePlayback = async () => {
    if (!uri) return;
    try {
      if (isPlayingBack) {
        playbackRef.current?.pause();
        setIsPlayingBack(false);
      } else {
        if (!playbackRef.current) {
          playbackRef.current = createPreviewPlayer(uri, (s) => {
            if (s.didJustFinish) setIsPlayingBack(false);
          });
          await waitUntilLoaded(playbackRef.current);
        }
        await playbackRef.current.seekTo(0);
        playbackRef.current.play();
        setIsPlayingBack(true);
      }
    } catch {
      setError(i18n.t('challenge.playFailed'));
    }
  };

  const handleReRecord = async () => {
    releasePlayer(playbackRef.current);
    playbackRef.current = null;
    setIsPlayingBack(false);
    setUri(null);
    setElapsed(0);
    setStage('idle');
  };

  const handleSubmit = async () => {
    if (!uri || !track || !user) return;
    setStage('uploading');
    setError(null);
    try {
      await MusicService.submitChallengeResponse(
        track.id,
        user.id,
        uri,
        'audio/m4a',
        elapsed,
      );
      setStage('done');
      setTimeout(onClose, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : i18n.t('challenge.uploadFailed'));
      setStage('recorded');
    }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  if (!track) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.trackRow}>
              {track.cover ? (
                <Image source={{ uri: track.cover }} style={s.cover} />
              ) : (
                <View style={[s.cover, s.coverFallback]}>
                  <Text style={s.coverFallbackText}>♪</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.challengeLabel}>{i18n.t('challenge.label')}</Text>
                <Text style={s.trackTitle} numberOfLines={1}>{track.title}</Text>
                {track.artist && <Text style={s.trackArtist} numberOfLines={1}>{track.artist}</Text>}
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <X size={20} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={s.body}>
            {stage === 'idle' && (
              <>
                <Text style={s.instruction}>
                  Record up to {MAX_SEC}s. Your clip will be posted as a response to this track.
                </Text>
                <TouchableOpacity onPress={startRecording} style={s.recordBtn} activeOpacity={0.8}>
                  <Mic size={38} color="#fff" />
                </TouchableOpacity>
                <Text style={s.hint}>{i18n.t('challenge.tapStart')}</Text>
              </>
            )}

            {stage === 'recording' && (
              <>
                <View style={s.timerRow}>
                  <View style={s.redDot} />
                  <Text style={s.timer}>{fmt(elapsed)}</Text>
                  <Text style={s.timerMax}> / {fmt(MAX_SEC)}</Text>
                </View>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: `${(elapsed / MAX_SEC) * 100}%` as any }]} />
                </View>
                <TouchableOpacity onPress={handleStop} style={s.stopBtn} activeOpacity={0.8}>
                  <Square size={28} color="#fff" fill="#fff" />
                </TouchableOpacity>
                <Text style={s.hint}>{i18n.t('challenge.tapStop')}</Text>
              </>
            )}

            {stage === 'recorded' && (
              <>
                <Text style={s.durationLabel}>{fmt(elapsed)} recorded</Text>
                <TouchableOpacity onPress={togglePlayback} style={s.playbackBtn} activeOpacity={0.8}>
                  {isPlayingBack ? <Pause size={32} color="#fff" /> : <Play size={32} color="#fff" />}
                </TouchableOpacity>
                {error && <Text style={s.errorText}>{error}</Text>}
                <View style={s.actionRow}>
                  <TouchableOpacity onPress={handleReRecord} style={s.secondaryBtn} activeOpacity={0.8}>
                    <RotateCcw size={16} color="#a78bfa" />
                    <Text style={s.secondaryBtnText}>{i18n.t('challenge.rerecord')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSubmit} style={s.submitBtn} activeOpacity={0.8}>
                    <Send size={16} color="#fff" />
                    <Text style={s.submitBtnText}>{i18n.t('challenge.submit')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {stage === 'uploading' && (
              <>
                <ActivityIndicator size="large" color="#000000" />
                <Text style={s.uploadingText}>{i18n.t('challenge.uploading')}</Text>
              </>
            )}

            {stage === 'done' && (
              <>
                <Text style={s.doneIcon}>🎤</Text>
                <Text style={s.doneText}>{i18n.t('challenge.submitted')}</Text>
                <Text style={s.doneSubText}>{i18n.t('challenge.live')}</Text>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  trackRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  cover: {
    width: 52,
    height: 52,
    borderRadius: 10,
    flexShrink: 0,
  },
  coverFallback: {
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFallbackText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 22,
  },
  challengeLabel: {
    color: '#a78bfa',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  trackTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  trackArtist: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    marginTop: 1,
  },
  closeBtn: {
    padding: 8,
    marginLeft: 8,
  },
  body: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 16,
    minHeight: 220,
    gap: 16,
  },
  instruction: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  recordBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#7c3aed',
    borderWidth: 3,
    borderColor: 'rgba(167,139,250,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  redDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  timer: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timerMax: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 18,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ef4444',
    borderRadius: 2,
  },
  stopBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  playbackBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(124,58,237,0.4)',
    borderWidth: 2,
    borderColor: 'rgba(167,139,250,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 4,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.3)',
  },
  secondaryBtnText: {
    color: '#a78bfa',
    fontSize: 14,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#7c3aed',
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  uploadingText: {
    color: '#000000',
    fontSize: 13,
    marginTop: 8,
  },
  doneIcon: {
    fontSize: 48,
  },
  doneText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  doneSubText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
  },
});
