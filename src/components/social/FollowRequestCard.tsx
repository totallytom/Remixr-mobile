import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Check, X, Clock } from 'lucide-react-native';
import { getAvatarUrl } from '../../utils/avatar';
import VerifiedBadge from '../VerifiedBadge';

export interface FollowRequestCardProps {
  request: {
    id: string;
    requesterId: string;
    createdAt: Date;
    user: {
      id: string;
      username: string;
      avatar: string;
      role: string;
      artistName: string;
      isVerified: boolean;
      isVerifiedArtist?: boolean;
      bio: string;
    };
  };
  onAccept: (requestId: string) => void;
  onDecline: (requestId: string) => void;
  isLoading?: boolean;
}

const formatDate = (date: Date) => {
  const now = new Date();
  const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
};

const FollowRequestCard: React.FC<FollowRequestCardProps> = ({
  request,
  onAccept,
  onDecline,
  isLoading = false,
}) => (
  <View style={styles.card}>
    <View style={styles.row}>
      {/* Avatar */}
      <Image
        source={{ uri: getAvatarUrl(request.user.avatar) }}
        style={styles.avatar}
        resizeMode="cover"
      />

      {/* Info */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.displayName} numberOfLines={1}>
            {request.user.artistName || request.user.username}
          </Text>
          <VerifiedBadge
            verified={request.user.isVerified || request.user.isVerifiedArtist}
            size={14}
          />
        </View>
        <Text style={styles.username}>@{request.user.username}</Text>
        {request.user.bio ? (
          <Text style={styles.bio} numberOfLines={2}>{request.user.bio}</Text>
        ) : null}
        <View style={styles.timeRow}>
          <Clock size={12} color="#6b7280" />
          <Text style={styles.timeText}>{formatDate(request.createdAt)}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => onAccept(request.id)}
          disabled={isLoading}
          style={[styles.actionBtn, styles.acceptBtn, isLoading && styles.disabled]}
          activeOpacity={0.8}
        >
          <Check size={16} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onDecline(request.id)}
          disabled={isLoading}
          style={[styles.actionBtn, styles.declineBtn, isLoading && styles.disabled]}
          activeOpacity={0.8}
        >
          <X size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#374151',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#374151',
    flexShrink: 0,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  displayName: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
    flexShrink: 1,
  },
  username: {
    color: '#6b7280',
    fontSize: 13,
    marginBottom: 4,
  },
  bio: {
    color: '#9ca3af',
    fontSize: 13,
    marginBottom: 6,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    color: '#6b7280',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: { backgroundColor: '#16a34a' },
  declineBtn: { backgroundColor: '#dc2626' },
  disabled: { opacity: 0.5 },
});

export default FollowRequestCard;
