import React from 'react';
import { CheckCircle } from 'lucide-react-native';

interface VerifiedBadgeProps {
  verified?: boolean;
  size?: number;
  color?: string;
}

export default function VerifiedBadge({ verified, size = 18, color = '#8b5cf6' }: VerifiedBadgeProps) {
  if (!verified) return null;
  return <CheckCircle size={size} color={color} />;
}
