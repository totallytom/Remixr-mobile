import { create } from 'zustand';
import { Audio } from 'expo-av';
import { AuthService } from '../services/authService';
import { MusicService } from '../services/musicService';
import { supabase } from '../services/supabase';
import { storage, STORAGE_KEYS } from '../platform/storage';

// Module-level sound instance — expo-av objects are not serializable, so kept outside Zustand
let _sound = null;

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
  isAuthInitialized: true,

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

  theme: {
    type: 'light',
    accentColor: 'primary',
    customSecondaryColor: null,
    customBackgroundColor: null,
  },

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
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  triggerPlayEvent: () => set((s) => ({ playEvent: s.playEvent + 1 })),
  setTheme: (theme) => set({ theme }),

  // --------------------
  // AUDIO INIT
  // --------------------
  initializeAudio: async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (e) {
      console.warn('[audio] setAudioModeAsync failed:', e);
    }
  },

  // --------------------
  // PLAYER CONTROLS
  // --------------------
  playTrack: async (track) => {
    if (!track?.audioUrl) return;

    const { player } = get();
    const isCurrentTrack = player.currentTrack?.id === track.id;

    set((s) => ({ player: { ...s.player, visible: true } }));

    if (isCurrentTrack && _sound) {
      // Same track already loaded — just resume
      try {
        await _sound.playAsync();
      } catch (e) {
        console.error('[audio] playAsync failed:', e);
      }
      return;
    }

    // New track: push current to history
    if (player.currentTrack && player.currentTrack.id !== track.id) {
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
        isPlaying: false,
      },
    }));

    try {
      // Unload previous sound
      if (_sound) {
        await _sound.unloadAsync().catch(() => {});
        _sound = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: track.audioUrl },
        {
          shouldPlay: true,
          volume: get().player.volume,
          progressUpdateIntervalMillis: 500,
        },
      );
      _sound = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;

        set((s) => ({
          player: {
            ...s.player,
            currentTime: (status.positionMillis ?? 0) / 1000,
            progress: (status.positionMillis ?? 0) / 1000,
            isBuffering: status.isBuffering ?? false,
            isPlaying: status.isPlaying,
            isLoaded: true,
            duration: status.durationMillis != null
              ? status.durationMillis / 1000
              : s.player.duration,
          },
        }));

        if (status.didJustFinish) {
          const { player: p } = get();
          if (p.repeatMode === 'one') {
            _sound?.replayAsync().catch(console.error);
          } else if (p.queue.length > 0) {
            get().skipToNext();
          } else if (p.repeatMode === 'all' && p.originalQueue.length > 0) {
            get().playQueue(p.originalQueue);
          } else {
            set((s) => ({ player: { ...s.player, isPlaying: false } }));
          }
        }
      });
    } catch (e) {
      console.error('[audio] load/play failed:', e);
      set((s) => ({ player: { ...s.player, isBuffering: false } }));
    }
  },

  pauseTrack: async () => {
    if (_sound) {
      try {
        await _sound.pauseAsync();
        set((s) => ({ player: { ...s.player, isPlaying: false } }));
      } catch (e) {
        console.error('[audio] pauseAsync failed:', e);
      }
    }
  },

  resumeTrack: async () => {
    if (_sound) {
      try {
        await _sound.playAsync();
      } catch (e) {
        console.error('[audio] playAsync (resume) failed:', e);
      }
    }
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
    if (player.currentTime > 3 && _sound) {
      try {
        await _sound.setPositionAsync(0);
        set((s) => ({ player: { ...s.player, currentTime: 0, progress: 0 } }));
      } catch (e) {
        console.error('[audio] setPositionAsync failed:', e);
      }
      return;
    }
    if (!player.trackHistory?.length) {
      if (_sound) await _sound.setPositionAsync(0).catch(() => {});
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
    if (_sound) {
      try {
        await _sound.setPositionAsync(Math.round(time * 1000));
        set((s) => ({ player: { ...s.player, currentTime: time, progress: time } }));
      } catch (e) {
        console.error('[audio] seekTo failed:', e);
      }
    }
  },

  setVolume: async (volume) => {
    set((s) => ({ player: { ...s.player, volume } }));
    try {
      await _sound?.setVolumeAsync(Math.max(0, Math.min(1, volume)));
    } catch (e) {
      console.error('[audio] setVolumeAsync failed:', e);
    }
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
    });

    return () => {
      data?.subscription?.unsubscribe();
    };
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
