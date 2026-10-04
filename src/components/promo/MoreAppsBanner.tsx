/**
 * Cross-promotion for Amulet Studios' other App Store apps.
 * Icons are bundled (assets/promo) so the banner works offline and needs no
 * request to Apple. Taps open the App Store page directly.
 */
import React from 'react';
import { View, Text, TouchableOpacity, Linking, Platform, StyleSheet, type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';

interface PromoApp {
  id: string;
  name: string;
  taglineKey: string;
  icon: ImageSourcePropType;
  url: string;
}

const APPS: PromoApp[] = [
  {
    id: '6795818349',
    name: 'Floodlings',
    taglineKey: 'promo.floodlingsTagline',
    icon: require('../../../assets/promo/floodlings.jpg'),
    url: 'https://apps.apple.com/us/app/floodlings-match-game/id6795818349',
  },
  {
    id: '6795014997',
    name: "Blocky's Blitz",
    taglineKey: 'promo.blockysBlitzTagline',
    icon: require('../../../assets/promo/blockys-blitz.jpg'),
    url: 'https://apps.apple.com/us/app/blockys-blitz/id6795014997',
  },
];

async function openStorePage(app: PromoApp) {
  // itms-apps:// jumps straight into the App Store app instead of Safari.
  if (Platform.OS === 'ios') {
    try {
      await Linking.openURL(`itms-apps://apps.apple.com/app/id${app.id}`);
      return;
    } catch {
      // fall through to the web link
    }
  }
  Linking.openURL(app.url).catch(() => {});
}

const MoreAppsBanner: React.FC<{ style?: object }> = ({ style }) => {
  const { t } = useTranslation();
  return (
    <View style={[s.card, style]}>
      <Text style={s.title}>{t('promo.title')}</Text>
      <Text style={s.subtitle}>{t('promo.subtitle')}</Text>
      {APPS.map((app, i) => (
        <TouchableOpacity
          key={app.id}
          onPress={() => openStorePage(app)}
          activeOpacity={0.7}
          accessibilityRole="link"
          accessibilityLabel={t('promo.openA11y', { name: app.name })}
          style={[s.row, i > 0 && s.rowDivider]}
        >
          <Image source={app.icon} style={s.icon} />
          <View style={s.info}>
            <Text style={s.name} numberOfLines={1}>{app.name}</Text>
            <Text style={s.tagline} numberOfLines={2}>{t(app.taglineKey)}</Text>
          </View>
          <View style={s.get}>
            <Text style={s.getText}>{t('promo.get')}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
};

export default MoreAppsBanner;

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#111' },
  subtitle: { fontSize: 12, color: '#6b7280', marginTop: 2, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' },
  icon: { width: 52, height: 52, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#d1d5db' },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '600', color: '#111' },
  tagline: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  get: { backgroundColor: '#eef2ff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  getText: { color: '#2563eb', fontWeight: '700', fontSize: 13 },
});
