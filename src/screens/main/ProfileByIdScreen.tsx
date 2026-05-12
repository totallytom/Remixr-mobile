import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { ChatService } from '../../services/chatService';
import { followService } from '../../services/followService';
import { useStore } from '../../store/useStore';

type ProfileByIdRouteProp = RouteProp<
  { ProfileById: { userId?: string; handle?: string } },
  'ProfileById'
>;

export function ProfileByIdScreen() {
  const route = useRoute<ProfileByIdRouteProp>();
  const { userId, handle } = route.params ?? {};
  const { user: currentUser } = useStore();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = handle
          ? await ChatService.getProfileByVanityUrl(handle)
          : await ChatService.getProfileBySlug(userId!);
        setProfile(data);

        if (currentUser && data) {
          const status = await followService.getFollowStatus(currentUser.id, data.id);
          setIsFollowing(status.isFollowing);
        }
      } catch (err) {
        console.error('Failed to load profile', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId, handle]);

  const handleFollowToggle = async () => {
    if (!currentUser || !profile) return;
    if (isFollowing) {
      await followService.unfollowUser(currentUser.id, profile.id);
      setIsFollowing(false);
    } else {
      await followService.followUser(currentUser.id, profile.id);
      setIsFollowing(true);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#f97316" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Profile not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        <Text style={styles.username}>{profile.username}</Text>
        {profile.role && (
          <Text style={styles.role}>{profile.role}</Text>
        )}
        <TouchableOpacity
          style={[styles.followButton, isFollowing && styles.followingButton]}
          onPress={handleFollowToggle}
        >
          <Text style={styles.followButtonText}>
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
  },
  errorText: {
    color: '#6b7280',
    fontSize: 14,
  },
  header: {
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#111111',
  },
  username: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  role: {
    color: '#6b7280',
    fontSize: 13,
    textTransform: 'capitalize',
  },
  followButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f97316',
  },
  followingButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#f97316',
  },
  followButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
});
