import { InfiniteGamesEvent } from '@/core/domainTypes';
import { EventDetails } from '@/infra/external/infiniteGames';

export interface IInfiniteGamesService {
    /**
     * Fetches the latest events, gets their details, and stores them.
     */
    updateAndStoreEvents(): Promise<void>;

    /**
     * Starts periodic fetching of Infinite Games event data.
     * @param intervalMs Interval in milliseconds.
     * @param runImmediately Whether to run the update immediately.
     */
    startPeriodicUpdates(intervalMs: number, runImmediately?: boolean): Promise<void>;

    /**
     * Stops the periodic updates.
     */
    stopPeriodicUpdates(): void;
} 