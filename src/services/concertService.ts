import { supabase } from './supabase';
import { normalizeTicketUrl, todayKey } from '../utils/concerts';
import { toAppError } from '../utils/appError';

export interface Concert {
  id: string;
  title: string;
  date: string;
  location: string;
  venue: string;
  description?: string;
  ticketPrice?: number;
  ticketUrl?: string;
  capacity?: number;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConcertData {
  title: string;
  date: string;
  location: string;
  venue: string;
  description?: string;
  ticketPrice?: number;
  ticketUrl?: string;
  capacity?: number;
  userId: string;
}

export interface ConcertWithUser extends Concert {
  user?: {
    id: string;
    username: string;
    avatar?: string;
    artist_name?: string;
  };
}

export class ConcertService {
  // Upcoming concerts (today onward), soonest first, with host info. Filtering
  // in the query matters: filtering after `limit` let past shows fill the page
  // and push new ones out once enough had accumulated.
  static async getAllConcerts(limit = 50): Promise<ConcertWithUser[]> {
    try {
      const { data, error } = await supabase
        .from('concerts')
        .select(`
          *,
          users(id, username, avatar, artist_name)
        `)
        .gte('date', todayKey())
        .order('date', { ascending: true })
        .limit(limit);

      if (error) {
        console.error('Error fetching all concerts:', error);
        return [];
      }

      return (data || []).map((row: any) => ({
        ...this.transformConcert(row),
        user: row.users
          ? {
              id: row.users.id,
              username: row.users.username,
              avatar: row.users.avatar,
              artist_name: row.users.artist_name,
            }
          : undefined,
      }));
    } catch (error) {
      console.error('Error fetching all concerts:', error);
      return [];
    }
  }

  // Get concerts for a user
  static async getUserConcerts(userId: string): Promise<Concert[]> {
    try {
      const { data, error } = await supabase
        .from('concerts')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      if (error) {
        console.error('Error fetching concerts:', error);
        return [];
      }

      return (data || []).map(this.transformConcert);
    } catch (error) {
      console.error('Error fetching concerts:', error);
      return [];
    }
  }

  // Create a new concert
  static async createConcert(data: CreateConcertData): Promise<Concert> {
    try {
      // Ensure date is in proper format (ISO string)
      let dateValue = data.date;
      if (!dateValue.includes('T')) {
        // If it's just a date (YYYY-MM-DD), convert to ISO timestamp
        dateValue = `${dateValue}T00:00:00.000Z`;
      }

      const insertData: any = {
        title: data.title,
        date: dateValue,
        location: data.location,
        venue: data.venue,
        user_id: data.userId,
      };

      // Only include optional fields if they have values
      if (data.description) insertData.description = data.description;
      if (data.ticketPrice !== undefined) insertData.ticket_price = data.ticketPrice;
      const ticketUrl = normalizeTicketUrl(data.ticketUrl);
      if (ticketUrl) insertData.ticket_url = ticketUrl;
      if (data.capacity !== undefined) insertData.capacity = data.capacity;

      const { data: concertData, error } = await supabase
        .from('concerts')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Concert creation error:', error);
        throw new Error(error.message);
      }

      return this.transformConcert(concertData);
    } catch (error) {
      throw toAppError(error, 'errors.generic.concert');
    }
  }

  // Update a concert
  static async updateConcert(concertId: string, userId: string, updates: Partial<CreateConcertData>): Promise<Concert> {
    try {
      const updateData: any = {};
      
      if (updates.title) updateData.title = updates.title;
      if (updates.date) {
        // Ensure date is in proper format (ISO string)
        let dateValue = updates.date;
        if (!dateValue.includes('T')) {
          // If it's just a date (YYYY-MM-DD), convert to ISO timestamp
          dateValue = `${dateValue}T00:00:00.000Z`;
        }
        updateData.date = dateValue;
      }
      if (updates.location) updateData.location = updates.location;
      if (updates.venue) updateData.venue = updates.venue;
      // Only include optional fields if they have values (use undefined, not null)
      if (updates.description !== undefined) {
        updateData.description = updates.description || undefined;
      }
      if (updates.ticketPrice !== undefined) {
        updateData.ticket_price = updates.ticketPrice || undefined;
      }
      if (updates.ticketUrl !== undefined) {
        // null (not undefined) so clearing the field actually removes the link.
        updateData.ticket_url = normalizeTicketUrl(updates.ticketUrl);
      }
      if (updates.capacity !== undefined) {
        updateData.capacity = updates.capacity || undefined;
      }

      const { data, error } = await supabase
        .from('concerts')
        .update(updateData)
        .eq('id', concertId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error('Concert update error:', error);
        throw new Error(error.message);
      }

      return this.transformConcert(data);
    } catch (error) {
      throw toAppError(error, 'errors.generic.concert');
    }
  }

  // Delete a concert
  static async deleteConcert(concertId: string, userId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('concerts')
        .delete()
        .eq('id', concertId)
        .eq('user_id', userId);

      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      throw toAppError(error, 'errors.generic.concert');
    }
  }

  // Transform database concert to Concert interface
  private static transformConcert(dbConcert: any): Concert {
    return {
      id: dbConcert.id,
      title: dbConcert.title,
      date: dbConcert.date,
      location: dbConcert.location,
      venue: dbConcert.venue,
      description: dbConcert.description,
      ticketPrice: dbConcert.ticket_price,
      ticketUrl: dbConcert.ticket_url,
      capacity: dbConcert.capacity,
      userId: dbConcert.user_id,
      createdAt: dbConcert.created_at,
      updatedAt: dbConcert.updated_at,
    };
  }
} 