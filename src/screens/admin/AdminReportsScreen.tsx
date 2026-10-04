/**
 * Open reports about users, messages and concert listings. Apple expects reports of objectionable
 * content to be acted on within 24 hours — check this screen daily.
 */
import React, { useCallback, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, Flag, MessageSquare, CheckCircle, Ticket } from 'lucide-react-native';
import { formatDistanceToNow } from 'date-fns';
import { colors } from '../../theme';
import type { ProfileStackParamList } from '../../navigation/stacks/ProfileStack';
import {
  getOpenUserReports,
  reasonLabel,
  resolveUserReport,
  type ReportAction,
  type UserReport,
} from '../../services/reportService';
import { getAvatarUrl } from '../../utils/avatar';

const AdminReportsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const [reports, setReports] = useState<UserReport[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReports(await getOpenUserReports());
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not load reports.');
      setReports((prev) => prev ?? []);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const act = async (report: UserReport, action: ReportAction) => {
    setBusyId(report.id);
    try {
      await resolveUserReport(report.id, action);
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update the report.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmSuspend = (report: UserReport) => {
    const name = report.reported?.username ?? 'this user';
    Alert.alert(
      `Suspend ${name}?`,
      "They won't be able to post, message, comment or upload. This closes every open report about them.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Suspend', style: 'destructive', onPress: () => act(report, 'suspend_user') },
      ],
    );
  };

  const confirmRemoveMessage = (report: UserReport) => {
    Alert.alert('Remove this message?', 'It will be deleted from the conversation.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => act(report, 'remove_message') },
    ]);
  };

  const confirmRemoveConcert = (report: UserReport) => {
    Alert.alert(
      'Remove this concert listing?',
      `“${report.concert?.title ?? 'This concert'}” will be deleted for everyone. This closes every open report about it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => act(report, 'remove_concert') },
      ],
    );
  };

  const Button: React.FC<{ label: string; color: string; onPress: () => void; disabled?: boolean }> = ({
    label, color, onPress, disabled,
  }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: color + '66',
        backgroundColor: color + '14',
        alignItems: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Flag size={20} color="#ef4444" />
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, flex: 1 }}>Reports</Text>
        {reports && reports.length > 0 && (
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#ef4444' }}>{reports.length} open</Text>
        )}
      </View>

      {reports === null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.text} />}
        >
          {reports.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 60, gap: 10 }}>
              <CheckCircle size={40} color="#22c55e" />
              <Text style={{ color: colors.text, fontWeight: '600' }}>No open reports</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Pull down to refresh.</Text>
            </View>
          ) : reports.map((r) => {
            const busy = busyId === r.id;
            const suspended = !!r.reported?.suspendedAt;
            return (
              <View
                key={r.id}
                style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10 }}
              >
                {/* Reported user */}
                <TouchableOpacity
                  onPress={() => r.reported && navigation.navigate('ProfileById', { userId: r.reported.id })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <Image source={{ uri: getAvatarUrl(r.reported?.avatar) }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }} numberOfLines={1}>
                      {r.reported?.username ?? 'Deleted user'}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                      {r.concertId ? 'Concert · ' : ''}{reasonLabel(r.reason)}
                      {r.reportCountForUser > 1 ? ` · ${r.reportCountForUser} open reports` : ''}
                      {suspended ? ' · suspended' : ''}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Reported message */}
                {r.messageId && (
                  <View style={{ borderLeftWidth: 3, borderLeftColor: '#f59e0b', backgroundColor: '#fffbeb', borderRadius: 6, padding: 10, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MessageSquare size={12} color="#92400e" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400e' }}>
                        {r.messageKind === 'group' ? 'Group message' : 'Direct message'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, color: '#78350f' }}>
                      {r.messageExcerpt ? `"${r.messageExcerpt}"` : '(shared track or empty message)'}
                    </Text>
                  </View>
                )}

                {/* Reported concert listing (snapshot from when it was reported) */}
                {r.concert && (
                  <View style={{ borderLeftWidth: 3, borderLeftColor: '#8b5cf6', backgroundColor: '#f5f3ff', borderRadius: 6, padding: 10, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ticket size={12} color="#5b21b6" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#5b21b6' }}>Concert listing</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#2e1065' }}>{r.concert.title}</Text>
                    <Text style={{ fontSize: 12, color: '#4c1d95' }}>
                      {[
                        r.concert.date && new Date(r.concert.date).toLocaleDateString(undefined, { timeZone: 'UTC' }),
                        r.concert.venue,
                        r.concert.location,
                      ].filter(Boolean).join(' · ')}
                    </Text>
                    {r.concert.ticketUrl ? (
                      <Text
                        style={{ fontSize: 12, color: '#6d28d9', textDecorationLine: 'underline' }}
                        numberOfLines={2}
                        onPress={() => Linking.openURL(r.concert!.ticketUrl!).catch(() => {})}
                      >
                        {r.concert.ticketUrl}
                      </Text>
                    ) : null}
                    {r.concert.description ? (
                      <Text style={{ fontSize: 12, color: '#4c1d95' }} numberOfLines={3}>{r.concert.description}</Text>
                    ) : null}
                  </View>
                )}

                {r.details && (
                  <Text style={{ fontSize: 13, color: colors.text }}>{r.details}</Text>
                )}

                <Text style={{ fontSize: 11, color: colors.textMuted }}>
                  Reported by {r.reporter?.username ?? 'a deleted user'} · {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                </Text>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button label="Dismiss" color="#6b7280" onPress={() => act(r, 'dismiss')} disabled={busy} />
                  {r.concertId && (
                    <Button label="Remove listing" color="#8b5cf6" onPress={() => confirmRemoveConcert(r)} disabled={busy} />
                  )}
                  {r.messageId && (
                    <Button label="Remove message" color="#f59e0b" onPress={() => confirmRemoveMessage(r)} disabled={busy} />
                  )}
                  <Button label={suspended ? 'Suspended' : 'Suspend user'} color="#ef4444" onPress={() => confirmSuspend(r)} disabled={busy || suspended} />
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

export default AdminReportsScreen;
