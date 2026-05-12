import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react-native';
import { useAlerts, type AlertItem, type AlertType } from '../contexts/AlertContext';

// ─── Per-type config ──────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  AlertType,
  { bg: string; border: string; Icon: React.ComponentType<{ size: number; color: string }> }
> = {
  success: { bg: 'rgba(16,185,129,0.95)',  border: 'rgba(52,211,153,0.5)',  Icon: CheckCircle2 },
  error:   { bg: 'rgba(239,68,68,0.95)',   border: 'rgba(252,165,165,0.5)', Icon: XCircle },
  warning: { bg: 'rgba(245,158,11,0.95)',  border: 'rgba(252,211,77,0.5)',  Icon: AlertTriangle },
  info:    { bg: 'rgba(139,92,246,0.95)',  border: 'rgba(196,181,253,0.5)', Icon: Info },
};

// ─── Single animated alert item ───────────────────────────────────────────────

function AlertToastItem({
  alert,
  onDismiss,
}: {
  alert: AlertItem;
  onDismiss: () => void;
}) {
  const { bg, border, Icon } = TYPE_CONFIG[alert.type];

  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(60)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, stiffness: 400, damping: 30 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.spring(translateX, { toValue: 60, useNativeDriver: true, stiffness: 400, damping: 30 }),
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  return (
    <Animated.View
      style={[
        styles.item,
        { backgroundColor: bg, borderColor: border, opacity, transform: [{ translateX }] },
      ]}
    >
      <Icon size={20} color="#fff" />

      <View style={styles.textWrap}>
        {alert.title ? <Text style={styles.title}>{alert.title}</Text> : null}
        <Text style={styles.message}>{alert.message}</Text>
      </View>

      <TouchableOpacity onPress={dismiss} style={styles.closeBtn} activeOpacity={0.7} hitSlop={8}>
        <X size={16} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Container (render at root level, absolutely positioned) ──────────────────

export default function AlertToast() {
  const { alerts, removeAlert } = useAlerts();

  if (alerts.length === 0) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {alerts.map(alert => (
        <AlertToastItem
          key={alert.id}
          alert={alert}
          onDismiss={() => removeAlert(alert.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 56,
    right: 16,
    left: 16,
    zIndex: 100,
    gap: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 2,
  },
  message: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    lineHeight: 18,
  },
  closeBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
