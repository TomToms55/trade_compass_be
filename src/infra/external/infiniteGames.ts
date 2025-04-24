import axios from 'axios';
import { InfiniteGamesEvent } from '@/core/domainTypes';
import type { IInfiniteGamesClient } from '@/core/interfaces';
import { singleton } from 'tsyringe';

// Define the structure of the API response based on user input
export interface IGItem {
  event_id: string;
  market_type: string;
  title: string;
  description: string;
  cutoff: number;
  start_date: number;
  created_at: number;
  end_date: number;
  answer: any;
}

export interface IGApiResponse {
  count: number;
  items: IGItem[];
}

// Define the structure for the /validator/events/{event_id} endpoint response
export interface EventDetails {
  unique_event_id: string;
  event_id: string;
  market_type: string;
  event_type: string;
  registered_date: string;
  description: string;
  starts: string;
  resolve_date: any;
  outcome: any;
  local_updated_at: string;
  status: number;
  metadata: string;
  processed: boolean;
  exported: boolean;
  created_at: string;
  cutoff: string;
  end_date: string;
  resolved_at: any;
}

// Define structure for the community prediction endpoint response
export interface CommunityPredictionResponse {
  event_id: string;
  community_prediction: number;
}

/**
 * Client for interacting with the Infinite Games API
 * Fetches event data from https://ifgames.win/api/v2/events
 */
@singleton()
export class InfiniteGamesClient implements IInfiniteGamesClient {
  private baseUrl = 'https://ifgames.win/api/v2';
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
        console.warn('InfiniteGamesClient initialized without an API key. Prediction endpoint calls will likely fail.');
    }
    this.apiKey = apiKey || '';
  }

  /**
   * Get event predictions from the /events endpoint.
   * Note: The name 'getEventPredictions' is kept for consistency with the interface,
   * but this endpoint returns event definitions, not predictions with probability/impact.
   * The returned type InfiniteGamesEvent reflects the structure of the API response.
   * @param limit Optional limit for pagination
   * @param offset Optional offset for pagination
   */
  async getEvents(limit?: number, offset?: number, order?: string): Promise<InfiniteGamesEvent[]> {
    try {
      const params: { limit?: number; offset?: number; order?: string } = {};
      if (limit !== undefined) params.limit = limit;
      if (offset !== undefined) params.offset = offset;
      if (order !== undefined) params.order = order;

      const response = await axios.get<IGApiResponse>(`${this.baseUrl}/events`, {
        params: params,
      });
      return response.data.items as InfiniteGamesEvent[];
    } catch (error) {
      console.error('Error fetching Infinite Games events:', error);
      return [];
    }
  }

  /**
   * Get a single event prediction by its ID.
   * Requires API Key.
   * @param eventId The unique ID of the event.
   */
  async getSingleEventDetails(eventId: string): Promise<EventDetails> {
    if (!eventId) {
      throw new Error('eventId is required to fetch a single event prediction.');
    }
    if (!this.apiKey) {
        console.error('Cannot fetch single event prediction: Infinite Games API Key is missing.');
        throw new Error('Infinite Games API Key is missing.');
    }
    try {
      const config = {
          headers: {
              'X-API-Key': this.apiKey
          }
      };
      const response = await axios.get<EventDetails>(
          `${this.baseUrl}/validator/events/${eventId}`,
          config
      );
      return response.data;
    } catch (error) {
      console.error(`Error fetching Infinite Games event prediction for ID ${eventId}:`, error);
      throw error; 
    }
  }

  /**
   * Get the community prediction for a single event by its ID.
   * Requires API Key.
   * @param eventId The unique ID of the event.
   */
  async getCommunityPrediction(eventId: string): Promise<CommunityPredictionResponse> {
    if (!eventId) {
      throw new Error('eventId is required to fetch community prediction.');
    }
    if (!this.apiKey) {
        console.error('Cannot fetch community prediction: Infinite Games API Key is missing.');
        throw new Error('Infinite Games API Key is missing.');
    }
    try {
        const config = {
            headers: {
                'X-API-Key': this.apiKey
            }
        };
        const response = await axios.get<CommunityPredictionResponse>(
            `${this.baseUrl}/validator/events/${eventId}/community_prediction`,
            config
        );
        return response.data;
    } catch (error) {
        console.error(`Error fetching Infinite Games community prediction for ID ${eventId}:`, error);
        throw error;
    }
  }
}

// Factory function to create an Infinite Games client
export function createInfiniteGamesClient(): InfiniteGamesClient {
  const apiKey = process.env.INFINITE_GAMES_API_KEY;
  if (!apiKey) {
      console.warn('INFINITE_GAMES_API_KEY environment variable not found. Prediction endpoint calls may fail.');
  }
  return new InfiniteGamesClient(apiKey || '');
}

export default createInfiniteGamesClient; 