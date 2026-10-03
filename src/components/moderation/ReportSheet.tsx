/**
 * Bottom sheet for reporting a user, one of their messages, or a concert listing. After a successful
 * report it offers to block the user too (if the caller passes onBlock).
 */
import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { X } from 'lucide-react-native';
import { colors } from '../../theme';
import { CONCERT_REPORT_REASONS, REPORT_REASONS, submitUserReport, type ReportReason, type ReportTarget } from '../../services/reportService';
import { useTranslation } from 'react-i18next';

interface Props {
  target: ReportTarget | null;
  onClose: () => void;
  /** Offered after reporting, e.g. BlockService.blockUser for this user. */
  onBlock?: () => void;
}

const ReportSheet: React.FC<Props> = ({ target, onClose, onBlock }) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (target) {
      setReason(null);
      setDetails('');
    }
  }, [target]);

  const submit = async () => {
    if (!target || !reason) return;
    setSubmitting(true);
    try {
      const result = await submitUserReport(target, reason, details);
      const username = target.username;
      onClose();
      // iOS drops an Alert opened while a modal is still animating closed.
      setTimeout(() => {
        if (result === 'already_reported') {
          Alert.alert(t('report.alreadyTitle'), t('report.alreadyBody'));
          return;
        }
        Alert.alert(
          t('report.thanksTitle'),
          t('report.thanksBody'),
          onBlock
            ? [
                { text: t('report.block', { name: username }), style: 'destructive', onPress: onBlock },
                { text: t('report.done'), style: 'cancel' },
              ]
            : [{ text: t('report.done') }],
        );
      }, 450);
    } catch (e) {
      Alert.alert(t('report.failed'), e instanceof Error ? e.message : t('common.tryAgain'));
    } finally {
      setSubmitting(false);
    }
  };

  const reasons = target?.concertId ? CONCERT_REPORT_REASONS : REPORT_REASONS;
  const title = target?.concertId
    ? t('report.concert')
    : target?.messageId ? t('report.message') : t('report.user', { name: target?.username ?? '' });

  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 8 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
              {title}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 8 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 4 }}>
              {target?.concertTitle ? `“${target.concertTitle}”. ` : ''}
              {t('report.why', { name: target?.username ?? '' })}
            </Text>

            {reasons.map((r) => {
              const selected = reason === r.value;
              return (
                <TouchableOpacity
                  key={r.value}
                  onPress={() => setReason(r.value)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primary + '22' : colors.surfaceElevated,
                  }}
                >
                  <View
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: selected ? colors.primary : colors.textMuted,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {selected && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />}
                  </View>
                  <Text style={{ fontSize: 14, color: colors.text }}>{t(r.label)}</Text>
                </TouchableOpacity>
              );
            })}

            <TextInput
              value={details}
              onChangeText={setDetails}
              placeholder={t('report.details')}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={1000}
              style={{
                marginTop: 4,
                minHeight: 72,
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceElevated,
                color: colors.text,
                textAlignVertical: 'top',
              }}
            />

            <TouchableOpacity
              onPress={submit}
              disabled={!reason || submitting}
              style={{
                marginTop: 8,
                marginBottom: 12,
                paddingVertical: 14,
                borderRadius: 12,
                alignItems: 'center',
                backgroundColor: '#ef4444',
                opacity: !reason || submitting ? 0.4 : 1,
              }}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{t('report.submit')}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default ReportSheet;
