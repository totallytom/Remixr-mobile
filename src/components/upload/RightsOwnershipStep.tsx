/**
 * "Rights & Ownership" upload step — shown after audio + cover art, before publish.
 * Required fields stay short so indie artists aren't blocked; the optional section
 * fast-tracks trust. Validation lives in trackUploadService.validateRights().
 */
import React, { createContext, useContext, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Check, ChevronDown, ChevronUp, FileText, Plus, X, AlertTriangle, Lock } from 'lucide-react-native';
import { colors } from '../../theme';
import {
  attestationText,
  MAX_PROOF_MB,
  OWNERSHIP_OPTIONS,
  PROOF_DOCUMENT_MIME,
  SAMPLES_OPTIONS,
  unclearedSamplesMessage,
  needsPermissionProof,
  needsSampleSource,
  type RightsDeclaration,
} from '../../services/trackUploadService';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

export interface RightsPalette {
  text: string;
  textSecondary: string;
  textMuted: string;
  surface: string;
  input: string;
  border: string;
  selected: string;
  danger: string;
}

export const LIGHT_RIGHTS_PALETTE: RightsPalette = {
  text: colors.text,
  textSecondary: colors.textSecondary,
  textMuted: colors.textMuted,
  surface: colors.surface,
  input: colors.surfaceElevated,
  border: colors.border,
  selected: colors.primary,
  danger: '#ef4444',
};

export const DARK_RIGHTS_PALETTE: RightsPalette = {
  text: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.6)',
  textMuted: 'rgba(255,255,255,0.35)',
  surface: '#1e293b',
  input: '#334155',
  border: '#475569',
  selected: '#8aec9f',
  danger: '#f87171',
};

export interface IsrcTrack {
  id: string;
  title: string;
  isrc: string;
}

interface Props {
  value: RightsDeclaration;
  onChange: (next: RightsDeclaration) => void;
  isrcTracks: IsrcTrack[];
  onIsrcChange: (trackId: string, isrc: string) => void;
  palette?: RightsPalette;
}

const PaletteContext = createContext<RightsPalette>(LIGHT_RIGHTS_PALETTE);

// Module-level (not defined inside the step's render) so TextInputs keep focus
// across re-renders.
const Label: React.FC<{ children: React.ReactNode; required?: boolean; hint?: string }> = ({ children, required, hint }) => {
  const p = useContext(PaletteContext);
  return (
    <View className="mb-1.5">
      <Text className="text-sm font-medium" style={{ color: p.text }}>
        {children}
        {required ? <Text style={{ color: p.danger }}> *</Text> : null}
      </Text>
      {hint ? <Text className="text-xs mt-0.5" style={{ color: p.textMuted }}>{hint}</Text> : null}
    </View>
  );
};

const Field: React.FC<React.ComponentProps<typeof TextInput>> = (props) => {
  const p = useContext(PaletteContext);
  return (
    <TextInput
      placeholderTextColor={p.textMuted}
      {...props}
      className="px-4 py-3 rounded-xl border"
      style={[{ backgroundColor: p.input, borderColor: p.border, color: p.text }, props.style]}
    />
  );
};

const Option: React.FC<{ label: string; selected: boolean; onPress: () => void }> = ({ label, selected, onPress }) => {
  const p = useContext(PaletteContext);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="flex-row items-center gap-3 px-4 py-3 rounded-xl border"
      style={{ borderColor: selected ? p.selected : p.border, backgroundColor: selected ? p.selected + '22' : p.input }}
    >
      <View
        className="w-4 h-4 rounded-full border-2 items-center justify-center"
        style={{ borderColor: selected ? p.selected : p.textMuted }}
      >
        {selected ? <View className="w-2 h-2 rounded-full" style={{ backgroundColor: p.selected }} /> : null}
      </View>
      <Text className="flex-1 text-sm" style={{ color: p.text }}>{i18n.t(label)}</Text>
    </TouchableOpacity>
  );
};

const RightsOwnershipStep: React.FC<Props> = ({
  value,
  onChange,
  isrcTracks,
  onIsrcChange,
  palette: p = LIGHT_RIGHTS_PALETTE,
}) => {
  const { t } = useTranslation();
  const [showOptional, setShowOptional] = useState(false);
  const set = <K extends keyof RightsDeclaration>(key: K, v: RightsDeclaration[K]) =>
    onChange({ ...value, [key]: v });

  const inputStyle = { backgroundColor: p.input, borderColor: p.border, color: p.text };

  const pickProofFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: PROOF_DOCUMENT_MIME, copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      if ((a.size ?? 0) > MAX_PROOF_MB * 1024 * 1024) {
        Alert.alert(t('rights.proofTooBigTitle'), t('rights.proofTooBig', { mb: MAX_PROOF_MB }));
        return;
      }
      set('permissionProofFile', { uri: a.uri, name: a.name, size: a.size ?? 0, mimeType: a.mimeType });
    } catch {
      Alert.alert(t('common.error'), t('rights.pickerFailed'));
    }
  };

  const updateSongwriter = (i: number, name: string) =>
    set('songwriters', value.songwriters.map((s, idx) => (idx === i ? name : s)));

  return (
    <PaletteContext.Provider value={p}>
      <View className="gap-5">
        <View>
          <Text className="text-xs font-semibold uppercase tracking-wider" style={{ color: p.textMuted }}>
            {t('rights.heading')}
          </Text>
          <Text className="text-xs mt-1" style={{ color: p.textSecondary }}>
            {t('rights.intro')}
          </Text>
        </View>

        {/* Ownership type */}
        <View>
          <Label required>{t('rights.ownershipType')}</Label>
          <View className="gap-2">
            {OWNERSHIP_OPTIONS.map((o) => (
              <Option
                key={o.value}
                label={o.label}
                selected={value.ownershipType === o.value}
                onPress={() => set('ownershipType', o.value)}
              />
            ))}
          </View>
        </View>

        {/* Songwriters */}
        <View>
          <Label required hint={t('rights.songwritersHint')}>
            {t('rights.songwriters')}
          </Label>
          <View className="gap-2">
            {value.songwriters.map((name, i) => (
              <View key={i} className="flex-row items-center gap-2">
                <Field
                  value={name}
                  onChangeText={(v) => updateSongwriter(i, v)}
                  placeholder={t('rights.songwriterName')}
                  style={{ flex: 1 }}
                />
                {value.songwriters.length > 1 ? (
                  <TouchableOpacity
                    onPress={() => set('songwriters', value.songwriters.filter((_, idx) => idx !== i))}
                    className="p-2"
                  >
                    <X size={16} color={p.danger} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
            <TouchableOpacity
              onPress={() => set('songwriters', [...value.songwriters, ''])}
              className="flex-row items-center gap-1.5 self-start py-1"
            >
              <Plus size={14} color={p.textSecondary} />
              <Text className="text-sm" style={{ color: p.textSecondary }}>{t('rights.addSongwriter')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Samples */}
        <View>
          <Label required>{t('rights.samples')}</Label>
          <View className="gap-2">
            {SAMPLES_OPTIONS.map((o) => (
              <Option
                key={o.value}
                label={o.label}
                selected={value.samplesStatus === o.value}
                onPress={() => set('samplesStatus', o.value)}
              />
            ))}
          </View>
          {value.samplesStatus === 'uncleared' ? (
            <View
              className="flex-row gap-2 mt-2 p-3 rounded-xl border"
              style={{ borderColor: p.danger, backgroundColor: p.danger + '15' }}
            >
              <AlertTriangle size={16} color={p.danger} />
              <Text className="flex-1 text-xs" style={{ color: p.danger }}>{unclearedSamplesMessage()}</Text>
            </View>
          ) : null}
        </View>

        {needsSampleSource(value.samplesStatus) ? (
          <View>
            <Label required hint={t('rights.sampleSourceHint')}>{t('rights.sampleSource')}</Label>
            <Field
              value={value.sampleSource}
              onChangeText={(v) => set('sampleSource', v)}
              placeholder={t('rights.sampleSourcePlaceholder')}
            />
          </View>
        ) : null}

        {/* Permission proof */}
        {needsPermissionProof(value.ownershipType) ? (
          <View>
            <Label
              required
              hint={
                value.ownershipType === 'remix'
                  ? t('rights.proofHintRemix')
                  : t('rights.proofHintOnBehalf')
              }
            >
              {t('rights.proof')}
            </Label>
            {value.permissionProofFile ? (
              <View className="flex-row items-center gap-3 px-4 py-3 rounded-xl border" style={inputStyle}>
                <FileText size={18} color={p.textSecondary} />
                <Text className="flex-1 text-sm" numberOfLines={1} style={{ color: p.text }}>
                  {value.permissionProofFile.name}
                </Text>
                <TouchableOpacity onPress={() => set('permissionProofFile', null)}>
                  <Text className="text-sm" style={{ color: p.danger }}>{t('common.remove')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={pickProofFile}
                className="flex-row items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed"
                style={{ borderColor: p.border }}
              >
                <FileText size={16} color={p.textSecondary} />
                <Text className="text-sm" style={{ color: p.textSecondary }}>
                  {t('rights.proofAttach', { mb: MAX_PROOF_MB })}
                </Text>
              </TouchableOpacity>
            )}
            <Text className="text-xs mt-1.5" style={{ color: p.textMuted }}>
              {t('rights.proofReviewed')}
            </Text>
          </View>
        ) : null}

        {/* Legal name */}
        <View>
          <Label required>{t('rights.legalName')}</Label>
          <Field
            value={value.legalName}
            onChangeText={(v) => set('legalName', v)}
            placeholder={t('rights.legalNamePlaceholder')}
            autoCapitalize="words"
            textContentType="name"
          />
          <View className="flex-row items-center gap-1.5 mt-1.5">
            <Lock size={11} color={p.textMuted} />
            <Text className="text-xs" style={{ color: p.textMuted }}>
              {t('rights.legalNamePrivate')}
            </Text>
          </View>
        </View>

        {/* Attestation */}
        <TouchableOpacity
          onPress={() => set('attested', !value.attested)}
          activeOpacity={0.7}
          className="flex-row items-start gap-3"
        >
          <View
            className="w-5 h-5 mt-0.5 rounded border-2 items-center justify-center"
            style={{
              borderColor: value.attested ? p.selected : p.textMuted,
              backgroundColor: value.attested ? p.selected : 'transparent',
            }}
          >
            {value.attested ? <Check size={12} color="#000" strokeWidth={3} /> : null}
          </View>
          <Text className="flex-1 text-xs leading-5" style={{ color: p.textSecondary }}>
            {attestationText()}
            <Text style={{ color: p.danger }}> *</Text>
          </Text>
        </TouchableOpacity>

        {/* Optional */}
        <View className="rounded-xl border" style={{ borderColor: p.border }}>
          <TouchableOpacity
            onPress={() => setShowOptional((v) => !v)}
            className="flex-row items-center justify-between px-4 py-3"
          >
            <View className="flex-1">
              <Text className="text-sm font-medium" style={{ color: p.text }}>{t('rights.optionalTitle')}</Text>
              <Text className="text-xs mt-0.5" style={{ color: p.textMuted }}>{t('rights.optionalSub')}</Text>
            </View>
            {showOptional ? <ChevronUp size={18} color={p.textSecondary} /> : <ChevronDown size={18} color={p.textSecondary} />}
          </TouchableOpacity>

          {showOptional ? (
            <View className="gap-5 px-4 pb-4">
              <View>
                <Label hint={t('rights.isrcHint')}>ISRC</Label>
                <View className="gap-2">
                  {isrcTracks.map((track) => (
                    <View key={track.id}>
                      {isrcTracks.length > 1 ? (
                        <Text className="text-xs mb-1" numberOfLines={1} style={{ color: p.textSecondary }}>
                          {track.title || t('rights.untitled')}
                        </Text>
                      ) : null}
                      <Field
                        value={track.isrc}
                        onChangeText={(v) => onIsrcChange(track.id, v)}
                        placeholder="USABC2412345"
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={15}
                      />
                    </View>
                  ))}
                </View>
              </View>

              <View>
                <Label>{t('rights.released')}</Label>
                <View className="flex-row gap-2">
                  {[true, false].map((yes) => (
                    <TouchableOpacity
                      key={String(yes)}
                      onPress={() => set('alreadyReleased', value.alreadyReleased === yes ? null : yes)}
                      className="flex-1 py-2.5 rounded-xl border items-center"
                      style={{
                        borderColor: value.alreadyReleased === yes ? p.selected : p.border,
                        backgroundColor: value.alreadyReleased === yes ? p.selected + '22' : p.input,
                      }}
                    >
                      <Text className="text-sm" style={{ color: p.text }}>{yes ? t('rights.yes') : t('rights.no')}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {value.alreadyReleased ? (
                  <View className="gap-2 mt-2">
                    <Field
                      value={value.distributor}
                      onChangeText={(v) => set('distributor', v)}
                      placeholder={t('rights.distributor')}
                    />
                    <Field
                      value={value.releaseUrl}
                      onChangeText={(v) => set('releaseUrl', v)}
                      placeholder={t('rights.releaseUrl')}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                    />
                  </View>
                ) : null}
              </View>

              <View>
                <Label hint={t('rights.pLineHint')}>{t('rights.pLine')}</Label>
                <View className="flex-row gap-2">
                  <Field
                    value={value.pLineYear}
                    onChangeText={(v) => set('pLineYear', v.replace(/\D/g, ''))}
                    placeholder={t('rights.year')}
                    keyboardType="number-pad"
                    maxLength={4}
                    style={{ width: 88 }}
                  />
                  <Field
                    value={value.pLineOwner}
                    onChangeText={(v) => set('pLineOwner', v)}
                    placeholder={t('rights.recordingOwner')}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>

              <View>
                <Label hint={t('rights.cLineHint')}>{t('rights.cLine')}</Label>
                <View className="flex-row gap-2">
                  <Field
                    value={value.cLineYear}
                    onChangeText={(v) => set('cLineYear', v.replace(/\D/g, ''))}
                    placeholder={t('rights.year')}
                    keyboardType="number-pad"
                    maxLength={4}
                    style={{ width: 88 }}
                  />
                  <Field
                    value={value.cLineOwner}
                    onChangeText={(v) => set('cLineOwner', v)}
                    placeholder={t('rights.compositionOwner')}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>

              <View>
                <Label hint={t('rights.proHint')}>{t('rights.pro')}</Label>
                <View className="flex-row gap-2">
                  <Field
                    value={value.proAffiliation}
                    onChangeText={(v) => set('proAffiliation', v)}
                    placeholder={t('rights.proPlaceholder')}
                    style={{ flex: 1 }}
                  />
                  <Field
                    value={value.ipiNumber}
                    onChangeText={(v) => set('ipiNumber', v.replace(/\D/g, ''))}
                    placeholder={t('rights.ipi')}
                    keyboardType="number-pad"
                    maxLength={11}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>

              <View>
                <Label hint={t('rights.registrationHint')}>
                  {t('rights.registration')}
                </Label>
                <Field
                  value={value.copyrightRegistration}
                  onChangeText={(v) => set('copyrightRegistration', v)}
                  placeholder="SR0000123456"
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </PaletteContext.Provider>
  );
};

export default RightsOwnershipStep;
