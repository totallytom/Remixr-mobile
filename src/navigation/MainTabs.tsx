import React from 'react';
import { View, Pressable, Text, TouchableOpacity, Image, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Home,
  RadioReceiver,
  MessageCircle,
  Rss,
  User,
  Upload,
  Search,
  Play,
  Pause,
  Music2,
  Ticket,
} from 'lucide-react-native';
import { hap } from '../utils/haptics';
import { FONTS } from '../utils/fonts';
import { colors } from '../theme';
import { useStore } from '../store/useStore';
import { useTranslation } from 'react-i18next';
import MusicPlayer from '../components/player/MusicPlayer';
import HomeStack from './stacks/HomeStack';
import SearchStack from './stacks/SearchStack';
import DiscoverStack from './stacks/DiscoverStack';
import ChatStack from './stacks/ChatStack';
import FeedStack from './stacks/FeedStack';
import ProfileStack from './stacks/ProfileStack';
import UploadStack from './stacks/UploadStack';
import ConcertStack from './stacks/ConcertStack';
import { GuestBanner, GuestPromptHost, GUEST_BANNER_HEIGHT } from '../components/auth/GuestPrompt';
import { GuestChatGate, GuestUploadGate } from '../screens/auth/GuestGateScreen';
import CalledItHost from '../components/earlyEar/CalledItHost';

// Upload and Chat need an account; guests see a sign-in screen in their place.
function UploadTabScreen() {
  const isAuthenticated = useStore((s: any) => s.isAuthenticated);
  return isAuthenticated ? <UploadStack /> : <GuestUploadGate />;
}
function ChatTabScreen() {
  const isAuthenticated = useStore((s: any) => s.isAuthenticated);
  return isAuthenticated ? <ChatStack /> : <GuestChatGate />;
}

export type MainTabsParamList = {
  HomeTab: undefined;
  DiscoverTab: undefined;
  ConcertTab: undefined;
  UploadTab: undefined;
  SearchTab: undefined;
  FeedTab: undefined;
  ChatTab: undefined;
  ProfileTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

const ACTIVE_COLOR = colors.primary;
const INACTIVE_COLOR = colors.textInactive;
const TAB_BAR_BORDER = colors.border;
const TAB_HEIGHT = 56;

function UploadTabButton({ onPress, accessibilityState }: any) {
  const { t } = useTranslation();
  const focused = accessibilityState?.selected;
  return (
    <Pressable
      onPress={() => { hap.tap(); onPress?.(); }}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 44,
        minHeight: 44,
      }}
      android_ripple={{ color: 'transparent', borderless: true }}
      accessibilityRole="tab"
      accessibilityLabel={t('nav.upload')}
      accessibilityState={{ selected: focused }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 16,
          backgroundColor: '#00FFF0',
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: focused ? 1.1 : 1 }],
          shadowColor: colors.accent,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <Upload size={22} strokeWidth={2.2} color="#ffffff" />
      </View>
      <Text
        style={{
          fontSize: 9,
          fontWeight: '500',
          fontFamily: FONTS.body,
          color: focused ? colors.accent : INACTIVE_COLOR,
          marginTop: 2,
        }}
      >
        {t('nav.upload')}
      </Text>
    </Pressable>
  );
}

export default function MainTabs() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { player, pauseTrack, resumeTrack, skipToNext, skipToPrevious, seekTo, togglePlayerVisibility, isConversationOpen, isAuthenticated } = useStore() as any;
  // Guests get a sign-in strip above the tab bar; the mini player sits above it.
  const bannerH = isAuthenticated ? 0 : GUEST_BANNER_HEIGHT;

  return (
    <View style={{ flex: 1 }}>
    <Tab.Navigator
      sceneContainerStyle={{ backgroundColor: colors.background }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarStyle: {
          // Conversations are full-screen, like other messaging apps.
          ...(route.name === 'ChatTab' && isConversationOpen ? { display: 'none' as const } : null),
          height: TAB_HEIGHT + insets.bottom,
          backgroundColor: '#000000',
          borderTopColor: '#000000',
          borderTopWidth: 1,
          paddingHorizontal: 4,
          paddingTop: 0,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '500',
          fontFamily: FONTS.body,
          marginBottom: Platform.OS === 'android' ? 4 : 2,
        },
        tabBarIconStyle: {
          marginTop: 6,
        },
        tabBarItemStyle: {
          minWidth: 44,
          minHeight: 44,
        },
        tabBarIcon: ({ focused, color }) => {
          const strokeWidth = focused ? 2.5 : 1.8;
          const size = 20;
          switch (route.name) {
            case 'HomeTab':      return <Home size={size} strokeWidth={strokeWidth} color={color} />;
            case 'DiscoverTab':  return <RadioReceiver size={size} strokeWidth={strokeWidth} color={color} />;
            case 'ConcertTab':   return <Ticket size={size} strokeWidth={strokeWidth} color={color} />;
            case 'FeedTab':      return <Rss size={size} strokeWidth={strokeWidth} color={color} />;
            case 'SearchTab':    return <Search size={size} strokeWidth={strokeWidth} color={color} />;
            case 'ChatTab':      return <MessageCircle size={size} strokeWidth={strokeWidth} color={color} />;
            case 'ProfileTab':   return <User size={size} strokeWidth={strokeWidth} color={color} />;
            default:             return null;
          }
        },
      })}
    >
      <Tab.Screen name="HomeTab"      component={HomeStack}      options={{ title: t('nav.home') }} />
      <Tab.Screen name="DiscoverTab"  component={DiscoverStack}  options={{ title: t('nav.discover') }} />
      <Tab.Screen name="ConcertTab"   component={ConcertStack}   options={{ title: t('nav.concerts') }} />
      <Tab.Screen
        name="UploadTab"
        component={UploadTabScreen}
        options={{
          title: t('nav.upload'),
          tabBarButton: (props) => <UploadTabButton {...props} />,
        }}
      />
      <Tab.Screen name="FeedTab" component={FeedStack} options={{ title: t('nav.feed') }} />
      <Tab.Screen name="ChatTab"      component={ChatTabScreen}      options={{ title: t('nav.chat') }} />
      <Tab.Screen name="ProfileTab"   component={ProfileStack}   options={{ title: t('nav.profile') }} />
    </Tab.Navigator>

    {!isAuthenticated && (
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: TAB_HEIGHT + insets.bottom }}>
        <GuestBanner />
      </View>
    )}
    <GuestPromptHost />
    <CalledItHost />

    {/* Mini player bar, docked just above the tab bar. Hidden in an open
        conversation (no tab bar to dock to; playback continues). */}
    {!isConversationOpen && (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: TAB_HEIGHT + insets.bottom + bannerH }}>
      <MusicPlayer
        currentTrack={player.currentTrack}
        isPlaying={player.isPlaying}
        onPlayPause={() => (player.isPlaying ? pauseTrack() : resumeTrack())}
        onNext={skipToNext}
        onPrevious={skipToPrevious}
        onSeek={seekTo}
        currentTime={player.currentTime}
        duration={player.duration}
        visible={player.visible}
        onToggleVisibility={togglePlayerVisibility}
      />
    </View>
    )}

    {/* Restore pill — shown when a track is loaded but the player is hidden */}
    {!isConversationOpen && player.currentTrack && !player.visible && (
      <TouchableOpacity
        onPress={() => { hap.tap(); togglePlayerVisibility(); }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t(player.isPlaying ? 'player.pillNowPlaying' : 'player.pillPaused', { title: player.currentTrack?.title ?? '', artist: player.currentTrack?.artist ?? '' })}
        accessibilityHint={t('player.showHint')}
        style={{
          position: 'absolute',
          bottom: TAB_HEIGHT + insets.bottom + bannerH + 8,
          alignSelf: 'center',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 8,
          paddingLeft: 8,
          paddingRight: 14,
          backgroundColor: '#1f2937',
          borderRadius: 999,
          borderWidth: 1,
          borderColor: '#374151',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        {player.currentTrack.cover ? (
          <Image
            source={{ uri: player.currentTrack.cover }}
            style={{ width: 32, height: 32, borderRadius: 16 }}
          />
        ) : (
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' }}>
            <Music2 size={16} color="#9ca3af" />
          </View>
        )}
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', maxWidth: 160 }} numberOfLines={1}>
          {player.currentTrack.title}
        </Text>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#0ea5e9', alignItems: 'center', justifyContent: 'center' }}>
          {player.isPlaying
            ? <Pause size={14} color="#fff" />
            : <Play size={14} color="#fff" />}
        </View>
      </TouchableOpacity>
    )}
    </View>
  );
}
