/**
 * "You called it!" — shows new Early Ear awards when the app opens or comes
 * back to the foreground. Mount once (MainTabs).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Image, TouchableOpacity, ScrollView, AppState, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ear } from 'lucide-react-native';
import { useStore } from '../../store/useStore';
import { hap } from '../../utils/haptics';
import { EarlyEarService, type EarlyEarAward } from '../../services/earlyEarService';

const CalledItHost: React.FC = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const userId = useStore((s: any) => s.user?.id as string | undefined);
  const [awards, setAwards] = useState<EarlyEarAward[]>([]);
  const checkingRef = useRef(false);

  const check = useCallback(async () => {
    if (!userId || checkingRef.current) return;
    checkingRef.current = true;
    try {
      const list = await EarlyEarService.getUnseenAwards();
      if (list.length) {
        setAwards(list);
        hap.success?.();
      }
    } finally {
      checkingRef.current = false;
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) { setAwards([]); return; }
    // Small delay so it doesn't fight the app's first screen for attention.
    const timer = setTimeout(check, 1500);
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') check(); });
    return () => { clearTimeout(timer); sub.remove(); };
  }, [userId, check]);

  const close = () => {
    const ids = awards.map((a) => a.id);
    setAwards([]);
    EarlyEarService.markSeen(ids).catch(() => {});
  };

  const total = awards.reduce((sum, a) => sum + a.points, 0);

  return (
    <Modal visible={awards.length > 0} transparent animationType="fade" onRequestClose={close}>
      <View style={st.backdrop}>
        <View style={[st.card, { marginBottom: insets.bottom }]}>
          <View style={st.icon}><Ear size={26} color="#000" /></View>
          <Text style={st.title}>{t('earlyEar.calledItTitle')}</Text>
          <Text style={st.body}>
            {awards.length === 1
              ? t('earlyEar.calledItOne', { title: awards[0].title, milestone: awards[0].milestone })
              : t('earlyEar.calledItMany', { count: awards.length })}
          </Text>
          <ScrollView style={{ maxHeight: 240, alignSelf: 'stretch' }} contentContainerStyle={{ gap: 8 }}>
            {awards.map((a) => (
              <View key={a.id} style={st.row}>
                {a.cover ? <Image source={{ uri: a.cover }} style={st.cover} /> : <View style={[st.cover, { backgroundColor: '#e5e7eb' }]} />}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.rowTitle} numberOfLines={1}>{a.title}</Text>
                  <Text style={st.rowMeta} numberOfLines={1}>{t('earlyEar.findMeta', { rank: a.likeRank, milestone: a.milestone })}</Text>
                </View>
                <Text style={st.points}>+{a.points}</Text>
              </View>
            ))}
          </ScrollView>
          <Text style={st.total}>{t('earlyEar.totalEarned', { count: total })}</Text>
          <TouchableOpacity style={st.btn} onPress={close} accessibilityRole="button">
            <Text style={st.btnText}>{t('earlyEar.nice')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 20, borderWidth: 2, borderColor: '#000', padding: 20, alignItems: 'center', gap: 10 },
  icon: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#99f6e4', borderWidth: 2, borderColor: '#000', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: '#111', textAlign: 'center' },
  body: { fontSize: 14, color: '#374151', textAlign: 'center', lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cover: { width: 40, height: 40, borderRadius: 8 },
  rowTitle: { fontSize: 13, fontWeight: '600', color: '#111' },
  rowMeta: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  points: { fontSize: 14, fontWeight: '800', color: '#0f766e' },
  total: { fontSize: 13, fontWeight: '700', color: '#111', marginTop: 4 },
  btn: { alignSelf: 'stretch', marginTop: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#000', alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default CalledItHost;
