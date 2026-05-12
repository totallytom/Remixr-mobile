import { supabase } from './supabase';

export interface FollowRelationship {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: Date;
}

export interface FollowStats {
  followers: number;
  following: number;
  isFollowing: boolean;
}

export class FollowService {
  // Follow a user
  static async followUser(followerId: string, followingId: string): Promise<void> {
    try {
      // Check if target is private
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('is_private')
        .eq('id', followingId)
        .maybeSingle();
      
      if (userError) {
        console.error('Error checking user privacy:', userError);
        throw new Error(`Failed to check user privacy: ${userError.message}`);
      }
      
      if (user && user.is_private) {
        // If private, create a follow request instead
        return this.requestFollow(followerId, followingId);
      }

      // Check if already following
      const { data: existingFollow, error: checkError } = await supabase
        .from('user_follows')
        .select('*')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .maybeSingle();

      if (checkError && !checkError.message.includes('No rows found')) {
        throw new Error(`Failed to check follow status: ${checkError.message}`);
      }

      if (existingFollow) {
        throw new Error('Already following this user');
      }

      // Create follow relationship with followed_at timestamp
      const { error: followError } = await supabase
        .from('user_follows')
        .insert([{
          follower_id: followerId,
          following_id: followingId,
          followed_at: new Date().toISOString()
        }]);

      if (followError) {
        throw new Error(`Failed to follow user: ${followError.message}`);
      }

      // Update follower counts
      await this.updateFollowerCounts(followerId, followingId, 1);
    } catch (error) {
      console.error('Error following user:', error);
      throw error;
    }
  }

  // Unfollow a user
  static async unfollowUser(followerId: string, followingId: string): Promise<void> {
    try {
      // Delete follow relationship
      const { error: unfollowError } = await supabase
        .from('user_follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', followingId);

      if (unfollowError) {
        throw new Error(`Failed to unfollow user: ${unfollowError.message}`);
      }

      // Update follower counts
      await this.updateFollowerCounts(followerId, followingId, -1);
    } catch (error) {
      console.error('Error unfollowing user:', error);
      throw error;
    }
  }

  // Check if user is following another user
  static async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('user_follows')
        .select('*')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .maybeSingle();

      if (error && !error.message.includes('No rows found')) {
        throw new Error(`Failed to check follow status: ${error.message}`);
      }

      return !!data;
    } catch (error) {
      console.error('Error checking follow status:', error);
      return false;
    }
  }

  // Get follow statistics for a user
  static async getFollowStats(userId: string, currentUserId?: string): Promise<FollowStats> {
    try {
      const [
        { count: followersCount, error: followersError },
        { count: followingCount, error: followingError },
        isFollowingResult,
      ] = await Promise.all([
        supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', userId),
        supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('follower_id', userId),
        currentUserId && currentUserId !== userId
          ? this.isFollowing(currentUserId, userId)
          : Promise.resolve(false),
      ]);

      if (followersError) throw new Error(`Failed to get followers count: ${followersError.message}`);
      if (followingError) throw new Error(`Failed to get following count: ${followingError.message}`);

      return {
        followers: followersCount || 0,
        following: followingCount || 0,
        isFollowing: isFollowingResult as boolean,
      };
    } catch (error) {
      console.error('Error getting follow stats:', error);
      return { followers: 0, following: 0, isFollowing: false };
    }
  }

  // Get list of users following a specific user
  static async getFollowers(userId: string, limit: number = 20, offset: number = 0): Promise<any[]> {
    try {
      const { data: followers, error } = await supabase
        .from('user_follows')
        .select('follower_id, followed_at')
        .eq('following_id', userId)
        .order('followed_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw new Error(`Failed to get followers: ${error.message}`);
      if (!followers?.length) return [];

      const ids = followers.map((f: any) => f.follower_id);
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, username, avatar, role, artist_name, is_verified, is_verified_artist')
        .in('id', ids);

      if (usersError) throw new Error(`Failed to get follower users: ${usersError.message}`);

      const userMap = new Map((users || []).map((u: any) => [u.id, u]));
      return followers.map((f: any) => {
        const u: any = userMap.get(f.follower_id) || {};
        return {
          id: f.follower_id,
          username: u.username || 'Unknown',
          avatar: u.avatar || '',
          role: u.role || '',
          artistName: u.artist_name || '',
          isVerified: u.is_verified || false,
          isVerifiedArtist: u.is_verified_artist ?? false,
          followedAt: new Date(f.followed_at),
        };
      });
    } catch (error) {
      console.error('Error getting followers:', error);
      return [];
    }
  }

  // Get list of users that a specific user is following
  static async getFollowing(userId: string, limit: number = 20, offset: number = 0): Promise<any[]> {
    try {
      const { data: following, error } = await supabase
        .from('user_follows')
        .select('following_id, followed_at')
        .eq('follower_id', userId)
        .order('followed_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw new Error(`Failed to get following: ${error.message}`);
      if (!following?.length) return [];

      const ids = following.map((f: any) => f.following_id);
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, username, avatar, role, artist_name, is_verified, is_verified_artist')
        .in('id', ids);

      if (usersError) throw new Error(`Failed to get following users: ${usersError.message}`);

      const userMap = new Map((users || []).map((u: any) => [u.id, u]));
      return following.map((f: any) => {
        const u: any = userMap.get(f.following_id) || {};
        return {
          id: f.following_id,
          username: u.username || 'Unknown',
          avatar: u.avatar || '',
          role: u.role || '',
          artistName: u.artist_name || '',
          isVerified: u.is_verified || false,
          isVerifiedArtist: u.is_verified_artist ?? false,
          followedAt: new Date(f.followed_at),
        };
      });
    } catch (error) {
      console.error('Error getting following:', error);
      return [];
    }
  }

  // Request to follow a private account
  static async requestFollow(requesterId: string, targetId: string): Promise<void> {
    const { error } = await supabase
      .from('follow_requests')
      .insert([{ requester_id: requesterId, target_id: targetId }]);
    if (error) throw new Error(error.message);
  }

  // Cancel a follow request
  static async cancelFollowRequest(requesterId: string, targetId: string): Promise<void> {
    const { error } = await supabase
      .from('follow_requests')
      .delete()
      .eq('requester_id', requesterId)
      .eq('target_id', targetId);
    if (error) throw new Error(error.message);
  }

  // Check if a follow request exists
  static async getFollowRequestStatus(requesterId: string, targetId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('follow_requests')
      .select('*')
      .eq('requester_id', requesterId)
      .eq('target_id', targetId)
      .maybeSingle();
    if (error && !error.message.includes('No rows found')) throw new Error(error.message);
    return !!data;
  }

  // Get all pending follow requests for a user (for owner to review)
  static async getPendingFollowRequests(targetId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('follow_requests')
      .select('id, requester_id, created_at')
      .eq('target_id', targetId);
    if (error) throw new Error(error.message);
    return data || [];
  }

  // Get all pending follow requests with user details
  static async getPendingFollowRequestsWithDetails(targetId: string): Promise<any[]> {
    try {
      const { data: requests, error } = await supabase
        .from('follow_requests')
        .select('id, requester_id, created_at')
        .eq('target_id', targetId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      if (!requests?.length) return [];

      const ids = requests.map((r: any) => r.requester_id);
      const { data: users } = await supabase
        .from('users')
        .select('id, username, avatar, role, artist_name, is_verified, is_verified_artist, bio')
        .in('id', ids);

      const userMap = new Map((users || []).map((u: any) => [u.id, u]));
      return requests.map((req: any) => {
        const u: any = userMap.get(req.requester_id) || {};
        return {
          id: req.id,
          requesterId: req.requester_id,
          createdAt: new Date(req.created_at),
          user: {
            id: req.requester_id,
            username: u.username || 'Unknown User',
            avatar: u.avatar || '',
            role: u.role || '',
            artistName: u.artist_name || '',
            isVerified: u.is_verified || false,
            isVerifiedArtist: u.is_verified_artist ?? false,
            bio: u.bio || '',
          },
        };
      });
    } catch (error) {
      console.error('Error getting pending follow requests with details:', error);
      return [];
    }
  }

  // Accept a follow request (creates follow in user_follows, removes request).
  // Once in user_follows, the follower is treated as "following" and can view the private profile.
  static async acceptFollowRequest(requestId: string): Promise<void> {
    try {
      // Get the request
      const { data: request, error: reqError } = await supabase
        .from('follow_requests')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();
      if (reqError || !request) throw new Error(reqError?.message || 'Request not found');

      // Check if already following to avoid duplicates
      const { data: existingFollow, error: checkError } = await supabase
        .from('user_follows')
        .select('*')
        .eq('follower_id', request.requester_id)
        .eq('following_id', request.target_id)
        .maybeSingle();
      if (checkError && !checkError.message.includes('No rows found')) {
        throw new Error(`Failed to check follow status: ${checkError.message}`);
      }
      if (existingFollow) {
        // Already following, just remove the request
        const { error: deleteError } = await supabase
          .from('follow_requests')
          .delete()
          .eq('id', requestId);
        if (deleteError) {
          throw new Error(`Failed to remove request: ${deleteError.message}`);
        }
        return;
      }

      // Create follow relationship with followed_at timestamp
      const { error: followError } = await supabase
        .from('user_follows')
        .insert([{ 
          follower_id: request.requester_id, 
          following_id: request.target_id,
          followed_at: new Date().toISOString()
        }]);
      if (followError) throw new Error(`Failed to create follow relationship: ${followError.message}`);

      // Update follower counts
      await this.updateFollowerCounts(request.requester_id, request.target_id, 1);

      // Remove request
      const { error: deleteError } = await supabase
        .from('follow_requests')
        .delete()
        .eq('id', requestId);
      if (deleteError) {
        throw new Error(`Failed to remove request: ${deleteError.message}`);
      }
    } catch (error) {
      console.error('Error accepting follow request:', error);
      throw error;
    }
  }

  // Decline a follow request (removes request)
  static async declineFollowRequest(requestId: string): Promise<void> {
    const { error } = await supabase.from('follow_requests').delete().eq('id', requestId);
    if (error) throw new Error(error.message);
  }

  // Update follower counts in users table
  private static async updateFollowerCounts(followerId: string, followingId: string, increment: number): Promise<void> {
    try {
      // Fetch both current counts in parallel
      const [
        { data: followerUser, error: followerError },
        { data: followingUser, error: followingUserError },
      ] = await Promise.all([
        supabase.from('users').select('following').eq('id', followerId).maybeSingle(),
        supabase.from('users').select('followers').eq('id', followingId).maybeSingle(),
      ]);

      if (followerError) { console.error('Error fetching follower user:', followerError); return; }
      if (followingUserError) { console.error('Error fetching following user:', followingUserError); return; }

      // Update both counts in parallel
      const [
        { error: followingUpdateError },
        { error: followersUpdateError },
      ] = await Promise.all([
        supabase.from('users').update({ following: Math.max(0, (followerUser?.following || 0) + increment) }).eq('id', followerId),
        supabase.from('users').update({ followers: Math.max(0, (followingUser?.followers || 0) + increment) }).eq('id', followingId),
      ]);

      if (followingUpdateError) throw new Error(`Failed to update following count: ${followingUpdateError.message}`);
      if (followersUpdateError) throw new Error(`Failed to update followers count: ${followersUpdateError.message}`);
    } catch (error) {
      console.error('Error updating follower counts:', error);
      throw error;
    }
  }
} 