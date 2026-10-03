/**
 * Shared expo-audio setup and helpers.
 *
 * expo-audio players are native objects: every player created with
 * createAudioPlayer() must be released with player.remove() when its owner is
 * done with it (unmount, track change), or it keeps holding native resources.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioMode, type AudioPlayer, type AudioStatus } from 'expo-audio';

/** The app's normal mode: music keeps playing in the background and with the silent switch on. */
const PLAYBACK_MODE: Partial<AudioMode> = {
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  interruptionMode: 'doNotMix',
  allowsRecording: false,
  shouldRouteThroughEarpiece: false,
};

export async function applyPlaybackAudioMode(): Promise<void> {
  try {
    await setAudioModeAsync(PLAYBACK_MODE);
  } catch (e) {
    console.warn('[audio] setAudioModeAsync failed:', e);
  }
}

/** Recording needs its own mode; call applyPlaybackAudioMode() again when finished. */
export async function applyRecordingAudioMode(): Promise<void> {
  await setAudioModeAsync({ ...PLAYBACK_MODE, allowsRecording: true });
}

/**
 * A short-lived player for previews. Calls onStatus on every status update.
 * The caller owns it and must call player.remove().
 */
export function createPreviewPlayer(uri: string, onStatus?: (status: AudioStatus) => void): AudioPlayer {
  const player = createAudioPlayer({ uri }, { updateInterval: 250 });
  if (onStatus) player.addListener('playbackStatusUpdate', onStatus);
  return player;
}

/** Resolves once the player has loaded its source (or after timeoutMs, whichever first). */
export function waitUntilLoaded(player: AudioPlayer, timeoutMs = 10000): Promise<boolean> {
  if (player.isLoaded) return Promise.resolve(true);
  return new Promise((resolve) => {
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.isLoaded) {
        clearTimeout(timer);
        sub.remove();
        resolve(true);
      }
    });
    const timer = setTimeout(() => {
      sub.remove();
      resolve(false);
    }, timeoutMs);
  });
}

/** Duration of an audio file in whole seconds, or 0 if it can't be read. */
export async function getAudioDurationSeconds(uri: string): Promise<number> {
  const player = createAudioPlayer({ uri });
  try {
    const loaded = await waitUntilLoaded(player);
    return loaded && player.duration > 0 ? Math.floor(player.duration) : 0;
  } catch {
    return 0;
  } finally {
    player.remove();
  }
}

/** Releases a player, ignoring errors from one that was already released. */
export function releasePlayer(player: AudioPlayer | null | undefined): void {
  try {
    player?.remove();
  } catch {
    // already released
  }
}
