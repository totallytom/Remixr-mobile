/**
 * Early Ear card for profiles. Own profile: always shown, with the public /
 * private switch. Someone else's: only when they've made it public.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, Switch, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ear, Play, Lock } from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { EarlyEarService, nextTier, type EarlyEarProfile, type EarlyEarTier } from '../../services/earlyEarService';

export const TIER_COLORS: Record<EarlyEarTier, { bg: string; fg: string }> = {
  listener: { bg: '#e5e7eb', fg: '#374151' },
  scout: { bg: '#99f6e4', fg: '#134e4a' },
  tastemaker: { bg: '#ddd6fe', fg: '#4c1d95' },
  oracle: { bg: '#fde68a', fg: '#78350f' },
};

const EarlyEarCard: React.FC<{ userId: string; isOwn?: boolean }> = ({ userId, isOwn }) => {
  const { t } = useTranslation();
  const { playTrack } = useStore() as any;
  const [profile, setProfile] = useState<EarlyEarProfile | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    EarlyEarService.getProfile(userId).then(setProfile).catch(() => setProfile(null));
  }, [userId]);

  useEffect(load, [load]);
  // Refresh when coming back to the profile (scores change as likes come in).
  useFocusEffect(load);

  if (!profile || (!profile.visible && !isOwn)) return null;

  const tierColor = TIER_COLORS[profile.tier];
  const next = nextTier(profile.points);
  const hitRate = profile.finds > 0 ? Math.round((profile.hits / profile.finds) * 100) : 0;

  const togglePublic = async (value: boolean) => {
    setSaving(true);
    setProfile((p) => (p ? { ...p, isPublic: value } : p));
    try {
      await EarlyEarService.setPublic(value);
    } catch {
      setProfile((p) => (p ? { ...p, isPublic: !value } : p));
      Alert.alert(t('common.error'), t('earlyEar.privacyFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={st.card}>
      <View style={st.headRow}>
        <View style={st.icon}><Ear size={18} color="#000" /></View>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>{t('earlyEar.title')}</Text>
          <Text style={st.sub}>{t('earlyEar.tagline')}</Text>
        </View>
        <View style={[st.tierBadge, { backgroundColor: tierColor.bg }]}>
          <Text style={[st.tierText, { color: tierColor.fg }]}>{t(`earlyEar.tiers.${profile.tier}`)}</Text>
        </View>
      </View>

      <View style={st.statsRow}>
        <View style={st.stat}>
          <Text style={st.statNum}>{profile.points.toLocaleString()}</Text>
          <Text style={st.statLabel}>{t('earlyEar.points')}</Text>
        </View>
        <View style={st.stat}>
          <Text style={st.statNum}>{profile.hits}</Text>
          <Text style={st.statLabel}>{t('earlyEar.calledIt')}</Text>
        </View>
        <View style={st.stat}>
          <Text style={st.statNum}>{profile.finds > 0 ? `${hitRate}%` : '—'}</Text>
          <Text style={st.statLabel}>{t('earlyEar.hitRate')}</Text>
        </View>
      </View>

      {next && (
        <View style={{ marginTop: 12 }}>
          <View style={st.progressTrack}>
            <View style={[st.progressFill, { width: `${Math.min(100, (profile.points / next.min) * 100)}%`, backgroundColor: TIER_COLORS[next.tier].fg }]} />
          </View>
          <Text style={st.progressText}>
            {t('earlyEar.toNext', { count: next.min - profile.points, tier: t(`earlyEar.tiers.${next.tier}`) })}
          </Text>
        </View>
      )}

      {profile.top.length > 0 ? (
        <View style={{ marginTop: 14, gap: 8 }}>
          <Text style={st.section}>{t('earlyEar.bestFinds')}</Text>
          {profile.top.slice(0, 3).map((f) => (
            <TouchableOpacity
              key={f.trackId}
              style={st.findRow}
              onPress={() => f.audioUrl && playTrack({ id: f.trackId, title: f.title, artist: f.artist, cover: f.cover, audioUrl: f.audioUrl, duration: 0, album: '', genre: '' })}
              accessibilityRole="button"
              accessibilityLabel={t('track.playTitleBy', { title: f.title, artist: f.artist })}
            >
              {f.cover ? <Image source={{ uri: f.cover }} style={st.findCover} /> : <View style={[st.findCover, { backgroundColor: '#e5e7eb' }]} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={st.findTitle} numberOfLines={1}>{f.title}</Text>
                <Text style={st.findMeta} numberOfLines={1}>
                  {t('earlyEar.findMeta', { rank: f.likeRank, milestone: f.milestone })}
                </Text>
              </View>
              <Text style={st.findPoints}>+{f.points}</Text>
              <Play size={14} color="#6b7280" />
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Text style={st.empty}>{isOwn ? t('earlyEar.emptyOwn') : t('earlyEar.emptyOther')}</Text>
      )}

      {isOwn && (
        <View style={st.privacyRow}>
          {!profile.isPublic && <Lock size={13} color="#6b7280" />}
          <Text style={st.privacyText}>{profile.isPublic ? t('earlyEar.publicOn') : t('earlyEar.publicOff')}</Text>
          <Switch
            value={profile.isPublic}
            onValueChange={togglePublic}
            disabled={saving}
            accessibilityLabel={t('earlyEar.showOnProfile')}
          />
        </View>
      )}
    </View>
  );
};

const st = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#000', padding: 16, marginTop: 16 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#99f6e4', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: '#111' },
  sub: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  tierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tierText: { fontSize: 12, fontWeight: '700' },
  statsRow: { flexDirection: 'row', marginTop: 14 },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '800', color: '#111' },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#f3f4f6', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 11, color: '#6b7280', marginTop: 4 },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: '#6b7280' },
  findRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  findCover: { width: 38, height: 38, borderRadius: 8 },
  findTitle: { fontSize: 13, fontWeight: '600', color: '#111' },
  findMeta: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  findPoints: { fontSize: 13, fontWeight: '700', color: '#0f766e' },
  empty: { fontSize: 12, color: '#6b7280', marginTop: 12, lineHeight: 17 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  privacyText: { flex: 1, fontSize: 12, color: '#374151' },
});

export default EarlyEarCard;
