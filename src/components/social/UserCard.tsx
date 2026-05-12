import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { UserPlus } from 'lucide-react-native';
import VerifiedBadge from '../VerifiedBadge';

interface UserCardProps {
  user: {
    id: string;
    username: string;
    followers?: number;
    isVerified?: boolean;
    isVerifiedArtist?: boolean;
  };
  onFollow?: (userId: string) => void;
}

const UserCard: React.FC<UserCardProps> = ({ user, onFollow }) => (
  <View style={styles.card}>
    <View style={styles.info}>
      <View style={styles.nameRow}>
        <Text style={styles.username} numberOfLines={1}>{user.username}</Text>
        <VerifiedBadge verified={user.isVerified || user.isVerifiedArtist} size={14} />
      </View>
      <Text style={styles.followers}>{user.followers ?? 0} followers</Text>
    </View>

    <TouchableOpacity
      onPress={() => onFollow?.(user.id)}
      style={styles.followBtn}
      activeOpacity={0.8}
    >
      <UserPlus size={16} color="#fff" />
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  username: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  followers: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },
  followBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

export default UserCard; 