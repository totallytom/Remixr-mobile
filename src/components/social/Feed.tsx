import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import PostCard, { Post } from './PostCard';
import { PostsService } from '../../services/postsService';
import { useStore } from '../../store/useStore';
import PostCommentSection from './PostCommentSection';

const Feed: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openCommentPostId, setOpenCommentPostId] = useState<string | null>(null);
  const { user } = useStore();

  const loadPosts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const fetched = await PostsService.getPosts();
      setPosts(
        fetched.map(post => ({
          ...post,
          likedByUser: user ? post.likedBy.includes(user.id) : false,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load posts');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const handleLike = useCallback(async (postId: string) => {
    if (!user) return;
    try {
      await PostsService.likePost(postId, user.id);
      setPosts(prev =>
        prev.map(post => {
          if (post.id !== postId) return post;
          const liked = post.likedByUser;
          return {
            ...post,
            likes: liked ? post.likes - 1 : post.likes + 1,
            likedByUser: !liked,
            likedBy: liked
              ? post.likedBy.filter(id => id !== user.id)
              : [...post.likedBy, user.id],
          };
        }),
      );
    } catch (err) {
      console.error('Failed to like post:', err);
    }
  }, [user]);

  const handleDelete = useCallback(async (postId: string) => {
    if (!user) return;
    try {
      await PostsService.deletePost(postId, user.id);
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (err) {
      console.error('Failed to delete post:', err);
    }
  }, [user]);

  const handleComment = useCallback((postId: string) => {
    setOpenCommentPostId(prev => (prev === postId ? null : postId));
  }, []);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7c3aed" />
        <Text style={styles.loadingText}>Loading posts…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={loadPosts} style={styles.retryBtn} activeOpacity={0.8}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (posts.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No posts yet.</Text>
        <Text style={styles.emptySubText}>Be the first to share something!</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={post => post.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      renderItem={({ item: post }) => (
        <View>
          <PostCard
            post={post}
            onLike={() => handleLike(post.id)}
            onDelete={() => handleDelete(post.id)}
            onComment={() => handleComment(post.id)}
          />
          {openCommentPostId === post.id && (
            <PostCommentSection
              postId={post.id}
              postOwnerId={post.user.id}
              isOpen
              onToggle={() => handleComment(post.id)}
            />
          )}
        </View>
      )}
    />
  );
};

const styles = StyleSheet.create({
  list: {
    paddingVertical: 16,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  loadingText: {
    color: '#6b7280',
    fontSize: 14,
    marginTop: 8,
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 15,
    textAlign: 'center',
  },
  emptySubText: {
    color: '#6b7280',
    fontSize: 13,
    textAlign: 'center',
  },
});

export default Feed; 