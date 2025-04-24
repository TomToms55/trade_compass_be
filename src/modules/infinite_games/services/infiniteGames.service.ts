import { injectable, inject } from 'tsyringe';
import type { FastifyBaseLogger } from 'fastify';
import { IInfiniteGamesClient, IStorageService, ILLMClient } from '@/core/interfaces';
import { IInfiniteGamesService } from '@/core/interfaces/IInfiniteGamesService';
import { InfiniteGamesEvent } from '@/core/domainTypes';
import { EventDetails, CommunityPredictionResponse } from '@/infra/external/infiniteGames';

// Define the combined data structure
export interface PredictedFullEvent extends InfiniteGamesEvent {
    details: EventDetails | null; // Include details or null if fetch failed
    communityPrediction: CommunityPredictionResponse | null; // Include prediction or null if fetch failed
    sumTitle: string | null; // Summarized title from LLM
}

const PROMPT_QUESTION = "Summarize the following prediction question into a 3-7 word headline that retains the key subjects and topic, but drops the specific action, date, and phrasing. Make it catchy and short, like a news headline or card label. Example: “Will X do Y by Z?” → “X & Y”"

@injectable()
export class InfiniteGamesService implements IInfiniteGamesService {
    private updateIntervalId: NodeJS.Timeout | null = null;
    private isUpdating: boolean = false;
    private readonly FETCH_LIMIT = 100;
    private readonly UPDATE_INTERVAL_HOURS = 1;

    constructor(
        @inject("IInfiniteGamesClient") private infiniteGamesClient: IInfiniteGamesClient,
        @inject("IStorageService") private storageService: IStorageService,
        @inject("Logger") private logger: FastifyBaseLogger,
        @inject("ILLMClient") private llmClient: ILLMClient
    ) {
        this.logger.info('InfiniteGamesService initialized');
    }

    /**
     * Performs a single run of fetching events, getting details and predictions, 
     * combining them, and saving them.
     */
    async updateAndStoreEvents(): Promise<void> {
        if (this.isUpdating) {
            this.logger.warn('Infinite Games event update already in progress, skipping this run.');
            return;
        }
        this.isUpdating = true;
        this.logger.info(`Starting Infinite Games event fetch (limit per page: ${this.FETCH_LIMIT})...`);

        const allEvents: InfiniteGamesEvent[] = [];
        const combinedEventData: PredictedFullEvent[] = []; // Array to hold combined data
        let currentOffset = 0;
        let fetchedLastBatch: InfiniteGamesEvent[] = [];

        try {
            // 1. Fetch the latest events using pagination
            this.logger.info('Fetching events page by page...');
            do {
                // Assuming getEvents signature is getEvents(limit, offset)
                fetchedLastBatch = await this.infiniteGamesClient.getEvents(this.FETCH_LIMIT, currentOffset, "desc");
                this.logger.info(`Fetched ${fetchedLastBatch.length} events from offset ${currentOffset}.`);

                if (fetchedLastBatch.length > 0) {
                    allEvents.push(...fetchedLastBatch);
                    currentOffset += fetchedLastBatch.length;
                }
                // Optional small delay between pages if needed
                // await new Promise(resolve => setTimeout(resolve, 100)); 
            } while (fetchedLastBatch.length === this.FETCH_LIMIT && currentOffset < 100);

            this.logger.info(`Finished fetching. Total events fetched: ${allEvents.length}.`);

            if (allEvents.length === 0) {
                this.logger.info('No events found to process.');
                this.isUpdating = false;
                return;
            }

            // 2. Fetch details and community prediction for each event sequentially
            this.logger.info(`Fetching details & predictions sequentially for ${allEvents.length} events...`);
            for (const event of allEvents) {
                let details: EventDetails | null = null;
                let communityPrediction: CommunityPredictionResponse | null = null;
                let summarizedTitle: string | null = null; // Variable for summarized title
                
                // Fetch details
                try {
                    details = await this.infiniteGamesClient.getSingleEventDetails(event.event_id);
                    this.logger.trace(`Fetched details for event ${event.event_id}`);
                } catch (detailsError) {
                    this.logger.error({ err: detailsError, eventId: event.event_id }, `Failed to fetch details for event ${event.event_id}.`);
                }

                // Fetch community prediction
                try {
                    communityPrediction = await this.infiniteGamesClient.getCommunityPrediction(event.event_id);
                    this.logger.trace(`Fetched community prediction for event ${event.event_id}`);
                } catch (predictionError) {
                    this.logger.error({ err: predictionError, eventId: event.event_id }, `Failed to fetch community prediction for event ${event.event_id}.`);
                }

                // Generate summarized title using LLMClient
                if (event.title) { // Only summarize if title exists
                    try {
                        const prompt = `${PROMPT_QUESTION}: ${event.title}`;
                        summarizedTitle = await this.llmClient.generateContent(prompt);
                        this.logger.trace(`Generated summarized title for event ${event.event_id}`);
                    } catch (summaryError) {
                        this.logger.error({ err: summaryError, eventId: event.event_id, title: event.title }, `Failed to generate summary for event ${event.event_id}.`);
                        // Keep summarizedTitle as null if generation fails
                    }
                }

                // Combine the data - store even if details/prediction/summary fetch failed
                combinedEventData.push({
                    ...event, // Spread the original event data
                    details: details, // Add fetched details (or null)
                    communityPrediction: communityPrediction, // Add fetched prediction (or null)
                    sumTitle: summarizedTitle // Add summarized title (or null)
                });
                
                // Optional delay between processing each event fully
                // await new Promise(resolve => setTimeout(resolve, 200)); 
            }

            this.logger.info(`Processed ${allEvents.length} events. Successfully fetched details for ${combinedEventData.filter(d => d.details).length}, community predictions for ${combinedEventData.filter(d => d.communityPrediction).length}.`);

            // 3. Store the combined data
            // NOTE: We need to update IStorageService and implementations for this!
            await this.storageService.saveInfiniteGamesData(combinedEventData);
            this.logger.info(`Successfully stored ${combinedEventData.length} combined event entries.`);

        } catch (error) {
            // Error during initial event fetch?
            this.logger.error({ err: error }, 'Failed during the main Infinite Games event update process.');
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * Starts the periodic update process.
     * @param intervalMs The interval in milliseconds between updates.
     * @param runImmediately If true, runs an update immediately before starting the interval.
     */
    async startPeriodicUpdates(intervalMs: number, runImmediately: boolean = true): Promise<void> {
        if (this.updateIntervalId) {
            this.logger.warn('Infinite Games periodic updates are already running.');
            return;
        }

        const hours = intervalMs / (60 * 60 * 1000);
        this.logger.info(`Starting periodic Infinite Games event updates every ${hours} hour(s).`);

        if (runImmediately) {
            // Run async but don't block the startup
            this.updateAndStoreEvents().catch(err => {
                 this.logger.error({ err }, "Error during initial immediate Infinite Games update.");
            });
        }

        this.updateIntervalId = setInterval(async () => {
             await this.updateAndStoreEvents();
        }, intervalMs);
    }

    /**
     * Stops the periodic update process.
     */
    stopPeriodicUpdates(): void {
        if (this.updateIntervalId) {
            clearInterval(this.updateIntervalId);
            this.updateIntervalId = null;
            this.logger.info('Stopped periodic Infinite Games event updates.');
        } else {
            this.logger.info('Periodic Infinite Games event updates were not running.');
        }
    }
} 