import React, { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text as RNText, ScrollView, TouchableOpacity, Image, ActivityIndicator, type TextProps } from 'react-native';
import { FONTS } from '../../utils/fonts';
import { colors } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, TrendingUp, Users, PlayCircle, UserPlus } from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { AnalyticsService, type ArtistOverviewStats, type PlaysByDay, type TopTrack } from '../../services/analyticsService';
import type { ProfileStackParamList } from '../../navigation/stacks/ProfileStack';
import { appLocale } from '../../utils/dateLocale';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import FirstFansCard from '../../components/earlyEar/FirstFansCard';

const Text = ({ style, ...props }: TextProps) => (
  <RNText style={[{ fontFamily: FONTS.body }, style]} {...props} />
);

type NavProp = NativeStackNavigationProp<ProfileStackParamList, 'Analytics'>;

const RANGES = [
  { label: 'analytics.range7', days: 7 },
  { label: 'analytics.range30', days: 30 },
  { label: 'analytics.range90', days: 90 },
] as const;

// Single-series magnitude chart (plays/day) — one hue, no legend needed, recessive
// baseline, 4px rounded bar tops. See dataviz skill: sequential data gets one hue,
// identity is never needed for a single series.
const PlaysBarChart: React.FC<{ data: PlaysByDay[] }> = ({ data }) => {
  if (data.length === 0) {
    return (
      <View className="h-32 items-center justify-center">
        <Text className="text-sm" style={{ color: colors.textMuted }}>{i18n.t('analytics.noPlays')}</Text>
      </View>
    );
  }
  const max = Math.max(...data.map((d) => d.plays), 1);
  return (
    <View className="gap-2">
      <View className="flex-row items-end h-32 gap-1">
        {data.map((d) => {
          const heightPct = Math.max(4, (d.plays / max) * 100);
          return (
            <View key={d.day} className="flex-1 items-center justify-end h-full">
              <View
                style={{
                  width: '100%',
                  height: `${heightPct}%`,
                  backgroundColor: colors.primary,
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                  minHeight: 3,
                }}
              />
            </View>
          );
        })}
      </View>
      <View className="h-px" style={{ backgroundColor: colors.border }} />
      <View className="flex-row justify-between">
        <Text className="text-xs" style={{ color: colors.textMuted }}>
          {new Date(data[0].day).toLocaleDateString(appLocale(), { month: 'short', day: 'numeric' })}
        </Text>
        <Text className="text-xs" style={{ color: colors.textMuted }}>
          {new Date(data[data.length - 1].day).toLocaleDateString(appLocale(), { month: 'short', day: 'numeric' })}
        </Text>
      </View>
    </View>
  );
};

const StatTile: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <View
    className="flex-1 rounded-2xl border p-4 gap-2"
    style={{ backgroundColor: colors.surface, borderColor: colors.border, minWidth: '47%' }}
  >
    {icon}
    <Text className="text-2xl font-bold" style={{ color: colors.text }}>{value}</Text>
    <Text className="text-xs" style={{ color: colors.textMuted }}>{label}</Text>
  </View>
);

const AnalyticsDashboardScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const { user } = useStore() as any;

  const [days, setDays] = useState<number>(30);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<ArtistOverviewStats>({ totalPlays: 0, uniqueListeners: 0, completionRate: 0, newFollowers: 0 });
  const [playsByDay, setPlaysByDay] = useState<PlaysByDay[]>([]);
  const [topTracks, setTopTracks] = useState<TopTrack[]>([]);

  const load = useCallback(async (rangeDays: number) => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const [overview, byDay, tracks] = await Promise.all([
        AnalyticsService.getOverviewStats(user.id, rangeDays),
        AnalyticsService.getPlaysByDay(user.id, rangeDays),
        AnalyticsService.getTopTracks(user.id, rangeDays, 10),
      ]);
      setStats(overview);
      setPlaysByDay(byDay);
      setTopTracks(tracks);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(days); }, [load, days]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 pt-4 pb-2 border-b" style={{ borderColor: colors.border }}>
        <TouchableOpacity onPress={() => navigation.goBack()} className="p-1">
          <ChevronLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text className="text-2xl font-bold" style={{ color: colors.text }}>{t('analytics.title')}</Text>
      </View>

      {isLoading && playsByDay.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
          {/* Range filter — one row above the charts */}
          <View className="flex-row gap-2 self-start rounded-xl p-1" style={{ backgroundColor: colors.surfaceElevated }}>
            {RANGES.map((r) => {
              const active = r.days === days;
              return (
                <TouchableOpacity
                  key={r.days}
                  onPress={() => setDays(r.days)}
                  className="px-4 py-1.5 rounded-lg"
                  style={{ backgroundColor: active ? colors.primary : 'transparent' }}
                >
                  <Text className="text-sm font-medium" style={{ color: active ? '#000' : colors.textSecondary }}>{t(r.label)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Stat tiles */}
          <View className="flex-row flex-wrap gap-3">
            <StatTile icon={<PlayCircle size={20} color={colors.primary} />} label={t('analytics.totalPlays')} value={stats.totalPlays.toLocaleString()} />
            <StatTile icon={<Users size={20} color={colors.primary} />} label={t('analytics.uniqueListeners')} value={stats.uniqueListeners.toLocaleString()} />
            <StatTile icon={<TrendingUp size={20} color={colors.primary} />} label={t('analytics.completion')} value={`${Math.round(stats.completionRate * 100)}%`} />
            <StatTile icon={<UserPlus size={20} color={colors.primary} />} label={t('analytics.newFollowers')} value={stats.newFollowers.toLocaleString()} />
          </View>

          {/* Plays over time */}
          <View className="rounded-2xl border p-5 gap-3" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <Text className="text-sm font-semibold" style={{ color: colors.text }}>{t('analytics.plays')}</Text>
            <PlaysBarChart data={playsByDay} />
          </View>

          {/* Top tracks */}
          <View className="rounded-2xl border p-5 gap-3" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
            <Text className="text-sm font-semibold" style={{ color: colors.text }}>{t('analytics.topTracks')}</Text>
            {topTracks.length === 0 ? (
              <Text className="text-sm" style={{ color: colors.textMuted }}>{i18n.t('analytics.noPlays')}</Text>
            ) : (
              <View className="gap-3">
                {topTracks.map((t, i) => (
                  <View key={t.trackId} className="flex-row items-center gap-3">
                    <Text className="w-5 text-sm text-right" style={{ color: colors.textMuted }}>{i + 1}</Text>
                    <Image source={{ uri: t.cover }} className="w-10 h-10 rounded-lg" />
                    <Text className="flex-1 text-sm" numberOfLines={1} style={{ color: colors.text }}>{t.title}</Text>
                    <Text className="text-sm font-medium" style={{ color: colors.textSecondary }}>{t.plays.toLocaleString()}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Early Ear: who found you first */}
          <FirstFansCard />

          <Text className="text-xs text-center" style={{ color: colors.textMuted }}>
            {t('analytics.geoNote')}
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

export default AnalyticsDashboardScreen;
