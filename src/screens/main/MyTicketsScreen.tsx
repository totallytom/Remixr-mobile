import React, { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text as RNText,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  type TextProps,
} from 'react-native';
import { FONTS } from '../../utils/fonts';
import { colors } from '../../theme';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ticket as TicketIcon, MapPin, Calendar, CheckCircle2 } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { TicketService, type TicketWithConcert } from '../../services/ticketService';
import type { ProfileStackParamList } from '../../navigation/stacks/ProfileStack';

const Text = ({ style, ...props }: TextProps) => (
  <RNText style={[{ fontFamily: FONTS.body }, style]} {...props} />
);

type NavProp = NativeStackNavigationProp<ProfileStackParamList, 'MyTickets'>;

const MyTicketsScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const checkout = useRoute<RouteProp<ProfileStackParamList, 'MyTickets'>>().params?.checkout;
  const [awaitingTicket, setAwaitingTicket] = useState(checkout === 'success');
  const [tickets, setTickets] = useState<TicketWithConcert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await TicketService.getMyTickets();
    setTickets(data);
  }, []);

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, [load]);

  // Returning from Stripe: the ticket is issued by a webhook that can lag the
  // redirect by a few seconds, so re-check briefly until a new ticket shows up.
  useEffect(() => {
    if (checkout !== 'success') return;
    setAwaitingTicket(true);
    let cancelled = false;
    let attempts = 0;
    let initialCount: number | null = null;
    const poll = async () => {
      const data = await TicketService.getMyTickets();
      if (cancelled) return;
      setTickets(data);
      if (initialCount === null) initialCount = data.length;
      attempts += 1;
      const latest = data[0] ? new Date(data[0].createdAt).getTime() : 0;
      if (latest > Date.now() - 10 * 60 * 1000 || data.length > initialCount || attempts >= 10) {
        setAwaitingTicket(false);
        return;
      }
      setTimeout(poll, 2000);
    };
    poll();
    return () => { cancelled = true; };
  }, [checkout]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View className="px-4 pt-4 pb-2 border-b" style={{ borderColor: colors.border }}>
        <Text className="text-2xl font-bold" style={{ color: colors.text }}>My Tickets</Text>
      </View>

      {checkout === 'success' && (
        <View className="mx-4 mt-3 flex-row items-center gap-2 rounded-xl px-4 py-3" style={{ backgroundColor: colors.primary + '33' }}>
          {awaitingTicket ? <ActivityIndicator size="small" color={colors.text} /> : <CheckCircle2 size={16} color={colors.text} />}
          <Text className="flex-1 text-sm" style={{ color: colors.text }}>
            {awaitingTicket
              ? 'Payment received. Issuing your ticket…'
              : "Payment received. If your ticket isn't below yet, pull down to refresh in a minute."}
          </Text>
        </View>
      )}

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : tickets.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8 gap-3">
          <TicketIcon size={48} color={colors.textMuted} />
          <Text className="font-medium" style={{ color: colors.text }}>No tickets yet</Text>
          <Text className="text-sm text-center" style={{ color: colors.textMuted }}>
            Tickets you buy for shows will show up here with a QR code for check-in at the door.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16 }}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        >
          {tickets.map((ticket) => (
            <View
              key={ticket.id}
              className="rounded-2xl border p-5 items-center gap-4"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <View className="w-full gap-1">
                <Text className="text-lg font-semibold" style={{ color: colors.text }}>
                  {ticket.concert?.title ?? 'Concert'}
                </Text>
                {ticket.concert?.date ? (
                  <View className="flex-row items-center gap-2">
                    <Calendar size={14} color={colors.primary} />
                    <Text className="text-sm" style={{ color: colors.textSecondary }}>
                      {new Date(ticket.concert.date).toLocaleDateString('en-US', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                      })}
                    </Text>
                  </View>
                ) : null}
                {ticket.concert?.venue ? (
                  <View className="flex-row items-center gap-2">
                    <MapPin size={14} color={colors.primary} />
                    <Text className="text-sm" style={{ color: colors.textSecondary }}>
                      {ticket.concert.venue}, {ticket.concert.location}
                    </Text>
                  </View>
                ) : null}
              </View>

              {ticket.status === 'redeemed' ? (
                <View className="items-center gap-2 py-6">
                  <CheckCircle2 size={40} color={colors.primary} />
                  <Text className="font-medium" style={{ color: colors.text }}>Checked in</Text>
                  {ticket.redeemedAt ? (
                    <Text className="text-xs" style={{ color: colors.textMuted }}>
                      {new Date(ticket.redeemedAt).toLocaleString()}
                    </Text>
                  ) : null}
                </View>
              ) : ticket.status === 'refunded' ? (
                <Text className="py-6 font-medium" style={{ color: colors.textMuted }}>Refunded</Text>
              ) : (
                <View className="bg-white p-3 rounded-xl">
                  <QRCode value={ticket.qrToken} size={180} />
                </View>
              )}

              <Text className="text-xs" style={{ color: colors.textMuted }}>
                Show this code at the door
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

export default MyTicketsScreen;
