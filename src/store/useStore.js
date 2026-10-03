import { create } from 'zustand';
import { createAudioPlayer } from 'expo-audio';
import { applyPlaybackAudioMode } from '../services/audio';
import { AuthService } from '../services/authService';
import { MusicService } from '../services/musicService';
import { supabase } from '../services/supabase';
import { storage, STORAGE_KEYS } from '../platform/storage';
import {
  configureRevenueCat,
  identifyUser,
  logOutRevenueCat,
  getCustomerInfo,
  resolveTier,
  isRevenueCatAvailable,
} from '../services/revenueCatService';
import { BlockService } from '../services/blockService';

// One app-wide player, reused for every track via replace(). expo-audio players are
// native objects (not serializable), so it lives outside Zustand. Keeping a single
// player also keeps it registered for the lock screen / Control Center controls.
let _player = null;
let _lockScreenActive = false;

const clampVolume = (v) => Math.max(0, Math.min(1, v));

function ensurePlayer() {
  if (_player) return _player;
  _player = createAudioPlayer(null, { updateInterval: 500 });
  _player.addListener('playbackStatusUpdate', handlePlaybackStatus);
  return _player;
}

// Title, artist and artwork on the lock screen and in Control Center, with
// play/pause, scrubbing and ±10s skips (expo-audio has no next/previous buttons).
function showOnLockScreen(audio, track) {
  const metadata = {
    title: track.title,
    artist: track.artist,
    albumTitle: track.album || undefined,
    artworkUrl: track.cover || undefined,
  };
  try {
    if (_lockScreenActive) {
      audio.updateLockScreenMetadata(metadata);
    } else {
      audio.setActiveForLockScreen(true, metadata, { showSeekForward: true, showSeekBackward: true });
      _lockScreenActive = true;
    }
  } catch (e) {
    console.warn('[audio] lock screen controls failed:', e);
  }
}

// Optional override for what happens when a track finishes (the DJ Room uses it
// so the room's shared queue advances instead of the personal one). Return true
// when handled; false falls through to repeat / queue / stop.
let _trackEndHandler = null;
export function setTrackEndHandler(fn) {
  _trackEndHandler = fn;
  return () => { if (_trackEndHandler === fn) _trackEndHandler = null; };
}

function handlePlaybackStatus(status) {
  const { player } = useStore.getState();
  if (!player.currentTrack) return;

  useStore.setState((s) => ({
    player: {
      ...s.player,
      currentTime: status.currentTime ?? 0,
      progress: status.currentTime ?? 0,
      isBuffering: status.isBuffering ?? false,
      isPlaying: status.playing,
      isLoaded: status.isLoaded,
      duration: status.duration > 0 ? status.duration : s.player.duration,
    },
  }));

  if (status.didJustFinish) {
    const { player: p, skipToNext, playQueue } = useStore.getState();
    try {
      if (_trackEndHandler && _trackEndHandler(p.currentTrack)) {
        useStore.setState((s) => ({ player: { ...s.player, isPlaying: false } }));
        return;
      }
    } catch (e) {
      console.warn('[audio] track end handler failed:', e);
    }
    if (p.repeatMode === 'one') {
      _player?.seekTo(0).then(() => _player?.play()).catch(console.error);
    } else if (p.queue.length > 0) {
      skipToNext();
    } else if (p.repeatMode === 'all' && p.originalQueue.length > 0) {
      playQueue(p.originalQueue);
    } else {
      useStore.setState((s) => ({ player: { ...s.player, isPlaying: false } }));
    }
  }
}

function _shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const useStore = create((set, get) => ({
  // --------------------
  // INITIAL STATE
  // --------------------
  user: null,
  isAuthenticated: false,
  isAuthInitialized: false,

  player: {
    currentTrack: null,
    isPlaying: false,
    volume: 0.7,
    progress: 0,
    queue: [],
    visible: false,
    duration: 0,
    currentTime: 0,
    isLoaded: false,
    isBuffering: false,
    repeatMode: 'none',
    shuffle: false,
    originalQueue: [],
    trackHistory: [],
  },

  chats: [],
  activeChat: null,
  comments: [],
  playlists: [],

  sidebarOpen: true,
  currentView: 'home',
  isSettingsOpen: false,
  // True while a DM or group conversation is open on screen: MainTabs hides the
  // tab bar and mini player so the composer can sit directly on the keyboard.
  isConversationOpen: false,
  settingsInitialTab: 'account',

  theme: {
    type: 'light',
    accentColor: 'primary',
    customSecondaryColor: null,
    customBackgroundColor: null,
  },

  backgroundPresetId: 'default',
  playerPaletteIndex: null, // null = auto (hash-based), number = fixed palette

  playEvent: 0,

  // Manual status: 'online' | 'idle' | 'invisible' (persisted via storage)
  userStatus: 'online',

  // --------------------
  // BASIC ACTIONS
  // --------------------
  setUser: (user) => set({ user }),
  setUserStatus: (userStatus) => {
    storage.set(STORAGE_KEYS.USER_STATUS, userStatus);
    set({ userStatus });
  },
  initUserStatus: async () => {
    const s = await storage.get(STORAGE_KEYS.USER_STATUS);
    if (s === 'idle' || s === 'invisible') set({ userStatus: s });
  },
  setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  setChats: (chats) => set({ chats }),
  setPlaylists: (playlists) => set({ playlists }),
  deletePlaylist: (playlistId) => set((s) => ({
    playlists: s.playlists.filter(p => p.id !== playlistId)
  })),
  setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  setConversationOpen: (isConversationOpen) => set({ isConversationOpen }),
  setSettingsInitialTab: (settingsInitialTab) => set({ settingsInitialTab }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  triggerPlayEvent: () => set((s) => ({ playEvent: s.playEvent + 1 })),
  setTheme: (theme) => set({ theme }),
  setBackgroundPreset: (id) => {
    storage.set(STORAGE_KEYS.BACKGROUND_PRESET, id);
    set({ backgroundPresetId: id });
  },
  initBackgroundPreset: async () => {
    const saved = await storage.get(STORAGE_KEYS.BACKGROUND_PRESET);
    if (saved) set({ backgroundPresetId: saved });
  },
  setPlayerPalette: (index) => {
    storage.set(STORAGE_KEYS.PLAYER_PALETTE, index !== null ? String(index) : '');
    set({ playerPaletteIndex: index });
  },
  initPlayerPalette: async () => {
    const saved = await storage.get(STORAGE_KEYS.PLAYER_PALETTE);
    if (saved) {
      const i = parseInt(saved, 10);
      if (!isNaN(i)) set({ playerPaletteIndex: i });
    }
  },

  // --------------------
  // AUDIO INIT
  // --------------------
  initializeAudio: async () => {
    await applyPlaybackAudioMode();
  },

  // --------------------
  // PLAYER CONTROLS
  // --------------------
  playTrack: async (track) => {
    if (!track?.audioUrl) return;

    const { player } = get();
    const audio = ensurePlayer();

    set((s) => ({ player: { ...s.player, visible: true } }));

    if (player.currentTrack?.id === track.id) {
      audio.play();
      return;
    }

    // New track: push current to history
    if (player.currentTrack) {
      set((s) => ({
        player: {
          ...s.player,
          trackHistory: [...s.player.trackHistory, s.player.currentTrack],
        },
      }));
    }

    set((s) => ({
      player: {
        ...s.player,
        currentTrack: track,
        currentTime: 0,
        progress: 0,
        duration: 0,
        isLoaded: false,
        isBuffering: true,
        // Flips true once the player's status update confirms playback started.
        isPlaying: false,
      },
    }));

    try {
      audio.replace({ uri: track.audioUrl });
      audio.volume = clampVolume(get().player.volume);
      audio.play();
      showOnLockScreen(audio, track);
    } catch (e) {
      console.error('[audio] load/play failed:', e);
      set((s) => ({ player: { ...s.player, isBuffering: false } }));
    }
  },

  pauseTrack: async () => {
    if (!_player) return;
    _player.pause();
    set((s) => ({ player: { ...s.player, isPlaying: false } }));
  },

  dismissPlayer: async () => {
    if (_player) {
      try {
        _player.pause();
        _player.clearLockScreenControls();
        _player.replace(null);
      } catch (e) {}
      _lockScreenActive = false;
    }
    set((s) => ({
      player: {
        ...s.player,
        currentTrack: null,
        isPlaying: false,
        visible: false,
        currentTime: 0,
        duration: 0,
        isLoaded: false,
        isBuffering: false,
        queue: [],
        trackHistory: [],
      },
    }));
  },

  resumeTrack: async () => {
    _player?.play();
  },

  skipToNext: async () => {
    const { player } = get();
    if (!player.queue.length) return;
    const [next, ...rest] = player.queue;
    set((s) => ({ player: { ...s.player, queue: rest } }));
    await get().playTrack(next);
  },

  skipToPrevious: async () => {
    const { player } = get();
    // If more than 3 seconds in, restart the current track
    if (player.currentTime > 3 && _player) {
      try {
        await _player.seekTo(0);
        set((s) => ({ player: { ...s.player, currentTime: 0, progress: 0 } }));
      } catch (e) {
        console.error('[audio] seekTo(0) failed:', e);
      }
      return;
    }
    if (!player.trackHistory?.length) {
      if (_player) await _player.seekTo(0).catch(() => {});
      set((s) => ({ player: { ...s.player, currentTime: 0, progress: 0 } }));
      return;
    }
    const newHistory = player.trackHistory.slice(0, -1);
    const prevTrack = player.trackHistory[player.trackHistory.length - 1];
    const newQueue = player.currentTrack
      ? [player.currentTrack, ...player.queue]
      : player.queue;
    // Clear currentTrack first so playTrack doesn't re-add prevTrack to history
    set((s) => ({
      player: { ...s.player, trackHistory: newHistory, queue: newQueue, currentTrack: null },
    }));
    await get().playTrack(prevTrack);
  },

  seekTo: async (time) => {
    if (!_player) return;
    try {
      await _player.seekTo(time);
      set((s) => ({ player: { ...s.player, currentTime: time, progress: time } }));
    } catch (e) {
      console.error('[audio] seekTo failed:', e);
    }
  },

  setVolume: async (volume) => {
    set((s) => ({ player: { ...s.player, volume } }));
    if (_player) _player.volume = clampVolume(volume);
  },

  toggleRepeat: () => {
    set((s) => {
      const modes = ['none', 'all', 'one'];
      const next = modes[(modes.indexOf(s.player.repeatMode) + 1) % modes.length];
      return { player: { ...s.player, repeatMode: next } };
    });
  },

  toggleShuffle: () => {
    set((s) => {
      if (s.player.shuffle) {
        return { player: { ...s.player, shuffle: false, queue: s.player.originalQueue } };
      }
      const shuffled = _shuffleArray(s.player.queue);
      return {
        player: {
          ...s.player,
          shuffle: true,
          originalQueue: s.player.queue,
          queue: shuffled,
        },
      };
    });
  },

  togglePlayerVisibility: () =>
    set((s) => ({
      player: { ...s.player, visible: !s.player.visible },
    })),

  setQueue: (tracks) =>
    set((s) => ({ player: { ...s.player, queue: tracks } })),

  playQueue: (tracks) => {
    if (!tracks?.length) return;
    const rest = tracks.slice(1);
    set((s) => ({
      player: {
        ...s.player,
        queue: rest,
        originalQueue: rest,
        trackHistory: [],
        visible: true,
      },
    }));
    get().playTrack(tracks[0]);
  },

  addToQueue: (track) =>
    set((s) => {
      if (!track) return s;
      return {
        player: {
          ...s.player,
          queue: [...s.player.queue, track],
          originalQueue: s.player.shuffle
            ? [...s.player.originalQueue, track]
            : s.player.originalQueue,
        },
      };
    }),

  removeFromQueue: (trackId) =>
    set((s) => {
      const removeFirstMatch = (tracks) => {
        const index = tracks.findIndex((t) => t.id === trackId);
        if (index === -1) return tracks;
        const next = [...tracks];
        next.splice(index, 1);
        return next;
      };
      return {
        player: {
          ...s.player,
          queue: removeFirstMatch(s.player.queue),
          originalQueue: removeFirstMatch(s.player.originalQueue),
        },
      };
    }),

  // --------------------
  // AUTH
  // --------------------
  login: async (email, password) => {
    const user = await AuthService.login({ email, password });
    set({ user, isAuthenticated: true });
  },

  /** After AuthService.register — syncs store even if auth listener briefly cleared state. */
  applySessionUser: (user) =>
    set({ user, isAuthenticated: !!user, isAuthInitialized: true }),

  register: async (data) => {
    const user = await AuthService.register(data);
    set({ user, isAuthenticated: true, isAuthInitialized: true });
    return user;
  },

  logout: async () => {
    await AuthService.logout();
    await storage.remove(STORAGE_KEYS.SUPABASE_SESSION);
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    const { user, isAuthenticated } = get();
    if (user && isAuthenticated) {
      return;
    }
    try {
      const user = await AuthService.getCurrentUser();
      if (user) {
        set({ user, isAuthenticated: true });
      } else {
        set({ user: null, isAuthenticated: false });
      }
    } catch (error) {
      console.error('Error fetching current user in checkAuth:', error);
      set({ user: null, isAuthenticated: false });
    }
  },

  refreshUser: async () => {
    try {
      const user = await AuthService.getCurrentUser();
      if (user) set({ user, isAuthenticated: true });
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  },

  initializeAuth: () => {
    let lastUserId = undefined;

    const { data } = AuthService.onAuthStateChange((user) => {
      // Skip duplicate SIGNED_IN for the same user id; always apply null (sign-out) updates.
      const incomingId = user?.id ?? null;
      if (incomingId !== null && incomingId === lastUserId) return;
      lastUserId = incomingId;
      set({ user, isAuthenticated: !!user, isAuthInitialized: true });

      if (user?.id) {
        get().syncRevenueCatIdentity(user.id);
        BlockService.loadHiddenUserIds();
      } else {
        logOutRevenueCat().catch(() => {});
        BlockService.clearHiddenUserIds();
      }
    });

    return () => {
      data?.subscription?.unsubscribe();
    };
  },

  // --------------------
  // REVENUECAT (subscriptions — Fan/Artist IAP tiers; Stripe is ticket-only)
  // --------------------
  initializeRevenueCat: () => {
    try {
      configureRevenueCat();
    } catch (e) {
      console.error('[revenueCat] configure failed:', e);
    }
  },

  // Links the signed-in user to RevenueCat and pulls their current entitlement
  // immediately (covers renewals/cancellations that happened while the app was
  // closed, since there's no backend webhook syncing this yet — see revenueCatService.ts).
  syncRevenueCatIdentity: async (userId) => {
    if (!isRevenueCatAvailable) return;
    try {
      const customerInfo = await identifyUser(userId);
      await get().applyRevenueCatEntitlement(customerInfo);
    } catch (e) {
      console.error('[revenueCat] identify/sync failed:', e);
    }
  },

  // Called after identify, and should also be called right after a purchase or
  // restore completes (with the CustomerInfo those calls return) so the UI
  // unlocks immediately rather than waiting for the next app launch.
  // Optimistic, local-only upgrade so features unlock the moment a purchase or
  // restore completes. The database tier is owned by the server: the
  // revenuecat-webhook Edge Function records the purchase and
  // recompute_subscription_tier() derives users.subscription_tier (clients can't
  // write it). Never downgrades locally — RevenueCat doesn't know about website
  // or complimentary access; the server-derived tier on next load is the truth.
  applyRevenueCatEntitlement: async (customerInfo) => {
    const { user } = get();
    if (!user) return;
    const rank = { free: 0, fan: 1, artist: 2 };
    const tier = resolveTier(customerInfo);
    if ((rank[tier] ?? 0) <= (rank[user.subscriptionTier] ?? 0)) return;
    set({ user: { ...user, subscriptionTier: tier } });
  },

  updateProfile: async (updatesOrUser) => {
    const { user } = get();
    if (!user) throw new Error('Not authenticated');
    // If passed a full user object (e.g. from togglePrivateAccount), just sync store
    if (updatesOrUser?.id && updatesOrUser?.username !== undefined) {
      set({ user: updatesOrUser });
      return updatesOrUser;
    }
    const updated = await AuthService.updateProfile(user.id, updatesOrUser);
    set({ user: updated });
    return updated;
  },

  togglePrivateAccount: async (userId, isPrivate) => {
    const updated = await AuthService.togglePrivateAccount(userId, isPrivate);
    set({ user: updated });
    return updated;
  },

  changePassword: async (currentPassword, newPassword) => {
    await AuthService.changePassword(currentPassword, newPassword);
  },

  setUserAvatar: (avatarUrl) =>
    set((s) => ({ user: s.user ? { ...s.user, avatar: avatarUrl } : null })),
}));
