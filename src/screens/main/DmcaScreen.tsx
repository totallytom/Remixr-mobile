import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabase';

const DESIGNATED_AGENT = {
  name: 'Thomas Kim',
  email: 'thomashkim7@gmail.com',
  address: '1111 Parsippany Blvd Parsippany NJ 07054',
};

type Status = 'idle' | 'submitting' | 'success' | 'error';

// ── Small reusable pieces ─────────────────────────────────────────────────────

function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <View style={styles.numberedList}>
      {items.map((item, i) => (
        <View key={i} style={styles.numberedItem}>
          <Text style={styles.numberedIndex}>{i + 1}.</Text>
          <Text style={styles.numberedText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

const DmcaScreen: React.FC = () => {
  const [form, setForm] = useState({
    claimantName: '',
    claimantEmail: '',
    claimantAddress: '',
    infringingUrl: '',
    originalWork: '',
    swornStatement: false,
  });
  const [status, setStatus] = useState<Status>('idle');
  const [noticeId, setNoticeId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const set = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!form.swornStatement) {
      setErrorMsg('You must check the sworn statement to submit.');
      return;
    }
    if (!form.claimantName.trim() || !form.claimantEmail.trim() ||
        !form.infringingUrl.trim() || !form.originalWork.trim()) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }
    setStatus('submitting');
    setErrorMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('dmca-takedown', { body: form });
      if (error) throw error;
      setNoticeId(data?.noticeId ?? null);
      setStatus('success');
    } catch (err) {
      console.error(err);
      setErrorMsg('Submission failed. Please email ' + DESIGNATED_AGENT.email + ' directly.');
      setStatus('error');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Page heading */}
          <View style={styles.pageHeader}>
            <Text style={styles.pageTitle}>DMCA Takedown Policy</Text>
            <Text style={styles.pageSubtitle}>
              Sypher respects intellectual property rights and complies with the Digital Millennium
              Copyright Act (17 U.S.C. § 512). If you believe content on Sypher infringes your
              copyright, submit a notice below.
            </Text>
          </View>

          {/* Designated agent */}
          <SectionCard>
            <SectionTitle>Designated Copyright Agent</SectionTitle>
            <Text style={styles.mutedText}>Notices must be sent to our registered DMCA agent:</Text>
            <View style={styles.agentList}>
              <Text style={styles.agentRow}>
                <Text style={styles.agentKey}>Name:  </Text>
                {DESIGNATED_AGENT.name}
              </Text>
              <Text style={styles.agentRow}>
                <Text style={styles.agentKey}>Email:  </Text>
                {DESIGNATED_AGENT.email}
              </Text>
              <Text style={styles.agentRow}>
                <Text style={styles.agentKey}>Address:  </Text>
                {DESIGNATED_AGENT.address}
              </Text>
            </View>
          </SectionCard>

          {/* What to include */}
          <SectionCard>
            <SectionTitle>What your notice must include</SectionTitle>
            <Text style={styles.mutedText}>
              Per 17 U.S.C. § 512(c)(3), a valid DMCA notice must contain:
            </Text>
            <NumberedList items={[
              'Your physical or electronic signature (your full name serves as signature here)',
              'Identification of the copyrighted work you claim has been infringed',
              'The URL of the allegedly infringing content on Sypher',
              'Your contact information (name, address, email)',
              'A statement that you have a good faith belief the use is not authorized',
              'A statement, under penalty of perjury, that the information is accurate and you are the rights holder (or authorized to act on their behalf)',
            ]} />
          </SectionCard>

          {/* Form or success */}
          {status === 'success' ? (
            <View style={styles.successCard}>
              <Text style={styles.successCheck}>✓</Text>
              <Text style={styles.successTitle}>Notice Received</Text>
              <Text style={styles.successBody}>
                We've received your DMCA notice and will act on it within 24 hours.
                {noticeId ? ` Your reference ID is ${noticeId}.` : ''}
              </Text>
              <Text style={styles.successNote}>
                If a matching track was found, it has already been removed from public listings.
                The uploader has been notified and has the right to file a counter-notice.
              </Text>
            </View>
          ) : (
            <SectionCard>
              <SectionTitle>Submit a Takedown Notice</SectionTitle>

              <View style={styles.field}>
                <Text style={styles.label}>Your Full Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Jane Smith"
                  placeholderTextColor={MUTED}
                  value={form.claimantName}
                  onChangeText={(v) => set('claimantName', v)}
                  autoCorrect={false}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Your Email *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="jane@example.com"
                  placeholderTextColor={MUTED}
                  value={form.claimantEmail}
                  onChangeText={(v) => set('claimantEmail', v)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Mailing Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="123 Main St, City, State, ZIP, Country"
                  placeholderTextColor={MUTED}
                  value={form.claimantAddress}
                  onChangeText={(v) => set('claimantAddress', v)}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>URL of Infringing Content on Sypher *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://sypher.app/..."
                  placeholderTextColor={MUTED}
                  value={form.infringingUrl}
                  onChangeText={(v) => set('infringingUrl', v)}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.hint}>Paste the direct link to the track or profile page.</Text>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Description of the Original Copyrighted Work *</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder={"e.g. 'My original song titled X, released on Y label, available at Z'"}
                  placeholderTextColor={MUTED}
                  value={form.originalWork}
                  onChangeText={(v) => set('originalWork', v)}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Sworn statement checkbox */}
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => set('swornStatement', !form.swornStatement)}
                activeOpacity={0.8}
              >
                <View style={[styles.checkbox, form.swornStatement && styles.checkboxChecked]}>
                  {form.swornStatement && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>
                  I have a good faith belief that the use of the copyrighted material described
                  above is not authorized by the copyright owner, its agent, or the law. I swear,
                  under penalty of perjury, that the information in this notification is accurate
                  and that I am the copyright owner or authorized to act on the copyright owner's
                  behalf.{'  '}
                  <Text style={styles.required}>*</Text>
                </Text>
              </TouchableOpacity>

              {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

              <TouchableOpacity
                style={[styles.submitButton, status === 'submitting' && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={status === 'submitting'}
                activeOpacity={0.85}
              >
                {status === 'submitting' ? (
                  <View style={styles.submitInner}>
                    <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.submitText}>Submitting…</Text>
                  </View>
                ) : (
                  <Text style={styles.submitText}>Submit DMCA Notice</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.disclaimer}>
                False DMCA claims are subject to liability under 17 U.S.C. § 512(f). Misuse of
                this form may result in legal action against you.
              </Text>
            </SectionCard>
          )}

          {/* Counter-notice */}
          <SectionCard>
            <SectionTitle>Counter-Notice</SectionTitle>
            <Text style={styles.mutedText}>
              If your content was removed and you believe it was a mistake, you may submit a
              counter-notice to{' '}
              <Text
                style={styles.emailLink}
                onPress={() => Linking.openURL(`mailto:${DESIGNATED_AGENT.email}`)}
              >
                {DESIGNATED_AGENT.email}
              </Text>
              {' '}with:
            </Text>
            <NumberedList items={[
              'Your full name, address, and email',
              'Identification of the removed content and its URL before removal',
              'A statement under penalty of perjury that the removal was a mistake or misidentification',
              'Consent to jurisdiction of the federal court in your district',
            ]} />
            <Text style={styles.footnote}>
              Upon receiving a valid counter-notice, we will forward it to the claimant. If they
              do not file a court action within 10–14 business days, we may restore the content.
            </Text>
          </SectionCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const DARK = '#0a0a14';
const DARK2 = '#1a1a28';
const BORDER = 'rgba(255,255,255,0.1)';
const MUTED = '#6b6b8a';
const PURPLE = '#7c3aed';

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: DARK },
  flex: { flex: 1 },
  scroll: { padding: 16, gap: 16, paddingBottom: 40 },

  pageHeader: { gap: 8, marginBottom: 4 },
  pageTitle: { fontSize: 26, fontWeight: '700', color: '#fff' },
  pageSubtitle: { fontSize: 13, color: MUTED, lineHeight: 20 },

  card: {
    backgroundColor: DARK2,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  mutedText: { fontSize: 13, color: MUTED, lineHeight: 19 },

  agentList: { gap: 4, marginTop: 2 },
  agentRow: { fontSize: 13, color: '#d1d5db', lineHeight: 20 },
  agentKey: { fontWeight: '600', color: '#fff' },

  numberedList: { gap: 8, marginTop: 4 },
  numberedItem: { flexDirection: 'row', gap: 8 },
  numberedIndex: { fontSize: 13, color: MUTED, minWidth: 18 },
  numberedText: { fontSize: 13, color: '#d1d5db', flex: 1, lineHeight: 19 },

  field: { gap: 4 },
  label: { fontSize: 13, fontWeight: '500', color: '#d1d5db' },
  input: {
    backgroundColor: '#0f0f1e',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
  },
  textarea: { minHeight: 80, paddingTop: 12 },
  hint: { fontSize: 11, color: '#4b4b6a' },

  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    backgroundColor: '#0f0f1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: MUTED,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: PURPLE, borderColor: PURPLE },
  checkmark: { color: '#fff', fontSize: 11, fontWeight: '700' },
  checkboxLabel: { flex: 1, fontSize: 12, color: '#d1d5db', lineHeight: 18 },
  required: { color: '#f87171' },

  errorText: { fontSize: 13, color: '#f87171' },

  submitButton: {
    backgroundColor: PURPLE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitInner: { flexDirection: 'row', alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  disclaimer: { fontSize: 11, color: '#4b4b6a', textAlign: 'center' },

  successCard: {
    backgroundColor: 'rgba(6,78,59,0.3)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    gap: 10,
  },
  successCheck: { fontSize: 36 },
  successTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
  successBody: { fontSize: 13, color: '#d1d5db', textAlign: 'center', lineHeight: 19 },
  successNote: { fontSize: 12, color: MUTED, textAlign: 'center', lineHeight: 18 },

  emailLink: { color: '#8b5cf6', textDecorationLine: 'underline' },
  footnote: { fontSize: 12, color: '#4b4b6a', lineHeight: 18 },
});

export default DmcaScreen;
