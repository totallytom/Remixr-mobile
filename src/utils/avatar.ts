export const DEFAULT_AVATAR_URL = '/default-avatar.jpg';

export const getAvatarUrl = (avatar?: string | null): string => {
  if (typeof avatar === 'string' && avatar.trim().length > 0) {
    return avatar;
  }

  return DEFAULT_AVATAR_URL;
};
