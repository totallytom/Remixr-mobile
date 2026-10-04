import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text as RNText,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  TextInput,
  Share,
  Linking,
  type TextProps,
} from 'react-native';
import { profileShareUrl } from '../../utils/shareLinks';
import { Image } from 'expo-image';
import { FONTS } from '../../utils/fonts';
import { colors } from '../../theme'

const Text = ({ style, ...props }: TextProps) => (
  <RNText style={[{ fontFamily: FONTS.body }, style]} {...props} />
);
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Music,
  User as UserIcon,
  ListMusic,
  UserPlus,
  UserMinus,
  Edit,
  Trash2,
  Settings,
  Lock,
  Play,
  Share2,
  Users,
  Calendar,
  MapPin,
  X,
  Bookmark,
  ThumbsUp,
  Check,
  Globe,
  Camera,
  AtSign,
  MessageCircle,
  Search,
  Shield,
  Ticket as TicketIcon,
  QrCode,
  BarChart3,
} from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { ChatService } from '../../services/chatService';
import { FollowService } from '../../services/followService';
import type { FollowStats } from '../../services/followService';
import { MusicService } from '../../services/musicService';
import { ConcertService } from '../../services/concertService';
import type { Concert, CreateConcertData } from '../../services/concertService';
import { AlbumService } from '../../services/albumService';
import type { Album } from '../../services/albumService';
import type { Track, Playlist } from '../../store/useStore';
import MusicPlayerModal from '../../components/player/MusicPlayerModal';
import PlaylistCard from '../../components/music/PlaylistCard';
import TrackCard from '../../components/music/TrackCard';
import AlbumCard from '../../components/music/AlbumCard';
import FollowRequestCard from '../../components/social/FollowRequestCard';
import VerifiedBadge from '../../components/VerifiedBadge';
import { getAvatarUrl } from '../../utils/avatar';
import { IN_APP_TICKETS_ENABLED } from '../../config/features';
import { supabase } from '../../services/supabase';
import * as ImagePicker from 'expo-image-picker';
import type { ProfileStackParamList } from '../../navigation/stacks/ProfileStack';
import SettingsModal from '../../components/layout/SettingsModal';
import { formatTicketPrice, normalizeTicketUrl, openTicketUrl, parseConcertDateInput, todayKey } from '../../utils/concerts';
import { formatConcertDate } from '../../utils/dateLocale';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { genreLabel } from '../../utils/genres';
import EarlyEarCard from '../../components/earlyEar/EarlyEarCard';

type ProfileNavProp = NativeStackNavigationProp<ProfileStackParamList, 'Profile'>;


const GENRES = ['Electronic', 'Pop', 'Rock', 'Hip Hop', 'R&B', 'Jazz', 'Classical', 'Country', 'Folk', 'Reggae', 'Blues', 'Funk', 'House', 'Techno', 'Ambient'];
const FREE_CONCERT_LIMIT = 1;

const Profile: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<ProfileNavProp>();
  const {
    user: currentUser,
    isAuthenticated,
    setUser,
    updateProfile,
    playTrack,
    playQueue,
    playPlaylist,
    setSettingsOpen,
    setSettingsInitialTab,
    isSettingsOpen,
  } = useStore();

  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'music' | 'albums' | 'concerts' | 'bookmark' | 'liked'>('music');
  const [followStats, setFollowStats] = useState<FollowStats>({ followers: 0, following: 0, isFollowing: false });

  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    username: '', email: '', bio: '', artistName: '',
    genres: [] as string[], isPrivate: false, vanityUrl: '', bannerUrl: '',
  });
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [vanityError, setVanityError] = useState<string | null>(null);

  const [deletingTrackId, setDeletingTrackId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoadingAlbums, setIsLoadingAlbums] = useState(false);
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [isLoadingConcerts, setIsLoadingConcerts] = useState(false);

  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [albumForm, setAlbumForm] = useState({ title: '', artist: '', genre: '', description: '', price: '' });

  const [isEditingConcerts, setIsEditingConcerts] = useState(false);
  const [editingConcert, setEditingConcert] = useState<Concert | null>(null);
  const [isAddingConcert, setIsAddingConcert] = useState(false);
  const [concertForm, setConcertForm] = useState({
    title: '', date: '', location: '', venue: '',
    description: '', ticketPrice: '', ticketUrl: '', capacity: '',
  });

  const [isEditingAbout, setIsEditingAbout] = useState(false);
  const [aboutForm, setAboutForm] = useState({ bio: '', genres: [] as string[] });

  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);
  const [showPendingRequestsModal, setShowPendingRequestsModal] = useState(false);
  const [acceptDeclineLoadingId, setAcceptDeclineLoadingId] = useState<string | null>(null);
  const [followersList, setFollowersList] = useState<any[]>([]);
  const [followingList, setFollowingList] = useState<any[]>([]);
  const [isFollowersLoading, setIsFollowersLoading] = useState(false);
  const [isFollowingListLoading, setIsFollowingListLoading] = useState(false);
  const [followersSearch, setFollowersSearch] = useState('');
  const [followingSearch, setFollowingSearch] = useState('');

  const [bookmarks, setBookmarks] = useState<Track[]>([]);
  const [isLoadingBookmarks, setIsLoadingBookmarks] = useState(false);
  const [likedTracks, setLikedTracks] = useState<Track[]>([]);
  const [isLoadingLikedTracks, setIsLoadingLikedTracks] = useState(false);

  const [showLinksModal, setShowLinksModal] = useState(false);
  const [linkInputs, setLinkInputs] = useState<string[]>(['', '', '']);
  const [isSavingLinks, setIsSavingLinks] = useState(false);
  const [profileLinkCopied, setProfileLinkCopied] = useState(false);
  const profileLinkCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [userTracks, setUserTracks] = useState<Track[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);

  const isCurrentUserPro = currentUser?.subscriptionTier === 'artist';
  const atConcertLimit = !isCurrentUserPro && concerts.length >= FREE_CONCERT_LIMIT;

  useEffect(() => {
    return () => {
      if (profileLinkCopyTimerRef.current) clearTimeout(profileLinkCopyTimerRef.current);
    };
  }, []);

  // Load profile data
  useEffect(() => {
    const loadProfile = async () => {
      setIsLoading(true);
      if (currentUser) {
        try {
          const freshUser = await ChatService.getUserById(currentUser.id);
          if (freshUser) setUser(freshUser);
        } catch (error) {
          console.error('Failed to refresh profile:', error);
        }
        try {
          const stats = await FollowService.getFollowStats(currentUser.id);
          setFollowStats(stats);
        } catch (error) {
          console.error('Failed to load follow stats:', error);
        }
      }
      setIsLoading(false);
    };
    loadProfile();
  }, [currentUser?.id]);

  useEffect(() => {
    const loadUserTracks = async () => {
      if (!currentUser) return;
      setIsLoadingTracks(true);
      try {
        const tracks = await MusicService.getUserTracks(currentUser.id);
        setUserTracks(tracks);
      } catch (error) {
        console.error('Failed to load user tracks:', error);
      } finally {
        setIsLoadingTracks(false);
      }
    };
    loadUserTracks();
  }, [currentUser?.id]);

  useEffect(() => {
    const loadPlaylists = async () => {
      if (!currentUser) return;
      setIsLoadingPlaylists(true);
      try {
        const fetched = await MusicService.getPlaylists(currentUser.id);
        const withTracks = await Promise.all(
          fetched.map(async (p) => {
            try { return await MusicService.getPlaylistById(p.id); } catch { return p; }
          })
        );
        setPlaylists(withTracks);
      } catch (error) {
        console.error('Failed to load playlists:', error);
      } finally {
        setIsLoadingPlaylists(false);
      }
    };
    loadPlaylists();
  }, [currentUser?.id]);

  useEffect(() => {
    const loadAlbums = async () => {
      if (!currentUser) return;
      setIsLoadingAlbums(true);
      try {
        setAlbums(await AlbumService.getUserAlbums(currentUser.id));
      } catch (error) {
        console.error('Failed to load albums:', error);
        setAlbums([]);
      } finally {
        setIsLoadingAlbums(false);
      }
    };
    loadAlbums();
  }, [currentUser?.id]);

  useEffect(() => {
    const loadConcerts = async () => {
      if (!currentUser) return;
      setIsLoadingConcerts(true);
      try {
        setConcerts(await ConcertService.getUserConcerts(currentUser.id));
      } catch (error) {
        console.error('Failed to load concerts:', error);
        setConcerts([]);
      } finally {
        setIsLoadingConcerts(false);
      }
    };
    loadConcerts();
  }, [currentUser?.id]);

  useEffect(() => {
    const loadPendingRequests = async () => {
      if (!currentUser?.isPrivate) return;
      const requests = await FollowService.getPendingFollowRequestsWithDetails(currentUser.id);
      setPendingRequests(requests);
    };
    loadPendingRequests();
  }, [currentUser?.id]);

  useEffect(() => {
    const loadBookmarks = async () => {
      if (!currentUser) return;
      setIsLoadingBookmarks(true);
      try {
        setBookmarks(await MusicService.getUserBookmarks(currentUser.id));
      } catch (error) {
        console.error('Failed to load bookmarks:', error);
        setBookmarks([]);
      } finally {
        setIsLoadingBookmarks(false);
      }
    };
    loadBookmarks();
  }, [currentUser?.id]);

  useEffect(() => {
    const loadLikedTracks = async () => {
      if (!currentUser) return;
      setIsLoadingLikedTracks(true);
      try {
        setLikedTracks(await MusicService.getUserLikedTracks(currentUser.id));
      } catch (error) {
        console.error('Failed to load liked tracks:', error);
        setLikedTracks([]);
      } finally {
        setIsLoadingLikedTracks(false);
      }
    };
    loadLikedTracks();
  }, [currentUser?.id]);

  const handleShareProfile = useCallback(async () => {
    if (!currentUser) return;
    const url = profileShareUrl(currentUser as any);
    try {
      await Share.share({ message: url, url });
      setProfileLinkCopied(true);
      if (profileLinkCopyTimerRef.current) clearTimeout(profileLinkCopyTimerRef.current);
      profileLinkCopyTimerRef.current = setTimeout(() => setProfileLinkCopied(false), 2200);
    } catch (error) {
      console.error('Failed to share:', error);
    }
  }, [currentUser]);

  const openExternalLinksModal = useCallback(() => {
    const existing = ((currentUser as any)?.externalLinks ?? []).slice(0, 3) as string[];
    setLinkInputs([...existing, '', '', ''].slice(0, 3));
    setShowLinksModal(true);
  }, [currentUser]);

  const handleDeleteTrack = async (trackId: string) => {
    if (!currentUser) return;
    setDeletingTrackId(trackId);
    try {
      await MusicService.deleteTrack(trackId, currentUser.id);
      setUserTracks(prev => prev.filter(t => t.id !== trackId));
    } catch (error) {
      console.error('Failed to delete track:', error);
    } finally {
      setDeletingTrackId(null);
      setShowDeleteConfirm(null);
    }
  };

  const refreshFollowStats = async () => {
    if (!currentUser) return;
    try {
      setFollowStats(await FollowService.getFollowStats(currentUser.id));
    } catch (error) {
      console.error('Failed to refresh follow stats:', error);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    setAcceptDeclineLoadingId(requestId);
    try {
      await FollowService.acceptFollowRequest(requestId);
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
      setFollowStats(prev => ({ ...prev, followers: prev.followers + 1 }));
    } finally {
      setAcceptDeclineLoadingId(null);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    setAcceptDeclineLoadingId(requestId);
    try {
      await FollowService.declineFollowRequest(requestId);
      setPendingRequests(prev => prev.filter(r => r.id !== requestId));
    } finally {
      setAcceptDeclineLoadingId(null);
    }
  };

  const handleEditProfile = () => {
    if (!currentUser) return;
    setEditForm({
      username: currentUser.username,
      email: currentUser.email,
      bio: currentUser.bio || '',
      artistName: currentUser.artistName || '',
      genres: currentUser.genres || [],
      isPrivate: currentUser.isPrivate || false,
      vanityUrl: (currentUser as any).vanityUrl || '',
      bannerUrl: (currentUser as any).bannerUrl || '',
    });
    setVanityError(null);
    setIsEditing(true);
  };

  const handlePickBanner = async () => {
    if (!currentUser) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('profile.errors.photoPermissionTitle'), t('profile.errors.photoPermission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setIsUploadingBanner(true);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const sanitized = (asset.fileName ?? `banner-${Date.now()}.jpg`).replace(/[^a-zA-Z0-9.-]/g, '_');
      const path = `profile-banners/${currentUser.id}/${Date.now()}-${sanitized}`;
      const { data, error } = await supabase.storage
        .from('music-files')
        .upload(path, blob, { contentType: asset.mimeType ?? 'image/jpeg', upsert: false });
      if (error || !data?.path) throw new Error(error?.message ?? t('profile.errors.bannerFailed'));
      const bannerUrl = supabase.storage.from('music-files').getPublicUrl(data.path).data.publicUrl;
      setEditForm(prev => ({ ...prev, bannerUrl }));
    } catch (error) {
      Alert.alert(t('profile.errors.bannerFailedTitle'), error instanceof Error ? error.message : t('common.tryAgain'));
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!currentUser) return;
    setVanityError(null);
    const newVanity = (editForm.vanityUrl || '').trim().toLowerCase() || undefined;
    if (newVanity && newVanity !== (currentUser as any)?.vanityUrl) {
      if (newVanity.length < 3) { setVanityError(t('profile.errors.vanityShort')); return; }
      const available = await ChatService.isVanityUrlAvailable(newVanity, currentUser.id);
      if (!available) { setVanityError(t('profile.errors.vanityTaken')); return; }
    }
    setIsSaving(true);
    try {
      await updateProfile({
        username: editForm.username,
        email: editForm.email,
        bio: editForm.bio,
        artistName: editForm.artistName,
        genres: editForm.genres,
        isPrivate: editForm.isPrivate,
        vanityUrl: newVanity,
        bannerUrl: editForm.bannerUrl || undefined,
      } as any);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save profile:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveLinks = async () => {
    if (!currentUser) return;
    const externalLinks = linkInputs.map(u => u.trim()).filter(Boolean).slice(0, 3);
    setIsSavingLinks(true);
    try {
      const updated = await updateProfile({ externalLinks } as any);
      setShowLinksModal(false);
    } catch (error) {
      console.error('Failed to save links:', error);
    } finally {
      setIsSavingLinks(false);
    }
  };

  const handleOpenFollowers = async () => {
    setShowFollowersModal(true);
    setIsFollowersLoading(true);
    try {
      setFollowersList(await FollowService.getFollowers(currentUser!.id));
    } catch { setFollowersList([]); } finally { setIsFollowersLoading(false); }
  };

  const handleOpenFollowing = async () => {
    setShowFollowingModal(true);
    setIsFollowingListLoading(true);
    try {
      setFollowingList(await FollowService.getFollowing(currentUser!.id));
    } catch { setFollowingList([]); } finally { setIsFollowingListLoading(false); }
  };

  const handleUnfollowFromFollowingList = async (followingId: string) => {
    if (!currentUser) return;
    try {
      await FollowService.unfollowUser(currentUser.id, followingId);
      setFollowingList(prev => prev.filter(u => u.id !== followingId));
      setFollowStats(prev => ({ ...prev, following: Math.max(0, prev.following - 1) }));
    } catch (error) { console.error('Failed to unfollow:', error); }
  };

  const handleRemoveFollower = async (followerId: string) => {
    if (!currentUser) return;
    try {
      await FollowService.unfollowUser(followerId, currentUser.id);
      setFollowersList(prev => prev.filter(u => u.id !== followerId));
      setFollowStats(prev => ({ ...prev, followers: Math.max(0, prev.followers - 1) }));
    } catch (error) { console.error('Failed to remove follower:', error); }
  };

  const handlePlayAlbum = async (album: Album) => {
    try {
      const tracks = await MusicService.getTracksByAlbum(album.id);
      if (tracks.length > 0) playQueue(tracks);
    } catch (error) { console.error('Failed to load album tracks:', error); }
  };

  // Album handlers
  const handleEditAlbum = (album: Album) => {
    setAlbumForm({ title: album.title, artist: album.artist, genre: album.genre, description: album.description || '', price: album.price?.toString() || '' });
    setEditingAlbum(album);
  };

  const handleSaveAlbum = async () => {
    if (!currentUser || !editingAlbum) return;
    try {
      const updated = await AlbumService.updateAlbum(editingAlbum.id, currentUser.id, {
        ...albumForm, price: albumForm.price ? parseFloat(albumForm.price) : undefined,
        cover: editingAlbum.cover || '', userId: currentUser.id,
      });
      setAlbums(prev => prev.map(a => a.id === editingAlbum.id ? updated : a));
      setEditingAlbum(null);
      setAlbumForm({ title: '', artist: '', genre: '', description: '', price: '' });
    } catch (error) { console.error('Failed to save album:', error); }
  };

  const handleDeleteAlbum = async (albumId: string) => {
    if (!currentUser) return;
    try {
      await AlbumService.deleteAlbum(albumId, currentUser.id);
      setAlbums(prev => prev.filter(a => a.id !== albumId));
    } catch (error) { console.error('Failed to delete album:', error); }
  };

  // Concert handlers
  const handleAddConcert = () => {
    if (atConcertLimit) return;
    setConcertForm({ title: '', date: '', location: '', venue: '', description: '', ticketPrice: '', ticketUrl: '', capacity: '' });
    setIsAddingConcert(true);
  };

  const handleEditConcert = (concert: Concert) => {
    setConcertForm({
      title: concert.title, date: concert.date.split('T')[0], location: concert.location,
      venue: concert.venue, description: concert.description || '',
      ticketPrice: concert.ticketPrice?.toString() || '', ticketUrl: concert.ticketUrl || '',
      capacity: concert.capacity?.toString() || '',
    });
    setEditingConcert(concert);
  };

  const handleSaveConcert = async () => {
    if (!currentUser) return;
    if (!concertForm.title.trim()) { Alert.alert(t('common.error'), t('concertForm.needTitle')); return; }
    const dateKey = parseConcertDateInput(concertForm.date);
    if (!dateKey) {
      Alert.alert(t('concertForm.checkDate'), t('concertForm.dateFormat', { example: `${new Date().getFullYear()}-12-31` }));
      return;
    }
    // Past shows never appear anywhere, so don't let a new one be created
    // (editing an old one is still allowed).
    if (!editingConcert && dateKey < todayKey()) {
      Alert.alert(t('concertForm.checkDate'), t('concertForm.datePassed'));
      return;
    }
    if (!concertForm.venue.trim()) { Alert.alert(t('common.error'), t('concertForm.needVenue')); return; }
    if (!concertForm.location.trim()) { Alert.alert(t('common.error'), t('concertForm.needLocation')); return; }
    const ticketUrl = normalizeTicketUrl(concertForm.ticketUrl);
    if (concertForm.ticketUrl.trim() && !ticketUrl) {
      Alert.alert(t('concertForm.checkLink'), t('concertForm.linkFormat'));
      return;
    }
    try {
      const dateValue = `${dateKey}T00:00:00.000Z`;
      const concertData: CreateConcertData = {
        title: concertForm.title.trim(), date: dateValue, location: concertForm.location.trim(),
        venue: concertForm.venue.trim(), description: concertForm.description.trim() || undefined,
        ticketPrice: concertForm.ticketPrice ? parseFloat(concertForm.ticketPrice) : undefined,
        // '' (not undefined) on edit so clearing the field removes the saved link.
        ticketUrl: ticketUrl ?? (editingConcert ? '' : undefined),
        capacity: concertForm.capacity ? parseInt(concertForm.capacity, 10) : undefined,
        userId: currentUser.id,
      };
      if (editingConcert) {
        const updated = await ConcertService.updateConcert(editingConcert.id, currentUser.id, concertData);
        setConcerts(prev => prev.map(c => c.id === editingConcert.id ? updated : c));
        setEditingConcert(null);
      } else {
        const newConcert = await ConcertService.createConcert(concertData);
        setConcerts(prev => [...prev, newConcert].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
        setIsAddingConcert(false);
      }
      setConcertForm({ title: '', date: '', location: '', venue: '', description: '', ticketPrice: '', ticketUrl: '', capacity: '' });
    } catch (error) {
      console.error('Failed to save concert:', error);
      Alert.alert(t('common.error'), error instanceof Error ? error.message : t('concertForm.saveFailed'));
    }
  };

  const handleDeleteConcert = async (concertId: string) => {
    if (!currentUser) return;
    try {
      await ConcertService.deleteConcert(concertId, currentUser.id);
      setConcerts(prev => prev.filter(c => c.id !== concertId));
    } catch (error) { console.error('Failed to delete concert:', error); }
  };

  const handleCancelConcertEdit = () => {
    setEditingConcert(null); setIsAddingConcert(false);
    setConcertForm({ title: '', date: '', location: '', venue: '', description: '', ticketPrice: '', ticketUrl: '', capacity: '' });
  };

  // About handlers
  const handleEditAbout = () => {
    setAboutForm({ bio: currentUser?.bio || '', genres: currentUser?.genres || [] });
    setIsEditingAbout(true);
  };

  const handleSaveAbout = async () => {
    if (!currentUser) return;
    try {
      await updateProfile({ bio: aboutForm.bio, genres: aboutForm.genres });
      setIsEditingAbout(false);
    } catch (error) { console.error('Failed to update about section:', error); }
  };

  const handleAddGenre = (genre: string) => {
    if (genre && !aboutForm.genres.includes(genre)) {
      setAboutForm(prev => ({ ...prev, genres: [...prev.genres, genre] }));
    }
  };

  const handleRemoveGenre = (genre: string) => {
    setAboutForm(prev => ({ ...prev, genres: prev.genres.filter(g => g !== genre) }));
  };

  // ── Early returns ──

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View className="flex-1 items-center justify-center p-6 gap-4">
        <Lock size={64} color="#6b7280" />
        <Text className="text-2xl font-bold text-white">{t('profile.authTitle')}</Text>
        <Text className="text-gray-400 text-center">{t('profile.authBody')}</Text>
      </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View className="flex-1 items-center justify-center gap-3">
        <ActivityIndicator size="large" color="#000000" />
        <Text className="text-black">{t('profile.loading')}</Text>
      </View>
      </SafeAreaView>
    );
  }

  if (!currentUser) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View className="flex-1 items-center justify-center">
        <Text className="text-gray-400">{t('profile.notFound')}</Text>
      </View>
      </SafeAreaView>
    );
  }

  const externalLinks = ((currentUser as any).externalLinks ?? []).filter(Boolean).slice(0, 3) as string[];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
    <View style={{ height: 2, backgroundColor: colors.dark900 }} />
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingBottom: 32 }}>

      {/* Profile Header */}
      <View className="px-4 pt-6 pb-4">

        {/* Banner */}
        {(currentUser as any).bannerUrl && (
          <View className="w-full h-32 rounded-xl overflow-hidden mb-3">
            <Image
              source={{ uri: (currentUser as any).bannerUrl }}
              className="w-full h-full"
              accessibilityLabel={t('profile.banner')}
            />
          </View>
        )}

        {/* Avatar + actions row */}
        <View className="flex-row items-end justify-between mb-4">
          <TouchableOpacity
            onPress={() => { setSettingsInitialTab('account'); setSettingsOpen(true); }}
            accessibilityHint={t('profile.avatarHint')}
            className="relative"
          >
            <Image
              source={{ uri: getAvatarUrl(currentUser.avatar) }}
              className="w-24 h-24 rounded-full border-2 border-dark"
              accessibilityLabel={currentUser.username}
            />
            <View className="absolute bottom-0 right-0 w-7 h-7 bg-dark-700 rounded-full items-center justify-center border-2 border-dark-900">
              {isUploadingAvatar
                ? <ActivityIndicator size="small" color="white" />
                : <Camera size={13} color="white" />
              }
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleEditProfile}
            className="flex-row items-center gap-2 px-4 py-2 bg-primary-600 rounded-full"
          >
            <Edit size={16} color="white" />
            <Text className="text-black font-medium text-sm">{t('profile.editProfile')}</Text>
          </TouchableOpacity>
        </View>

        {/* Name + handle + bio */}
        <View className="mb-3">
          <View className="flex-row items-center gap-2 flex-wrap mb-1">
            <Text className="text-2xl font-bold text-black">{currentUser.username}</Text>
            <VerifiedBadge verified={currentUser.isVerified || (currentUser as any).isVerifiedArtist} size={20} />
            {(currentUser as any).subscriptionTier === 'artist' && (
              <View className="px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/30">
                <Text className="text-black text-xs font-bold">{t('profile.artistBadge')}</Text>
              </View>
            )}
            {currentUser.isPrivate && <Lock size={16} color="#9ca3af" />}
          </View>
          {(currentUser as any).vanityUrl && (
            <View className="flex-row items-center gap-1 mb-1">
              <AtSign size={11} color="#a78bfa" />
              <Text className="text-violet-400 text-xs">{(currentUser as any).vanityUrl}</Text>
            </View>
          )}
          <Text className="text-black text-sm">
            {currentUser.bio || (currentUser.role === 'musician' ? t('profile.musician') : t('profile.listener'))}
          </Text>
        </View>

        {/* Icon actions */}
        <View className="flex-row items-center gap-3 mb-4">
          <TouchableOpacity
            onPress={handleShareProfile}
            className="p-2.5 rounded-full bg-dark-700"
          >
            {profileLinkCopied ? <Check size={20} color="#34d399" /> : <Share2 size={20} color="white" />}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openExternalLinksModal}
            className="p-2.5 rounded-full bg-dark-700"
          >
            <Globe size={20} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSettingsOpen(true)}
            className="p-2.5 rounded-full bg-dark-700"
          >
            <Settings size={20} color="white" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('Playlists')}
            className="p-2.5 rounded-full bg-dark-700"
          >
            <ListMusic size={20} color="white" />
          </TouchableOpacity>

          {IN_APP_TICKETS_ENABLED && (
            <TouchableOpacity
              onPress={() => navigation.navigate('MyTickets')}
              className="p-2.5 rounded-full bg-dark-700"
            >
              <TicketIcon size={20} color="white" />
            </TouchableOpacity>
          )}

          {isCurrentUserPro && (
            <TouchableOpacity
              onPress={() => navigation.navigate('Analytics')}
              className="p-2.5 rounded-full bg-dark-700"
            >
              <BarChart3 size={20} color="white" />
            </TouchableOpacity>
          )}

          {currentUser?.isAdmin && (
            <TouchableOpacity
              onPress={() => navigation.navigate('Admin')}
              className="p-2.5 rounded-full bg-dark-700"
            >
              <Shield size={20} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>

        {/* External links */}
        {externalLinks.length > 0 && (
          <View className="flex-row flex-wrap gap-2 mb-4">
            {externalLinks.map((url, i) => {
              let label = url;
              try { label = new URL(url).hostname.replace(/^www\./, ''); } catch {}
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => Linking.openURL(url).catch(console.error)}
                  className="flex-row items-center gap-1.5 px-3 py-1 rounded-full bg-dark-700"
                >
                  <Globe size={12} color="#9ca3af" />
                  <Text className="text-gray-300 text-xs font-medium" numberOfLines={1}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Follower/Following stats */}
        <View className="flex-row items-center gap-8">
          <TouchableOpacity onPress={handleOpenFollowers} className="flex-row items-center gap-2">
            <View className="w-8 h-8 bg-white rounded-full items-center justify-center">
              <Users size={18} color="#7c3aed" />
            </View>
            <View>
              <Text className="text-xl font-bold text-black">
                {followStats.followers >= 1000
                  ? `${(followStats.followers / 1000).toFixed(1)}K`
                  : followStats.followers}
              </Text>
              <Text className="text-xs text-black">{t('profile.followers')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleOpenFollowing} className="flex-row items-center gap-2">
            <View className="w-8 h-8 bg-white rounded-full items-center justify-center">
              <UserIcon size={18} color="#6b7280" />
            </View>
            <View>
              <Text className="text-xl font-bold text-black">{followStats.following}</Text>
              <Text className="text-xs text-black">{t('profile.following')}</Text>
            </View>
          </TouchableOpacity>

          {pendingRequests.length > 0 && (
            <TouchableOpacity onPress={() => setShowPendingRequestsModal(true)} className="flex-row items-center gap-2">
              <View className="w-8 h-8 bg-white rounded-full items-center justify-center">
                <UserPlus size={18} color="#f59e0b" />
              </View>
              <View>
                <Text className="text-xl font-bold text-black">{pendingRequests.length}</Text>
                <Text className="text-xs text-gray-400">{t('profile.requests')}</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Early Ear */}
      <View className="px-4 mb-4">
        <EarlyEarCard userId={currentUser.id} isOwn />
      </View>

      {/* Tab Navigation */}
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(1,1,1,0.50)', marginBottom: 16 }}>
        {([
          { key: 'music', label: t('profile.tabs.music') },
          ...(currentUser.role === 'musician'
            ? [{ key: 'albums', label: t('profile.tabs.albums') }, { key: 'concerts', label: t('profile.tabs.concerts') }]
            : []),
          { key: 'bookmark', label: t('profile.tabs.bookmarks') },
          { key: 'liked', label: t('profile.tabs.liked') },
        ] as { key: string; label: string }[]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key as any)}
            style={{
              flex: 1,
              paddingVertical: 12,
              alignItems: 'center',
              borderBottomWidth: 2,
              borderBottomColor: activeTab === tab.key ? '#7c3aed' : 'transparent',
            }}
          >
            <Text style={{
              fontSize: 12,
              fontWeight: activeTab === tab.key ? '700' : '400',
              color: activeTab === tab.key ? '#fff' : 'black',
            }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      <View className="px-4">

        {/* ── Music Tab ── */}
        {activeTab === 'music' && (
          <View>
            <View className="flex-row items-center gap-2 mb-4">
              <Music size={20} color="#a78bfa" />
              <Text className="text-xl font-bold text-black">
                {currentUser.role === 'musician' ? t('profile.myMusic') : t('profile.myCollection')}
              </Text>
            </View>
            {isLoadingTracks ? (
              <View className="flex-row items-center justify-center py-8 gap-2">
                <ActivityIndicator size="small" color="#000000" />
                <Text className="text-black">{t('profile.loadingTracks')}</Text>
              </View>
            ) : userTracks.length === 0 ? (
              <View className="items-center py-12">
                <Text className="text-gray-400 mb-2">
                  {currentUser.role === 'musician' ? t('profile.noTracksMusician') : t('profile.noTracksListener')}
                </Text>
                <Text className="text-gray-500 text-sm">
                  {currentUser.role === 'musician' ? t('profile.noTracksMusicianHint') : t('profile.noTracksListenerHint')}
                </Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-4 pl-1 pr-6">
                  {userTracks.map(track => (
                    <View key={track.id} className="w-[180px]">
                      <TrackCard
                        track={track}
                        onDelete={() => handleDeleteTrack(track.id)}
                        compactGrid
                        showActions
                      />
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}

        {activeTab === 'albums' && currentUser.role === 'musician' && (
          <View>
            <View className="flex-row items-center gap-2 mb-4">
              <Music size={20} color="#a78bfa" />
              <Text className="text-xl font-bold text-black">{t('profile.myAlbums')}</Text>
            </View>
            {isLoadingAlbums ? (
              <View className="flex-row items-center justify-center py-8 gap-2">
                <ActivityIndicator size="small" color="#000000" />
                <Text className="text-black">{t('profile.loadingAlbums')}</Text>
              </View>
            ) : albums.length === 0 ? (
              <View className="items-center py-12">
                <Music size={48} color="#4b5563" />
                <Text className="text-black">{t('profile.noAlbums')}</Text>
                <Text className="text-black">{t('profile.noAlbumsHint')}</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-4 pl-1 pr-6">
                  {albums.map(album => (
                    <View key={album.id} className="w-[200px]">
                      {editingAlbum?.id === album.id ? (
                        <View className="bg-dark-800 rounded-lg p-4 border border-dark-700">
                          <View className="gap-3">
                            {[
                              { label: t('profile.albumFields.title'), key: 'title', placeholder: t('profile.albumFields.titlePh') },
                              { label: t('profile.albumFields.artist'), key: 'artist', placeholder: t('profile.albumFields.artistPh') },
                              { label: t('profile.albumFields.genre'), key: 'genre', placeholder: t('profile.albumFields.genrePh') },
                              { label: t('profile.albumFields.price'), key: 'price', placeholder: t('profile.albumFields.pricePh'), numeric: true },
                            ].map(field => (
                              <View key={field.key}>
                                <Text className="text-gray-300 text-xs font-medium mb-1">{field.label}</Text>
                                <TextInput
                                  value={(albumForm as any)[field.key]}
                                  onChangeText={v => setAlbumForm(prev => ({ ...prev, [field.key]: v }))}
                                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-black text-sm"
                                  placeholder={field.placeholder}
                                  placeholderTextColor="#6b7280"
                                  keyboardType={field.numeric ? 'numeric' : 'default'}
                                />
                              </View>
                            ))}
                            <View>
                              <Text className="text-gray-300 text-xs font-medium mb-1">{t('profile.albumFields.description')}</Text>
                              <TextInput
                                value={albumForm.description}
                                onChangeText={v => setAlbumForm(prev => ({ ...prev, description: v }))}
                                className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text- text-sm"
                                placeholder={t('profile.albumFields.description')}
                                placeholderTextColor="#6b7280"
                                multiline
                                numberOfLines={3}
                              />
                            </View>
                            <View className="flex-row gap-2">
                              <TouchableOpacity onPress={handleSaveAlbum} className="flex-1 py-2 bg-primary-600 rounded-lg items-center">
                                <Text className="text-white text-sm">{t('common.save')}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => { setEditingAlbum(null); }} className="flex-1 py-2 bg-dark-700 rounded-lg items-center">
                                <Text className="text-white text-sm">{i18n.t('common.cancel')}</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      ) : (
                        <AlbumCard
                          album={album}
                          onPlay={handlePlayAlbum}
                          onOpen={(a) => navigation.navigate('Artist', { artistId: a.id })}
                          onEdit={handleEditAlbum}
                          onDelete={handleDeleteAlbum}
                          showActions
                        />
                      )}
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}

        {/* ── Concerts Tab ── */}
        {activeTab === 'concerts' && (
          <View>
            <View className="flex-row items-center justify-between mb-4">
              <View className="flex-row items-center gap-2">
                <Calendar size={20} color="#a78bfa" />
                <Text className="text-xl font-bold text-black">{t('profile.myConcerts')}</Text>
              </View>
              <View className="flex-row items-center gap-3">
                {!isCurrentUserPro && (
                  <Text className={`text-xs font-medium ${atConcertLimit ? 'text-amber-500' : 'text-gray-400'}`}>
                    {t('profile.concertsUsed', { count: concerts.length, limit: FREE_CONCERT_LIMIT })}
                  </Text>
                )}
                {atConcertLimit ? (
                  <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <Lock size={13} color="#f59e0b" />
                    <Text className="text-yellow-400 text-sm font-medium">{t('profile.goPro')}</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={handleAddConcert} className="flex-row items-center gap-2 px-3 py-2 bg-primary-600 rounded-lg">
                    <Calendar size={14} color="white" />
                    <Text className="text-white text-sm">{t('profile.addConcert')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {isLoadingConcerts ? (
              <View className="flex-row items-center justify-center py-8 gap-2">
                <ActivityIndicator size="small" color="#000000" />
                <Text className="text-black">{t('profile.loadingConcerts')}</Text>
              </View>
            ) : concerts.length === 0 && !isAddingConcert ? (
              <View className="items-center py-12">
                <Calendar size={48} color="#4b5563" />
                <Text className="text-gray-400 mt-4 mb-2">{t('profile.noConcerts')}</Text>
                <Text className="text-gray-500 text-sm">{t('profile.noConcertsHint')}</Text>
              </View>
            ) : (
              <View className="gap-4">
                {concerts.map(concert => (
                  <View key={concert.id} className="bg-dark-800 rounded-lg p-5 border border-dark-700">
                    {editingConcert?.id === concert.id ? (
                      <ConcertForm form={concertForm} setForm={setConcertForm} onSave={handleSaveConcert} onCancel={handleCancelConcertEdit} label={t('profile.saveChanges')} />
                    ) : (
                      <View>
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1">
                            <Text className="text-lg font-semibold text-white mb-2">{concert.title}</Text>
                            <View className="gap-1.5">
                              <View className="flex-row items-center gap-2">
                                <Calendar size={14} color="#a78bfa" />
                                <Text className="text-gray-300 text-sm">
                                  {formatConcertDate(concert.date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                </Text>
                              </View>
                              <View className="flex-row items-center gap-2">
                                <MapPin size={14} color="#a78bfa" />
                                <Text className="text-gray-300 text-sm">{concert.venue}, {concert.location}</Text>
                              </View>
                              {formatTicketPrice(concert.ticketPrice) ? (
                                <Text className="text-primary-400 font-medium text-sm">{formatTicketPrice(concert.ticketPrice)}</Text>
                              ) : null}
                              {concert.description && (
                                <Text className="text-gray-400 text-sm mt-1">{concert.description}</Text>
                              )}
                            </View>
                            {concert.ticketUrl && (
                              <TouchableOpacity
                                onPress={() => openTicketUrl(concert.ticketUrl)}
                                className="mt-3 px-4 py-2 bg-primary-600 rounded-lg self-start"
                              >
                                <Text className="text-white text-sm">{t('concerts.getTickets')}</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          <View className="flex-row items-center gap-1 ml-3">
                            {IN_APP_TICKETS_ENABLED && !concert.ticketUrl && concert.ticketPrice ? (
                              <TouchableOpacity
                                onPress={() => navigation.navigate('TicketScanner', { concertId: concert.id, concertTitle: concert.title })}
                                className="p-2"
                              >
                                <QrCode size={16} color="#a78bfa" />
                              </TouchableOpacity>
                            ) : null}
                            <TouchableOpacity onPress={() => handleEditConcert(concert)} className="p-2">
                              <Edit size={16} color="#9ca3af" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDeleteConcert(concert.id)} className="p-2">
                              <Trash2 size={16} color="#f87171" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                ))}

                {isAddingConcert && (
                  <View className="bg-dark-800 rounded-lg p-5 border border-dark-700">
                    <Text className="text-lg font-semibold text-white mb-4">{t('profile.addNewConcert')}</Text>
                    <ConcertForm form={concertForm} setForm={setConcertForm} onSave={handleSaveConcert} onCancel={handleCancelConcertEdit} label={t('profile.addConcert')} />
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Bookmarks Tab ── */}
        {activeTab === 'bookmark' && (
          <View>
            <View className="flex-row items-center gap-2 mb-4">
              <Bookmark size={20} color="#a78bfa" />
              <Text className="text-xl font-bold text-black">{t('profile.myBookmarks')}</Text>
            </View>
            {isLoadingBookmarks ? (
              <View className="flex-row items-center justify-center py-8 gap-2">
                <ActivityIndicator size="small" color="#000000" />
                <Text className="text-black">{t('profile.loadingBookmarks')}</Text>
              </View>
            ) : bookmarks.length === 0 ? (
              <View className="items-center py-12">
                <Bookmark size={48} color="#4b5563" />
                <Text className="text-black mt-4 mb-2">{t('profile.noBookmarks')}</Text>
                <Text className="text-black text-sm">{t('profile.noBookmarksHint')}</Text>
              </View>
            ) : (
              <View>
                {bookmarks.length >= 1 && (
                  <TouchableOpacity
                    onPress={() => playQueue(bookmarks)}
                    className="mb-4 px-4 py-2 bg-primary-600 rounded-lg self-start"
                  >
                    <Text className="text-black font-semibold text-sm">
                      {bookmarks.length === 1 ? t('profile.playBookmark') : t('profile.playAllBookmarks')}
                    </Text>
                  </TouchableOpacity>
                )}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-4 pl-1 pr-6">
                    {bookmarks.map(track => (
                      <View key={track.id} className="w-[180px]">
                        <TrackCard track={track} compactGrid />
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {/* ── Liked Tab ── */}
        {activeTab === 'liked' && (
          <View>
            <View className="flex-row items-center gap-2 mb-4">
              <ThumbsUp size={20} color="#a78bfa" />
              <Text className="text-xl font-bold text-black">{t('profile.likedTracks')}</Text>
            </View>
            {isLoadingLikedTracks ? (
              <View className="flex-row items-center justify-center py-8 gap-2">
                <ActivityIndicator size="small" color="#000000" />
                <Text className="text-black">{t('profile.loadingLiked')}</Text>
              </View>
            ) : likedTracks.length === 0 ? (
              <View className="items-center py-12">
                <ThumbsUp size={48} color="#4b5563" />
                <Text className="text-gray-400 mt-4 mb-2">{t('profile.noLiked')}</Text>
                <Text className="text-gray-500 text-sm">{t('profile.noLikedHint')}</Text>
              </View>
            ) : (
              <View>
                {likedTracks.length > 1 && (
                  <TouchableOpacity
                    onPress={() => playQueue(likedTracks)}
                    className="mb-4 px-4 py-2 bg-primary-600 rounded-lg self-start"
                  >
                    <Text className="text-white font-semibold text-sm">{t('profile.playAllLiked')}</Text>
                  </TouchableOpacity>
                )}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-4 pl-1 pr-6">
                    {likedTracks.map(track => (
                      <View key={track.id} className="w-[180px]">
                        <TrackCard track={track} compactGrid />
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {/* ── About Section (always visible) ── */}
        <View className="mt-6">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-2">
              <UserIcon size={20} color="#a78bfa" />
              <Text className="text-xl font-bold text-black">
                {t('profile.about', { name: currentUser.artistName || currentUser.username })}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleEditAbout}
              className="flex-row items-center gap-2 px-3 py-2 bg-primary-600 rounded-lg"
            >
              <Edit size={14} color="white" />
              <Text className="text-white text-sm">{t('profile.edit')}</Text>
            </TouchableOpacity>
          </View>

          {isEditingAbout ? (
            <View className="gap-4">
              <View className="bg-dark-800 rounded-lg p-4">
                <Text className="text-white font-semibold mb-3">{t('profile.biography')}</Text>
                <TextInput
                  value={aboutForm.bio}
                  onChangeText={v => setAboutForm(prev => ({ ...prev, bio: v }))}
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm"
                  placeholder={t('profile.bioPlaceholder')}
                  placeholderTextColor="#6b7280"
                  multiline
                  numberOfLines={4}
                />
              </View>
              <View className="bg-dark-800 rounded-lg p-4">
                <Text className="text-white font-semibold mb-3">{t('profile.musicalGenres')}</Text>
                <View className="flex-row flex-wrap gap-2 mb-3">
                  {aboutForm.genres.map((genre, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => handleRemoveGenre(genre)}
                      className="flex-row items-center gap-1.5 px-3 py-1 bg-primary-600 rounded-full"
                    >
                      <Text className="text-white text-sm">{genreLabel(genre)}</Text>
                      <X size={12} color="white" />
                    </TouchableOpacity>
                  ))}
                </View>
                <Text className="text-gray-400 text-xs mb-2">{t('profile.tapToAdd')}</Text>
                <View className="flex-row flex-wrap gap-2">
                  {GENRES.filter(g => !aboutForm.genres.includes(g)).map(genre => (
                    <TouchableOpacity
                      key={genre}
                      onPress={() => handleAddGenre(genre)}
                      className="px-3 py-1 bg-dark-600 rounded-full border border-dark-500"
                    >
                      <Text className="text-gray-300 text-sm">{genreLabel(genre)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View className="flex-row gap-3">
                <TouchableOpacity onPress={handleSaveAbout} className="flex-1 py-2.5 bg-primary-600 rounded-lg items-center">
                  <Text className="text-white font-semibold">{t('profile.saveChanges')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsEditingAbout(false)} className="flex-1 py-2.5 bg-dark-700 rounded-lg items-center">
                  <Text className="text-white">{t('common.cancel')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View className="gap-4">
              <View className="bg-dark-800 rounded-lg p-4">
                <Text className="text-white font-semibold mb-2">{t('profile.biography')}</Text>
                <Text className="text-gray-300 leading-relaxed">
                  {currentUser.bio || t('profile.bioFallback')}
                </Text>
              </View>
              {(() => {
                const genres = currentUser.genres ?? [];
                if (!Array.isArray(genres) || genres.length === 0) return null;
                return (
                  <View className="bg-dark-800 rounded-lg p-4">
                    <Text className="text-white font-semibold mb-3">{t('profile.favoriteGenres')}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {genres.map((genre, i) => (
                        <View key={i} className="px-3 py-1.5 bg-primary-600 rounded-full">
                          <Text className="text-white text-sm font-medium">{genreLabel(genre)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })()}
              <View className="bg-dark-800 rounded-lg p-4">
                <Text className="text-white font-semibold mb-3">{t('profile.connect')}</Text>
                <View className="flex-row flex-wrap gap-2">
                  <TouchableOpacity
                    onPress={handleShareProfile}
                    className="flex-row items-center gap-2 px-4 py-2 bg-dark-700 rounded-lg"
                  >
                    {profileLinkCopied ? <Check size={16} color="#34d399" /> : <Share2 size={16} color="white" />}
                    <Text className="text-white text-sm">{profileLinkCopied ? t('profile.shared') : t('profile.shareProfile')}</Text>
                  </TouchableOpacity>
                  {isCurrentUserPro && (
                    <TouchableOpacity onPress={openExternalLinksModal}>
                      <Text className="text-primary-400 text-sm py-2">{t('profile.links')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* ── Edit Profile Modal ── */}
      <Modal visible={isEditing} transparent animationType="slide" onRequestClose={() => setIsEditing(false)}>
        <View className="flex-1 bg-black/60 justify-end">
          <ScrollView className="bg-white rounded-t-2xl" style={{ maxHeight: '85%' }}>
            <View className="p-6">
              <Text className="text-xl font-bold text-black mb-4">{t('profile.editProfile')}</Text>
              <View className="gap-4">
                <View>
                  <Text className="text-black font-medium mb-2">{t('profile.username')}</Text>
                  <TextInput
                    value={editForm.username}
                    onChangeText={v => setEditForm(prev => ({ ...prev, username: v }))}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-black text-sm"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                {isCurrentUserPro && (
                  <View>
                    <Text className="text-black font-medium mb-1">
                      {t('profile.vanityUrl')} <Text className="text-yellow-700 text-xs font-bold bg-yellow-100 px-1 rounded">{t('profile.artistBadge')}</Text>
                    </Text>
                    <Text className="text-gray-500 text-xs mb-2">{t('profile.vanityHint')}</Text>
                    <View className="flex-row border border-gray-300 rounded-lg overflow-hidden">
                      <View className="px-3 py-2 bg-gray-50 border-r border-gray-300">
                        <Text className="text-gray-400 text-sm">@</Text>
                      </View>
                      <TextInput
                        value={editForm.vanityUrl || ''}
                        onChangeText={v => setEditForm(prev => ({ ...prev, vanityUrl: v.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30) }))}
                        placeholder="your-handle"
                        placeholderTextColor="#9ca3af"
                        className="flex-1 px-3 py-2 text-black text-sm"
                        autoCapitalize="none"
                      />
                    </View>
                    {vanityError && <Text className="text-red-500 text-xs mt-1">{vanityError}</Text>}
                  </View>
                )}
                {isCurrentUserPro && (
                  <View>
                    <Text className="text-black font-medium mb-1">
                      {t('profile.profileBanner')} <Text className="text-yellow-700 text-xs font-bold bg-yellow-100 px-1 rounded">{t('profile.artistBadge')}</Text>
                    </Text>
                    {editForm.bannerUrl ? (
                      <View className="gap-2">
                        <Image source={{ uri: editForm.bannerUrl }} style={{ width: '100%', height: 80, borderRadius: 8 }} contentFit="cover" />
                        <TouchableOpacity onPress={handlePickBanner} disabled={isUploadingBanner}>
                          <Text className="text-primary-600 text-sm">{isUploadingBanner ? t('profile.uploading') : t('profile.changeBanner')}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={handlePickBanner}
                        disabled={isUploadingBanner}
                        className="border border-dashed border-gray-300 rounded-lg py-4 items-center"
                      >
                        {isUploadingBanner
                          ? <ActivityIndicator size="small" color="#000" />
                          : <Text className="text-gray-500 text-sm">{t('profile.addBanner')}</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                <View>
                  <Text className="text-black font-medium mb-2">{t('profile.bio')}</Text>
                  <TextInput
                    value={editForm.bio}
                    onChangeText={v => setEditForm(prev => ({ ...prev, bio: v }))}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-black text-sm"
                    placeholder={t('profile.bioEditPlaceholder')}
                    placeholderTextColor="#9ca3af"
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </View>
              <View className="flex-row gap-3 mt-6">
                <TouchableOpacity
                  onPress={handleSaveProfile}
                  disabled={isSaving}
                  className={`flex-1 py-2.5 rounded-lg items-center ${isSaving ? 'bg-primary-600/50' : 'bg-primary-600'}`}
                >
                  <Text className="text-white text-sm font-medium">{isSaving ? t('profile.saving') : t('profile.saveChanges')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setIsEditing(false)}
                  className="flex-1 py-2.5 bg-gray-200 rounded-lg items-center"
                >
                  <Text className="text-gray-800 text-sm">{t('common.cancel')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Delete Confirm Modal ── */}
      <Modal visible={!!showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(null)}>
        <View className="flex-1 bg-black/50 items-center justify-center p-4">
          <View className="bg-dark-900 rounded-2xl w-full max-w-sm p-6">
            <Text className="text-xl font-bold text-white mb-3">{t('profile.deleteTrack')}</Text>
            <Text className="text-gray-400 mb-6">{t('profile.deleteTrackBody')}</Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => showDeleteConfirm && handleDeleteTrack(showDeleteConfirm)}
                disabled={deletingTrackId === showDeleteConfirm}
                className={`flex-1 py-2.5 rounded-lg items-center ${deletingTrackId === showDeleteConfirm ? 'bg-red-600/50' : 'bg-red-600'}`}
              >
                <Text className="text-white font-semibold">
                  {deletingTrackId === showDeleteConfirm ? t('profile.deleting') : t('profile.delete')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowDeleteConfirm(null)}
                className="flex-1 py-2.5 bg-dark-700 rounded-lg items-center"
              >
                <Text className="text-white">{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Followers Modal ── */}
      <Modal
        visible={showFollowersModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowFollowersModal(false); setFollowersSearch(''); }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '88%' }}>
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
              <View>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>{t('profile.followers')}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12, marginTop: 2 }}>{t('profile.followersCount', { count: followStats.followers })}</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowFollowersModal(false); setFollowersSearch(''); }} style={{ padding: 6 }}>
                <X size={22} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingHorizontal: 12, height: 40 }}>
              <Search size={16} color="rgba(255,255,255,0.5)" />
              <TextInput
                value={followersSearch}
                onChangeText={setFollowersSearch}
                placeholder={t('profile.searchFollowers')}
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={{ flex: 1, marginLeft: 8, color: '#fff', fontSize: 14 }}
                autoCapitalize="none"
              />
              {followersSearch.length > 0 && (
                <TouchableOpacity onPress={() => setFollowersSearch('')}>
                  <X size={14} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              )}
            </View>
            {isFollowersLoading ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <ActivityIndicator size="large" color="#000000" />
                <Text style={{ color: '#000000', fontSize: 13 }}>{t('profile.loadingShort')}</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
                {followersList.filter(f => !followersSearch || f.username?.toLowerCase().includes(followersSearch.toLowerCase())).length === 0 ? (
                  <View style={{ alignItems: 'center', paddingTop: 56 }}>
                    <Users size={48} color="#374151" strokeWidth={1.5} />
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 16 }}>
                      {followersSearch ? t('profile.noResults') : t('profile.noFollowers')}
                    </Text>
                    <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 6 }}>
                      {followersSearch ? t('profile.noMatch', { query: followersSearch }) : t('profile.shareToGetFollowers')}
                    </Text>
                  </View>
                ) : (
                  followersList
                    .filter(f => !followersSearch || f.username?.toLowerCase().includes(followersSearch.toLowerCase()))
                    .map(f => (
                      <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 }}>
                        <Image source={{ uri: getAvatarUrl(f.avatar) }} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#1f2937', flexShrink: 0 }} accessibilityLabel={f.username} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }} numberOfLines={1}>{f.username}</Text>
                            <VerifiedBadge verified={f.isVerified || f.isVerifiedArtist} size={13} />
                          </View>
                          {f.role ? <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 1, textTransform: 'capitalize' }}>{t(`profile.roles.${f.role}`, { defaultValue: f.role })}</Text> : null}
                        </View>
                        <TouchableOpacity
                          onPress={() => handleRemoveFollower(f.id)}
                          style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
                        >
                          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' }}>{t('profile.remove')}</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Following Modal ── */}
      <Modal
        visible={showFollowingModal}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowFollowingModal(false); setFollowingSearch(''); }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '88%' }}>
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
              <View>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>{t('profile.following')}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12, marginTop: 2 }}>{t('profile.followingCount', { count: followStats.following })}</Text>
              </View>
              <TouchableOpacity onPress={() => { setShowFollowingModal(false); setFollowingSearch(''); }} style={{ padding: 6 }}>
                <X size={22} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, paddingHorizontal: 12, height: 40 }}>
              <Search size={16} color="rgba(255,255,255,0.5)" />
              <TextInput
                value={followingSearch}
                onChangeText={setFollowingSearch}
                placeholder={t('profile.searchFollowing')}
                placeholderTextColor="rgba(255,255,255,0.35)"
                style={{ flex: 1, marginLeft: 8, color: '#fff', fontSize: 14 }}
                autoCapitalize="none"
              />
              {followingSearch.length > 0 && (
                <TouchableOpacity onPress={() => setFollowingSearch('')}>
                  <X size={14} color="rgba(255,255,255,0.4)" />
                </TouchableOpacity>
              )}
            </View>
            {isFollowingListLoading ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <ActivityIndicator size="large" color="#000000" />
                <Text style={{ color: '#000000', fontSize: 13 }}>{t('profile.loadingShort')}</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
                {followingList.filter(f => !followingSearch || f.username?.toLowerCase().includes(followingSearch.toLowerCase())).length === 0 ? (
                  <View style={{ alignItems: 'center', paddingTop: 56 }}>
                    <UserIcon size={48} color="#374151" strokeWidth={1.5} />
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 16 }}>
                      {followingSearch ? t('profile.noResults') : t('profile.notFollowing')}
                    </Text>
                    <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 6 }}>
                      {followingSearch ? t('profile.noMatch', { query: followingSearch }) : t('profile.discoverToFollow')}
                    </Text>
                  </View>
                ) : (
                  followingList
                    .filter(f => !followingSearch || f.username?.toLowerCase().includes(followingSearch.toLowerCase()))
                    .map(f => (
                      <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 }}>
                        <Image source={{ uri: getAvatarUrl(f.avatar) }} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#1f2937', flexShrink: 0 }} accessibilityLabel={f.username} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }} numberOfLines={1}>{f.username}</Text>
                            <VerifiedBadge verified={f.isVerified || f.isVerifiedArtist} size={13} />
                          </View>
                          {f.role ? <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 1, textTransform: 'capitalize' }}>{t(`profile.roles.${f.role}`, { defaultValue: f.role })}</Text> : null}
                        </View>
                        <TouchableOpacity
                          onPress={() => handleUnfollowFromFollowingList(f.id)}
                          style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
                        >
                          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' }}>{t('profile.unfollow')}</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Pending Requests Modal ── */}
      <Modal visible={showPendingRequestsModal} transparent animationType="slide" onRequestClose={() => setShowPendingRequestsModal(false)}>
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-dark-800 rounded-t-2xl" style={{ maxHeight: '60%' }}>
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-700/60">
              <Text className="text-base font-semibold text-white">{t('profile.followRequests')}</Text>
              <TouchableOpacity onPress={() => setShowPendingRequestsModal(false)} className="p-1.5">
                <X size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <ScrollView className="flex-1 px-4 py-3">
              {pendingRequests.length === 0 ? (
                <Text className="text-center text-gray-400 py-8">{t('profile.noRequests')}</Text>
              ) : (
                pendingRequests.map(req => (
                  <FollowRequestCard
                    key={req.id}
                    request={req}
                    onAccept={handleAcceptRequest}
                    onDecline={handleDeclineRequest}
                    isLoading={acceptDeclineLoadingId === req.id}
                  />
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Links Modal ── */}
      <Modal visible={showLinksModal} transparent animationType="slide" onRequestClose={() => setShowLinksModal(false)}>
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-dark-800 rounded-t-2xl">
            <View className="flex-row items-center justify-between px-5 py-4 border-b border-dark-700/60">
              <Text className="text-base font-semibold text-white">{t('profile.linksTitle')}</Text>
              <TouchableOpacity onPress={() => setShowLinksModal(false)} className="p-1.5">
                <X size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <View className="p-5 gap-3">
              <Text className="text-gray-400 text-sm">{t('profile.linksHint')}</Text>
              {linkInputs.map((value, i) => (
                <TextInput
                  key={i}
                  value={value}
                  onChangeText={v => { const next = [...linkInputs]; next[i] = v; setLinkInputs(next); }}
                  placeholder={t('profile.linkN', { n: i + 1 })}
                  placeholderTextColor="#6b7280"
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm"
                  autoCapitalize="none"
                  keyboardType="url"
                />
              ))}
              <View className="flex-row justify-end gap-2 mt-2">
                <TouchableOpacity onPress={() => setShowLinksModal(false)} className="px-4 py-2 rounded-lg bg-dark-600">
                  <Text className="text-white">{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveLinks}
                  disabled={isSavingLinks}
                  className={`px-4 py-2 rounded-lg ${isSavingLinks ? 'bg-primary-600/50' : 'bg-primary-600'}`}
                >
                  <Text className="text-white">{isSavingLinks ? t('profile.saving') : t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Music Player Modal */}
      <MusicPlayerModal
        track={selectedTrack}
        isOpen={isPlayerModalOpen}
        onClose={() => { setIsPlayerModalOpen(false); setSelectedTrack(null); }}
      />

    </ScrollView>
    <SettingsModal isOpen={isSettingsOpen ?? false} />
    </SafeAreaView>
  );
};

// Extracted concert form to avoid repetition
const ConcertForm: React.FC<{
  form: any; setForm: (fn: (prev: any) => any) => void;
  onSave: () => void; onCancel: () => void; label: string;
}> = ({ form, setForm, onSave, onCancel, label }) => (
  <View className="gap-3">
    {[
      { key: 'title', label: i18n.t('concertForm.title'), placeholder: i18n.t('concertForm.titlePh') },
      { key: 'date', label: i18n.t('concertForm.date'), placeholder: `${new Date().getFullYear()}-12-31` },
      { key: 'venue', label: i18n.t('concertForm.venue'), placeholder: i18n.t('concertForm.venuePh') },
      { key: 'location', label: i18n.t('concertForm.location'), placeholder: i18n.t('concertForm.locationPh') },
      { key: 'ticketPrice', label: i18n.t('concertForm.price'), placeholder: i18n.t('concertForm.pricePh'), numeric: true },
      ...(IN_APP_TICKETS_ENABLED
        ? [{ key: 'capacity', label: i18n.t('concertForm.capacity'), placeholder: i18n.t('concertForm.capacityPh'), numeric: true }]
        : []),
      {
        key: 'ticketUrl',
        label: i18n.t('concertForm.url'),
        placeholder: IN_APP_TICKETS_ENABLED ? i18n.t('concertForm.urlPhInApp') : i18n.t('concertForm.urlPh'),
        url: true,
      },
    ].map(field => (
      <View key={field.key}>
        <Text className="text-gray-300 text-xs font-medium mb-1">{field.label}</Text>
        <TextInput
          value={form[field.key]}
          onChangeText={(v: string) => setForm((prev: any) => ({ ...prev, [field.key]: v }))}
          className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm"
          placeholder={field.placeholder}
          placeholderTextColor="#6b7280"
          keyboardType={field.numeric ? 'numeric' : field.url ? 'url' : 'default'}
          autoCapitalize="none"
        />
      </View>
    ))}
    <View>
      <Text className="text-gray-300 text-xs font-medium mb-1">{i18n.t('concertForm.description')}</Text>
      <TextInput
        value={form.description}
        onChangeText={(v: string) => setForm((prev: any) => ({ ...prev, description: v }))}
        className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm"
        placeholder={i18n.t('concertForm.descriptionPh')}
        placeholderTextColor="#6b7280"
        multiline
        numberOfLines={3}
      />
    </View>
    <View className="flex-row gap-3 mt-1">
      <TouchableOpacity onPress={onSave} className="flex-1 py-2.5 bg-primary-600 rounded-lg items-center">
        <Text className="text-white font-semibold text-sm">{label}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancel} className="flex-1 py-2.5 bg-dark-700 rounded-lg items-center">
        <Text className="text-white text-sm">{i18n.t('common.cancel')}</Text>
      </TouchableOpacity>
    </View>
  </View>
);

export default Profile;
