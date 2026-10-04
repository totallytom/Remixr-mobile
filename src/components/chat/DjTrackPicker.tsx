/**
 * "Add to Queue" sheet for the DJ Room: search any published track on
 * Re-Mixed. Before the user types it shows popular tracks.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Check, Music, Plus, Search, X } from 'lucide-react-native';
import { colors } from '../../theme';
import { MusicService } from '../../services/musicService';
import type { Track } from '../../store/useStore';

interface Props {
  visible: boolean;
  onClose: () => void;
  onPick: (track: Track) => void;
  /** Tracks already in the room's queue (shown as added). */
  queuedIds: Set<string>;
}

const SEARCH_DELAY_MS = 300;
const PAGE = 30;

const DjTrackPicker: React.FC<Props> = ({ visible, onClose, onPick, queuedIds }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [popular, setPopular] = useState<Track[] | null>(null);
  const [results, setResults] = useState<Track[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // Ignores responses from searches the user has already typed past.
  const requestRef = useRef(0);

  // Popular tracks, loaded once per opening.
  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setResults(null);
    setError(false);
    if (popular) return;
    setLoading(true);
    MusicService.getPopularTracks(PAGE)
      .catch(() => MusicService.getTracks(PAGE))
      .then((list) => setPopular(list.filter((tr) => !!tr.audioUrl)))
      .catch(() => { setPopular([]); setError(true); })
      .finally(() => setLoading(false));
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); setLoading(false); return; }
    const id = ++requestRef.current;
    setLoading(true);
    setError(false);
    const timer = setTimeout(() => {
      MusicService.searchTracks(q, PAGE)
        .then((list) => { if (id === requestRef.current) setResults(list.filter((tr) => !!tr.audioUrl)); })
        .catch(() => { if (id === requestRef.current) { setResults([]); setError(true); } })
        .finally(() => { if (id === requestRef.current) setLoading(false); });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const searching = query.trim().length > 0;
  const list = searching ? results : popular;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={[st.sheet, { paddingBottom: insets.bottom + 8 }]}>
          <View style={st.header}>
            <Text style={st.title}>{t('chat.addToQueue')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <X size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={st.searchRow}>
            <Search size={16} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t('chat.djSearch')}
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              style={st.searchInput}
              accessibilityLabel={t('chat.djSearch')}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel={t('common.close')}>
                <X size={14} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <Text style={st.sectionLabel}>
            {searching ? t('chat.djResults') : t('chat.djPopular')}
          </Text>

          {loading && !list ? (
            <View style={st.center}><ActivityIndicator size="small" color={colors.primary} /></View>
          ) : !list || list.length === 0 ? (
            <Text style={st.empty}>
              {error ? t('errors.generic.load') : searching ? t('chat.djNoMatch', { query: query.trim() }) : t('chat.djNothing')}
            </Text>
          ) : (
            <FlatList
              data={list}
              keyExtractor={(tr) => tr.id}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={{ opacity: loading ? 0.5 : 1 }}
              renderItem={({ item: track }) => {
                const queued = queuedIds.has(track.id);
                return (
                  <TouchableOpacity
                    style={st.row}
                    onPress={() => !queued && onPick(track)}
                    disabled={queued}
                    accessibilityRole="button"
                    accessibilityLabel={queued ? t('chat.djInQueueA11y', { title: track.title }) : t('chat.djAddA11y', { title: track.title, artist: track.artist })}
                  >
                    {track.cover
                      ? <Image source={{ uri: track.cover }} style={st.cover} contentFit="cover" />
                      : <View style={[st.cover, st.coverFb]}><Music size={16} color={colors.textMuted} /></View>}
                    <View style={st.info}>
                      <Text style={st.trackTitle} numberOfLines={1}>{track.title}</Text>
                      <Text style={st.trackArtist} numberOfLines={1}>{track.artist}</Text>
                    </View>
                    {queued ? (
                      <View style={[st.addBtn, st.addedBtn]}><Check size={14} color={colors.textMuted} /></View>
                    ) : (
                      <View style={st.addBtn}><Plus size={14} color="#000" /></View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const st = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    height: '75%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 0 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: colors.textMuted, marginTop: 14, marginBottom: 6 },
  center: { paddingVertical: 32, alignItems: 'center' },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: 13, paddingVertical: 32, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  cover: { width: 44, height: 44, borderRadius: 8 },
  coverFb: { backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0 },
  trackTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  trackArtist: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  addBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  addedBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
});

export default DjTrackPicker;
