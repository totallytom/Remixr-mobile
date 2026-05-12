import React from 'react';
import {
  Modal as RNModal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { X } from 'lucide-react-native';

interface ModalProps {
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  visible?: boolean;
}

const Modal: React.FC<ModalProps> = ({ onClose, title, children, visible = true }) => (
  <RNModal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onClose}
  >
    <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.card}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
          <X size={18} color="#6b7280" />
        </TouchableOpacity>

        {title ? <Text style={styles.title}>{title}</Text> : null}

        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </TouchableOpacity>
    </TouchableOpacity>
  </RNModal>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#0f0f1a',
    borderRadius: 14,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2a2a3a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  title: {
    color: '#a78bfa',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
    paddingRight: 32,
  },
  body: {
    maxHeight: 340,
  },
});

export default Modal;
