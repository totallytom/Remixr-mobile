/**
 * Required "I agree" checkbox on sign-up. App Store guideline 1.2: users of apps
 * with user-generated content must agree to terms that make clear there is no
 * tolerance for objectionable content or abusive users.
 */
import React from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { Check } from 'lucide-react-native';
import { Trans } from 'react-i18next';

export const TERMS_URL = 'https://info.re-mixed.net/terms';
export const PRIVACY_URL = 'https://info.re-mixed.net/privacy';

interface Props {
  accepted: boolean;
  onChange: (accepted: boolean) => void;
  textColor: string;
  linkColor: string;
  /** Checkbox fill when ticked. */
  accentColor?: string;
}

const TermsAgreement: React.FC<Props> = ({ accepted, onChange, textColor, linkColor, accentColor = '#8b5cf6' }) => (
  <TouchableOpacity
    onPress={() => onChange(!accepted)}
    activeOpacity={0.7}
    accessibilityRole="checkbox"
    accessibilityState={{ checked: accepted }}
    style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}
  >
    <View
      style={{
        width: 20,
        height: 20,
        marginTop: 1,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: accepted ? accentColor : textColor,
        backgroundColor: accepted ? accentColor : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {accepted && <Check size={13} color="#fff" strokeWidth={3} />}
    </View>
    <Text style={{ flex: 1, fontSize: 12, lineHeight: 18, color: textColor }}>
      <Trans
        i18nKey="auth.terms.agree"
        components={{
          terms: <Text style={{ color: linkColor, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(TERMS_URL)} />,
          privacy: <Text style={{ color: linkColor, textDecorationLine: 'underline' }} onPress={() => Linking.openURL(PRIVACY_URL)} />,
        }}
      />
    </Text>
  </TouchableOpacity>
);

export default TermsAgreement;
