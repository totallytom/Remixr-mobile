import React, { useCallback, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text as RNText,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  type TextProps,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Flag, MapPin, Ticket } from 'lucide-react-native';
import { FONTS } from '../../utils/fonts';
import { colors } from '../../theme';
import { ConcertService, type ConcertWithUser } from '../../services/concertService';
import { withoutHiddenUsers } from '../../services/blockService';
import BuyTicketButton from '../../components/music/BuyTicketButton';
import { formatTicketPrice, openTicketUrl, thirdPartyTicketsNote, todayKey } from '../../utils/concerts';
import ReportSheet from '../../components/moderation/ReportSheet';
import { BlockService } from '../../services/blockService';
import type { ReportTarget } from '../../services/reportService';
import { useStore } from '../../store/useStore';
import { requireAuth } from '../../components/auth/GuestPrompt';
import { useTranslation } from 'react-i18next';
import { appLocale } from '../../utils/dateLocale';

const Text = ({ style, ...props }: TextProps) => (
  <RNText style={[{ fontFamily: FONTS.body }, style]} {...props} />
);


/** Concert dates are stored as YYYY-MM-DD; parse them as local dates. */
function parseConcertDate(date: string): Date {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

const ConcertScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [concerts, setConcerts] = useState<ConcertWithUser[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const { user } = useStore() as any;

  const load = useCallback(async () => {
    const all = await ConcertService.getAllConcerts(100);
    // The query already returns today onward; this also drops any show the
    // server's UTC "today" let through for a viewer behind UTC.
    const today = todayKey();
    const upcoming = all.filter((c) => (c.date ?? '').slice(0, 10) >= today);
    setConcerts(withoutHiddenUsers(upcoming, (c) => c.userId));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const reportConcert = (c: ConcertWithUser) => {
    if (!requireAuth('report')) return;
    setReportTarget({
      userId: c.userId,
      username: c.user?.artist_name || c.user?.username || t('concerts.thisArtist'),
      concertId: c.id,
      concertTitle: c.title,
    });
  };

  // Offered after a report; blocking also hides their listings from this tab.
  const blockHost = async (hostId: string) => {
    if (!user) return;
    try {
      await BlockService.blockUser(user.id, hostId);
      setConcerts((prev) => prev && prev.filter((c) => c.userId !== hostId));
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('concerts.blockFailed'));
    }
  };

  const openArtist = (userId: string) => {
    navigation.getParent()?.navigate('ProfileTab', { screen: 'ProfileById', params: { userId } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View className="px-4 pt-4 pb-2 border-b" style={{ borderColor: colors.border }}>
        <Text className="text-2xl font-bold" style={{ color: colors.text }}>{t('concerts.title')}</Text>
        <Text className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>{t('concerts.subtitle')}</Text>
      </View>

      {concerts === null ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.text} />}
        >
          {concerts.length === 0 ? (
            <View className="flex-1 items-center justify-center px-8 gap-4" style={{ paddingTop: 80 }}>
              <View
                className="w-20 h-20 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.surfaceElevated }}
              >
                <Ticket size={36} color={colors.textSecondary} />
              </View>
              <Text className="text-lg font-semibold" style={{ color: colors.text }}>{t('concerts.none')}</Text>
              <Text className="text-sm text-center" style={{ color: colors.textMuted }}>
                {t('concerts.noneHint')}
              </Text>
            </View>
          ) : concerts.map((c) => {
            const date = parseConcertDate(c.date);
            const artistName = c.user?.artist_name || c.user?.username;
            return (
              <View
                key={c.id}
                className="flex-row gap-3 rounded-2xl border p-3"
                style={{ backgroundColor: colors.surface, borderColor: colors.border }}
              >
                <View
                  className="w-14 rounded-xl items-center justify-center py-2"
                  style={{ backgroundColor: colors.primary + '33' }}
                >
                  <Text className="text-xs font-bold" style={{ color: colors.text }}>{date.toLocaleDateString(appLocale(), { month: 'short' }).toUpperCase()}</Text>
                  <Text className="text-2xl font-bold" style={{ color: colors.text }}>{date.getDate()}</Text>
                </View>

                <View className="flex-1 gap-1">
                  <View className="flex-row items-start gap-2">
                    <Text className="text-base font-semibold flex-1" numberOfLines={2} style={{ color: colors.text }}>{c.title}</Text>
                    {c.userId !== user?.id && (
                      <TouchableOpacity
                        onPress={() => reportConcert(c)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={t('concerts.report', { title: c.title })}
                      >
                        <Flag size={14} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {artistName && (
                    <TouchableOpacity onPress={() => c.user && openArtist(c.user.id)}>
                      <Text className="text-sm font-medium" style={{ color: colors.textSecondary }}>{artistName}</Text>
                    </TouchableOpacity>
                  )}
                  {(c.venue || c.location) && (
                    <View className="flex-row items-center gap-1">
                      <MapPin size={12} color={colors.textMuted} />
                      <Text className="text-xs flex-1" numberOfLines={1} style={{ color: colors.textMuted }}>
                        {[c.venue, c.location].filter(Boolean).join(', ')}
                      </Text>
                    </View>
                  )}
                  <View className="flex-row items-center gap-3 mt-1">
                    {formatTicketPrice(c.ticketPrice) ? (
                      <Text className="text-sm font-semibold" style={{ color: colors.text }}>{formatTicketPrice(c.ticketPrice)}</Text>
                    ) : null}
                    {c.ticketUrl ? (
                      <TouchableOpacity
                        onPress={() => openTicketUrl(c.ticketUrl)}
                        className="px-3 py-1.5 rounded-lg"
                        style={{ backgroundColor: colors.accent }}
                      >
                        <Text className="text-xs font-semibold text-black">{t('concerts.getTickets')}</Text>
                      </TouchableOpacity>
                    ) : c.ticketPrice ? (
                      <BuyTicketButton concertId={c.id} capacity={c.capacity} compact />
                    ) : null}
                  </View>
                  {c.ticketUrl ? (
                    <Text className="text-[11px]" style={{ color: colors.textMuted }}>{thirdPartyTicketsNote()}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <ReportSheet
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onBlock={reportTarget ? () => blockHost(reportTarget.userId) : undefined}
      />
    </SafeAreaView>
  );
};

export default ConcertScreen;
