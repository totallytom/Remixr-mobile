import React, { useState, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text as RNText, TouchableOpacity, type TextProps } from 'react-native';
import { FONTS } from '../../utils/fonts';
import { colors } from '../../theme';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { X, CheckCircle2, XCircle } from 'lucide-react-native';
import { TicketService } from '../../services/ticketService';
import type { ProfileStackParamList } from '../../navigation/stacks/ProfileStack';

const Text = ({ style, ...props }: TextProps) => (
  <RNText style={[{ fontFamily: FONTS.body }, style]} {...props} />
);

type NavProp = NativeStackNavigationProp<ProfileStackParamList, 'TicketScanner'>;
type RouteProps = RouteProp<ProfileStackParamList, 'TicketScanner'>;

type ScanFeedback = { kind: 'success' | 'error'; message: string } | null;

// Rescanning the same QR immediately (before the user moves the phone away) would
// otherwise fire redeemTicket() repeatedly for one ticket — lock scanning briefly
// after each attempt instead of debouncing on the token itself.
const RESCAN_DELAY_MS = 1500;

const TicketScannerScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const { concertTitle } = route.params;

  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState<ScanFeedback>(null);
  const [checkedInCount, setCheckedInCount] = useState(0);
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScan = useCallback(async (result: BarcodeScanningResult) => {
    if (locked) return;
    setLocked(true);
    try {
      await TicketService.redeemTicket(result.data);
      setCheckedInCount((c) => c + 1);
      setFeedback({ kind: 'success', message: 'Checked in' });
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Invalid ticket',
      });
    } finally {
      unlockTimer.current = setTimeout(() => {
        setLocked(false);
        setFeedback(null);
      }, RESCAN_DELAY_MS);
    }
  }, [locked]);

  if (!permission) {
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <View className="flex-1 items-center justify-center px-6 gap-4">
          <Text className="text-lg font-semibold text-center" style={{ color: colors.text }}>
            Camera access needed to scan tickets
          </Text>
          <TouchableOpacity
            onPress={requestPermission}
            className="px-5 py-2.5 rounded-xl"
            style={{ backgroundColor: colors.accent }}
          >
            <Text className="text-black text-sm font-medium">Grant camera access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={locked ? undefined : handleScan}
      />

      <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0 }} edges={['top']}>
        <View className="flex-row items-center justify-between px-4 pt-4">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          >
            <X size={20} color="#fff" />
          </TouchableOpacity>
          <View className="items-center">
            <Text className="text-white font-semibold" numberOfLines={1}>{concertTitle ?? 'Scan tickets'}</Text>
            <Text className="text-white/60 text-xs">{checkedInCount} checked in</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {feedback && (
        <View
          className="absolute bottom-16 left-6 right-6 flex-row items-center justify-center gap-2 py-4 rounded-2xl"
          style={{ backgroundColor: feedback.kind === 'success' ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.9)' }}
        >
          {feedback.kind === 'success'
            ? <CheckCircle2 size={20} color="#fff" />
            : <XCircle size={20} color="#fff" />}
          <Text className="text-white font-semibold">{feedback.message}</Text>
        </View>
      )}
    </View>
  );
};

export default TicketScannerScreen;
