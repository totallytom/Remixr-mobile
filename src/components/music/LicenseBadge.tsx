import React from 'react';
import { Text, TouchableOpacity, View, Linking, StyleSheet } from 'react-native';
import { licenseInfo, licenseText } from '../../config/licenses';

interface Props {
  license?: string | null;
  /** Light text on dark backgrounds (e.g. over cover art). */
  onDark?: boolean;
}

/**
 * Small licence chip: "© All rights reserved" or a Creative Commons badge
 * that opens the licence. Mirrors the website's LicenseBadge.
 */
const LicenseBadge: React.FC<Props> = ({ license, onDark = false }) => {
  if (!license) return null;
  const info = licenseInfo(license);
  const isCC = info.value !== 'all_rights_reserved';
  const text_ = licenseText(info);
  const chip = [
    styles.chip,
    isCC ? styles.cc : styles.arr,
    onDark && { borderColor: '#FFFFFF' },
  ];
  const text = (
    <Text style={[styles.text, onDark && !isCC && { color: '#FFFFFF' }]} numberOfLines={1}>
      {text_.short}
    </Text>
  );

  if (info.url) {
    return (
      <TouchableOpacity
        onPress={() => Linking.openURL(info.url!)}
        style={chip}
        accessibilityRole="link"
        accessibilityLabel={`${text_.name}. ${text_.summary}`}
        hitSlop={8}
      >
        {text}
      </TouchableOpacity>
    );
  }
  return <View style={chip} accessible accessibilityLabel={`${text_.name}. ${text_.summary}`}>{text}</View>;
};

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 2, borderColor: '#000000' },
  cc: { backgroundColor: '#c9f7d9' },
  arr: { backgroundColor: 'transparent' },
  text: { fontSize: 10, fontWeight: '800', color: '#000000' },
});

export default LicenseBadge;
