/**
 * Shown in place of account-only tabs (Upload, Chat, your Profile) while
 * browsing as a guest.
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Upload, User, Globe } from 'lucide-react-native';
import i18n from '../../i18n';
import { B, BrutalButton, ChoiceChips, Raised } from '../../components/ui/brutal';
import { openAuthScreen } from '../../navigation/navigationRef';
import { FONTS } from '../../utils/fonts';

type Kind = 'upload' | 'chat' | 'profile';

const ICONS = { upload: Upload, chat: MessageCircle, profile: User } as const;

const GuestGateScreen: React.FC<{ kind: Kind }> = ({ kind }) => {
  const { t } = useTranslation();
  const Icon = ICONS[kind];
  return (
    <SafeAreaView style={st.screen} edges={['top']}>
      <ScrollView contentContainerStyle={st.wrap}>
        <Raised offset={6} style={st.card}>
          <View style={st.icon}><Icon size={26} color={B.black} /></View>
          <Text style={st.title}>{t(`guest.gate.${kind}.title`)}</Text>
          <Text style={st.body}>{t(`guest.gate.${kind}.body`)}</Text>
          <View style={{ gap: 12, alignSelf: 'stretch', marginTop: 8 }}>
            <BrutalButton label={t('guest.signUp')} tone="teal" full onPress={() => openAuthScreen('Signup')} />
            <BrutalButton label={t('guest.signIn')} tone="white" full onPress={() => openAuthScreen('Login')} />
          </View>
        </Raised>

        {/* Guests have no Settings, so language lives here. */}
        {kind === 'profile' && (
          <Raised style={[st.card, { alignItems: 'stretch' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Globe size={16} color={B.black} />
              <Text style={st.sectionTitle}>{t('settings.language.title')}</Text>
            </View>
            <ChoiceChips
              value={(['en', 'ko', 'ja'].includes(i18n.language) ? i18n.language : 'en') as 'en' | 'ko' | 'ja'}
              onChange={(lang) => i18n.changeLanguage(lang)}
              options={(['en', 'ko', 'ja'] as const).map(lang => ({ value: lang, label: t(`settings.language.${lang}`) }))}
            />
          </Raised>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export const GuestUploadGate = () => <GuestGateScreen kind="upload" />;
export const GuestChatGate = () => <GuestGateScreen kind="chat" />;
export const GuestProfileGate = () => <GuestGateScreen kind="profile" />;

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: B.cream },
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 20, gap: 20, paddingBottom: 160 },
  card: {
    alignItems: 'center', gap: 10, padding: 24, borderWidth: 2, borderColor: B.black, backgroundColor: B.white,
  },
  icon: {
    width: 56, height: 56, borderRadius: 16, borderWidth: 2, borderColor: B.black,
    backgroundColor: B.teal, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  title: { color: B.black, fontSize: 24, fontFamily: FONTS.display, textAlign: 'center' },
  body: { color: B.muted, fontSize: 14, fontFamily: FONTS.medium, textAlign: 'center', lineHeight: 20 },
  sectionTitle: { color: B.black, fontSize: 15, fontFamily: FONTS.bold },
});

export default GuestGateScreen;
