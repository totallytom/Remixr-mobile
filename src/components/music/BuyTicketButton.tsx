import React, { useEffect, useState } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, Linking, Alert } from 'react-native';
import { TicketService } from '../../services/ticketService';
import { useStore } from '../../store/useStore';
import { IN_APP_TICKETS_ENABLED } from '../../config/features';
import { requireAuth } from '../auth/GuestPrompt';

interface Props {
  concertId: string;
  capacity?: number;
  // SearchScreen places this inline in a button row rather than as its own block —
  // compact drops the block-level margin/padding used on ArtistScreen/ProfileByIdScreen.
  compact?: boolean;
}

// Shared across ArtistScreen / ProfileByIdScreen / SearchScreen — anywhere a fan
// (not the host) sees a concert that has a price but no external ticketUrl, i.e.
// the host opted into in-app ticketing instead of linking out to Eventbrite/etc.
const BuyTicketButton: React.FC<Props> = ({ concertId, capacity, compact }) => {
  const { isAuthenticated } = useStore() as any;
  const [loading, setLoading] = useState(false);
  const [soldOut, setSoldOut] = useState(false);

  useEffect(() => {
    if (!IN_APP_TICKETS_ENABLED || capacity == null) return;
    let cancelled = false;
    TicketService.getSoldCount(concertId).then((sold) => {
      if (!cancelled && sold >= capacity) setSoldOut(true);
    });
    return () => { cancelled = true; };
  }, [concertId, capacity]);

  const handlePress = async () => {
    if (!requireAuth('generic')) return;
    setLoading(true);
    try {
      // Stripe Checkout opens in the browser and returns to My Tickets
      // (sypher://tickets) when payment completes.
      const { url } = await TicketService.purchaseTicket(concertId);
      await Linking.openURL(url);
    } catch (error) {
      // The authoritative capacity check runs server-side at payment-confirmation
      // time — a sold-out rejection can still surface here even past the client
      // pre-check above, if it sold out in between.
      Alert.alert('Checkout failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Phase 2 feature: renders nothing until in-app ticketing is switched on.
  if (!IN_APP_TICKETS_ENABLED) return null;

  if (soldOut) {
    return (
      <Text className={compact ? 'text-gray-500 text-xs font-medium' : 'mt-3 text-gray-500 text-sm font-medium'}>Sold out</Text>
    );
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={loading}
      className={
        compact
          ? 'px-3 py-1.5 bg-purple-600 rounded-lg flex-row items-center gap-1.5'
          : 'mt-3 px-4 py-2 bg-primary-600 rounded-lg self-start flex-row items-center gap-2'
      }
    >
      {loading
        ? <ActivityIndicator size="small" color="#fff" />
        : <Text className={compact ? 'text-white text-xs font-medium' : 'text-white text-sm'}>{compact ? 'Buy ticket' : 'Buy Ticket'}</Text>}
    </TouchableOpacity>
  );
};

export default BuyTicketButton;
