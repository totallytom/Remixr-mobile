import React from 'react';
import { User } from '../../store/useStore';
import { User as UserIcon, UserPlus } from 'lucide-react';
import VerifiedBadge from '../VerifiedBadge';

interface UserCardProps {
  user: User;
}

const UserCard: React.FC<UserCardProps> = ({ user }) => {
  return (
    <div className="flex items-center space-x-4 p-4 bg-dark-800 rounded-lg card-hover">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-black truncate font-kotra flex items-center gap-1.5">
          {user.username}
          <VerifiedBadge verified={user.isVerified || user.isVerifiedArtist} size={14} />
        </div>
        <div className="text-xs text-dark truncate font-kyobo">
          {user.followers} followers
        </div>
      </div>
      <button className="p-2 rounded-full bg-primary-600 text-white hover:bg-primary-700 transition-colors">
        <UserPlus size={16} />
      </button>
    </div>
  );
};

export default UserCard; 