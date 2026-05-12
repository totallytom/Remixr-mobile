import { supabase } from './supabase';

export interface Concert {
  id: string;
  title: string;
  date: string;
  location: string;
  venue: string;
  description?: string;
  ticketPrice?: number;
  ticketUrl?: string;
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
  // Get all concerts (for Discover), with user info. Upcoming first, then by date.
  static async getAllConcerts(limit = 50): Promise<ConcertWithUser[]> {
    try {
      const { data, error } = await supabase
        .from('concerts')
        .select(`
          *,
          users(id, username, avatar, artist_name)
        `)
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
      if (data.ticketUrl) insertData.ticket_url = data.ticketUrl;

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
      throw new Error(error instanceof Error ? error.message : 'Failed to create concert');
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
        updateData.ticket_url = updates.ticketUrl || undefined;
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
      throw new Error(error instanceof Error ? error.message : 'Failed to update concert');
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
      throw new Error(error instanceof Error ? error.message : 'Failed to delete concert');
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
      userId: dbConcert.user_id,
      createdAt: dbConcert.created_at,
      updatedAt: dbConcert.updated_at,
    };
  }
} 