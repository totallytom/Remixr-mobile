import React from 'react';
import { View, Pressable, Text, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  Home,
  Search,
  RadioReceiver,
  MessageCircle,
  ListMusic,
  User,
  Upload,
} from 'lucide-react-native';
import HomeStack from './stacks/HomeStack';
import DiscoverStack from './stacks/DiscoverStack';
import SearchStack from './stacks/SearchStack';
import ChatStack from './stacks/ChatStack';
import PlaylistsStack from './stacks/PlaylistsStack';
import ProfileStack from './stacks/ProfileStack';
import UploadStack from './stacks/UploadStack';

export type MainTabsParamList = {
  HomeTab: undefined;
  SearchTab: undefined;
  DiscoverTab: undefined;
  UploadTab: undefined;
  PlaylistsTab: undefined;
  ChatTab: undefined;
  ProfileTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

const ACTIVE_COLOR = '#8aec9f';
const INACTIVE_COLOR = 'rgba(255,255,255,0.6)';
const TAB_HEIGHT = 56;

function UploadTabButton({ onPress, accessibilityState }: any) {
  const focused = accessibilityState?.selected;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 44,
        minHeight: 44,
      }}
      android_ripple={{ color: 'transparent', borderless: true }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 16,
          backgroundColor: '#f97316',
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: focused ? 1.1 : 1 }],
          shadowColor: '#f97316',
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
          color: focused ? '#f97316' : INACTIVE_COLOR,
          marginTop: 2,
        }}
      >
        Upload
      </Text>
    </Pressable>
  );
}

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarStyle: {
          height: TAB_HEIGHT,
          backgroundColor: 'rgba(18, 18, 18, 0.95)',
          borderTopColor: '#1f2937',
          borderTopWidth: 1,
          paddingHorizontal: 4,
          paddingTop: 0,
          paddingBottom: 0,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '500',
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
            case 'SearchTab':    return <Search size={size} strokeWidth={strokeWidth} color={color} />;
            case 'DiscoverTab':  return <RadioReceiver size={size} strokeWidth={strokeWidth} color={color} />;
            case 'PlaylistsTab': return <ListMusic size={size} strokeWidth={strokeWidth} color={color} />;
            case 'ChatTab':      return <MessageCircle size={size} strokeWidth={strokeWidth} color={color} />;
            case 'ProfileTab':   return <User size={size} strokeWidth={strokeWidth} color={color} />;
            default:             return null;
          }
        },
      })}
    >
      <Tab.Screen name="HomeTab"      component={HomeStack}      options={{ title: 'Home' }} />
      <Tab.Screen name="SearchTab"    component={SearchStack}    options={{ title: 'Search' }} />
      <Tab.Screen name="DiscoverTab"  component={DiscoverStack}  options={{ title: 'Discover' }} />
      <Tab.Screen
        name="UploadTab"
        component={UploadStack}
        options={{
          title: 'Upload',
          tabBarButton: (props) => <UploadTabButton {...props} />,
        }}
      />
      <Tab.Screen name="PlaylistsTab" component={PlaylistsStack} options={{ title: 'Playlists' }} />
      <Tab.Screen name="ChatTab"      component={ChatStack}      options={{ title: 'Chat' }} />
      <Tab.Screen name="ProfileTab"   component={ProfileStack}   options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
