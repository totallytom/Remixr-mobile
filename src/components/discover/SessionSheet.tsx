/**
 * Discover session UI for mobile:
 *   • SessionStrip — compact live stats above the deck (tap to open)
 *   • SessionSheet — bottom sheet with Your session, Taste DNA and
 *     Liked this session
 * Mirrors the website's Discover session panel.
 */
import React, { useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Heart, X, Flame, Dna, ChevronUp, Trash2 } from 'lucide-react-native';
import type { Track } from '../../store/useStore';
import { hap } from '../../utils/haptics';
import { tasteDna, type DiscoverSession } from './session';
import i18n from '../../i18n';
import { genreLabel } from '../../utils/genres';

const INK = '#000000';
const MINT = '#8aec9f';
const YELLOW = '#F5FF00';
const ORANGE = '#fdba74';

/** Black block behind a card = hard offset shadow that also works on Android. */
const Hard: React.FC<{ offset?: number; style?: ViewStyle; children: React.ReactNode }> = ({ offset = 4, style, children }) => (
  <View style={{ marginRight: offset, marginBottom: offset }}>
    <View style={[StyleSheet.absoluteFillObject, { backgroundColor: INK, borderRadius: 16, transform: [{ translateX: offset }, { translateY: offset }] }]} />
    <View style={[styles.card, style]}>{children}</View>
  </View>
);

// ─── Strip ───────────────────────────────────────────────────────────────────

export const SessionStrip: React.FC<{ session: DiscoverSession; onOpen: () => void }> = ({ session, onOpen }) => {
  const top = useMemo(() => tasteDna(session.liked)[0], [session.liked]);
  return (
    <TouchableOpacity
      onPress={() => { hap.tap(); onOpen(); }}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={i18n.t('discover.session.a11y', { liked: session.liked.length, skipped: session.skipped, streak: session.streak })}
    >
      <Hard offset={3} style={styles.strip}>
        <View style={styles.stripStat}>
          <Heart size={14} color={INK} fill={INK} />
          <Text style={styles.stripNum}>{session.liked.length}</Text>
        </View>
        <View style={styles.stripStat}>
          <X size={14} color={INK} strokeWidth={3} />
          <Text style={styles.stripNum}>{session.skipped}</Text>
        </View>
        <View style={[styles.stripStat, session.streak >= 3 && { backgroundColor: ORANGE }]}>
          <Flame size={14} color={INK} />
          <Text style={styles.stripNum}>{session.streak}</Text>
        </View>
        <Text style={styles.stripTaste} numberOfLines={1}>
          {top ? i18n.t('discover.session.into', { genre: genreLabel(top.genre) }) : i18n.t('discover.session.builds')}
        </Text>
        <ChevronUp size={16} color={INK} />
      </Hard>
    </TouchableOpacity>
  );
};

// ─── Sheet ───────────────────────────────────────────────────────────────────

interface SessionSheetProps {
  visible: boolean;
  session: DiscoverSession;
  activeGenre: string | null;
  onClose: () => void;
  onPlay: (track: Track) => void;
  onDigDeeper: (genre: string) => void;
  onReset: () => void;
}

export const SessionSheet: React.FC<SessionSheetProps> = ({
  visible, session, activeGenre, onClose, onPlay, onDigDeeper, onReset,
}) => {
  const dna = useMemo(() => tasteDna(session.liked), [session.liked]);
  const topGenre = dna[0]?.genre;
  const heard = session.liked.length + session.skipped;
  const likeRate = heard > 0 ? Math.round((session.liked.length / heard) * 100) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={i18n.t('common.close')} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{i18n.t('discover.session.title')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {heard > 0 && (
                <TouchableOpacity onPress={() => { hap.tap(); onReset(); }} style={styles.resetBtn} accessibilityRole="button">
                  <Trash2 size={13} color={INK} />
                  <Text style={styles.resetText}>{i18n.t('discover.session.reset')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel={i18n.t('common.close')}>
                <X size={18} color={INK} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ gap: 18, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
            {/* Stats */}
            <Hard>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={[styles.statBox, { backgroundColor: MINT }]}>
                  <Heart size={16} color={INK} fill={INK} />
                  <Text style={styles.statNum}>{session.liked.length}</Text>
                  <Text style={styles.statLabel}>{i18n.t('discover.session.liked')}</Text>
                </View>
                <View style={styles.statBox}>
                  <X size={16} color={INK} strokeWidth={3} />
                  <Text style={styles.statNum}>{session.skipped}</Text>
                  <Text style={styles.statLabel}>{i18n.t('discover.session.skipped')}</Text>
                </View>
                <View style={[styles.statBox, session.streak >= 3 && { backgroundColor: ORANGE }]}>
                  <Flame size={16} color={INK} />
                  <Text style={styles.statNum}>{session.streak}</Text>
                  <Text style={styles.statLabel}>{i18n.t('discover.session.streak')}</Text>
                </View>
              </View>
              {likeRate !== null && (
                <Text style={styles.note}>
                  {session.bestStreak >= 3
                    ? i18n.t('discover.session.likeRateStreak', { rate: likeRate, streak: session.bestStreak })
                    : i18n.t('discover.session.likeRate', { rate: likeRate })}
                </Text>
              )}
            </Hard>

            {/* Taste DNA */}
            <Hard>
              <View style={styles.sectionHead}>
                <Dna size={16} color={INK} />
                <Text style={styles.sectionTitle}>{i18n.t('discover.session.dna')}</Text>
              </View>
              {dna.length === 0 ? (
                <Text style={styles.muted}>{i18n.t('discover.session.dnaEmpty')}</Text>
              ) : (
                <>
                  <View style={styles.dnaBar}>
                    {dna.map((d, i) => (
                      <View
                        key={d.genre}
                        style={{ width: `${d.pct}%`, backgroundColor: d.color, borderRightWidth: i < dna.length - 1 ? 2 : 0, borderColor: INK }}
                      />
                    ))}
                  </View>
                  {dna.map((d) => (
                    <View key={d.genre} style={styles.dnaRow}>
                      <View style={[styles.dnaSwatch, { backgroundColor: d.color }]} />
                      <Text style={styles.dnaGenre} numberOfLines={1}>{genreLabel(d.genre)}</Text>
                      <Text style={styles.dnaPct}>{d.pct}%</Text>
                    </View>
                  ))}
                  {topGenre && topGenre !== 'Other' && topGenre !== activeGenre && (
                    <TouchableOpacity
                      onPress={() => { hap.tap(); onDigDeeper(topGenre); }}
                      style={styles.digBtn}
                      accessibilityRole="button"
                    >
                      <Text style={styles.digText}>{i18n.t('discover.session.digDeeper', { genre: genreLabel(topGenre) })}</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </Hard>

            {/* Liked this session */}
            {session.liked.length > 0 && (
              <Hard>
                <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>{i18n.t('discover.session.likedThisSession')}</Text>
                {[...session.liked].reverse().map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => { hap.tap(); onPlay(t); }}
                    style={styles.likedRow}
                    accessibilityRole="button"
                    accessibilityLabel={i18n.t('track.playTitleBy', { title: t.title, artist: t.artist })}
                  >
                    {t.cover ? <Image source={{ uri: t.cover }} style={styles.likedCover} /> : <View style={styles.likedCover} />}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.likedTitle} numberOfLines={1}>{t.title}</Text>
                      <Text style={styles.likedArtist} numberOfLines={1}>{t.artist}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
                <Text style={styles.note}>{i18n.t('discover.session.likedNote')}</Text>
              </Hard>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: INK, borderRadius: 16, padding: 14 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10 },
  stripStat: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 2, borderColor: INK, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#FFFFFF' },
  stripNum: { fontWeight: '800', color: INK, fontSize: 13 },
  stripTaste: { flex: 1, fontSize: 12, color: INK, fontWeight: '600', marginLeft: 4 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', backgroundColor: '#faf6ec', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 2, borderColor: INK, padding: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetTitle: { fontSize: 24, fontWeight: '900', color: INK },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  resetText: { fontSize: 12, fontWeight: '700', color: INK },
  closeBtn: { padding: 6, borderWidth: 2, borderColor: INK, borderRadius: 10, backgroundColor: '#FFFFFF' },

  statBox: { flex: 1, alignItems: 'center', paddingVertical: 8, borderWidth: 2, borderColor: INK, borderRadius: 12, backgroundColor: '#FFFFFF' },
  statNum: { fontSize: 22, fontWeight: '900', color: INK, marginTop: 2 },
  statLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(0,0,0,0.65)' },
  note: { fontSize: 12, color: 'rgba(0,0,0,0.6)', marginTop: 10 },
  muted: { fontSize: 13, color: 'rgba(0,0,0,0.6)' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: INK },
  dnaBar: { flexDirection: 'row', height: 20, borderWidth: 2, borderColor: INK, borderRadius: 8, overflow: 'hidden', marginBottom: 10 },
  dnaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  dnaSwatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 2, borderColor: INK },
  dnaGenre: { flex: 1, fontSize: 14, color: INK },
  dnaPct: { fontSize: 14, fontWeight: '800', color: INK },
  digBtn: { marginTop: 10, paddingVertical: 10, borderWidth: 2, borderColor: INK, borderRadius: 12, backgroundColor: MINT, alignItems: 'center' },
  digText: { fontSize: 14, fontWeight: '800', color: INK },

  likedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  likedCover: { width: 44, height: 44, borderRadius: 10, borderWidth: 2, borderColor: INK, backgroundColor: YELLOW },
  likedTitle: { fontSize: 14, fontWeight: '800', color: INK },
  likedArtist: { fontSize: 12, color: 'rgba(0,0,0,0.6)' },
});
