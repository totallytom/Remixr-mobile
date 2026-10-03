import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Ticket rows are only ever created server-side, by the stripe-ticket-webhook Edge
// Function calling purchase_ticket() after Stripe confirms payment (see
// supabase/add_ticketing.sql). The app never inserts a ticket directly — it only
// starts checkout (ticket-checkout Edge Function) and reads back what was issued.

export interface Ticket {
  id: string;
  concertId: string;
  buyerId: string;
  qrToken: string;
  status: 'valid' | 'redeemed' | 'refunded';
  redeemedAt?: string;
  createdAt: string;
}

export interface TicketWithConcert extends Ticket {
  concert?: {
    id: string;
    title: string;
    date: string;
    venue: string;
    location: string;
  };
}

export class TicketService {
  // Starts Stripe Checkout for a ticket. The ticket row itself doesn't exist yet —
  // it's created by the backend webhook once Stripe confirms payment, which is
  // also where the capacity check (purchase_ticket()) runs.
  static async purchaseTicket(concertId: string): Promise<{ url: string; sessionId: string }> {
    const { data, error } = await supabase.functions.invoke('ticket-checkout', { body: { concertId } });
    if (error) {
      // Surface the function's own message (e.g. "This concert is sold out").
      if (error instanceof FunctionsHttpError) {
        const payload = await error.context.json().catch(() => null);
        throw new Error(payload?.error ?? 'Ticket checkout failed');
      }
      throw new Error(error.message);
    }
    if (!data?.url) throw new Error('Ticket checkout failed');
    return data;
  }

  // My Tickets screen — RLS restricts this to the caller's own tickets.
  static async getMyTickets(): Promise<TicketWithConcert[]> {
    const { data, error } = await supabase
      .from('tickets')
      .select(`
        *,
        concerts(id, title, date, venue, location)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tickets:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      ...this.transformTicket(row),
      concert: row.concerts ?? undefined,
    }));
  }

  // Door check-in list for a host's own concert — RLS restricts this to concerts
  // the caller owns.
  static async getConcertTickets(concertId: string): Promise<Ticket[]> {
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('concert_id', concertId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching concert tickets:', error);
      return [];
    }

    return (data || []).map(this.transformTicket);
  }

  // Public sold-count for a concert listing, via a SECURITY DEFINER RPC (tickets'
  // own RLS only exposes rows to the buyer or the host, not the public — see
  // supabase/add_ticket_sold_count_rpc.sql). Used to show "Sold out" before a fan
  // starts checkout; the authoritative capacity check still runs server-side in
  // purchase_ticket() at payment-confirmation time.
  static async getSoldCount(concertId: string): Promise<number> {
    const { data, error } = await supabase.rpc('get_concert_tickets_sold', { p_concert_id: concertId });
    if (error) {
      console.error('Error fetching ticket sold count:', error);
      return 0;
    }
    return data ?? 0;
  }

  // Scans a QR code at the door. RLS only allows this to succeed if the caller is
  // the concert's host and the ticket is currently valid.
  static async redeemTicket(qrToken: string): Promise<Ticket> {
    const { data, error } = await supabase
      .from('tickets')
      .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
      .eq('qr_token', qrToken)
      .eq('status', 'valid')
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }
    if (!data) {
      throw new Error('Ticket not found, already redeemed, or not for one of your concerts');
    }

    return this.transformTicket(data);
  }

  private static transformTicket(row: any): Ticket {
    return {
      id: row.id,
      concertId: row.concert_id,
      buyerId: row.buyer_id,
      qrToken: row.qr_token,
      status: row.status,
      redeemedAt: row.redeemed_at,
      createdAt: row.created_at,
    };
  }
}
