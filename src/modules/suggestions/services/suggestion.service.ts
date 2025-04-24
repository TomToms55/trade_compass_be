// import { ILogger } from '@/core/types'; // Remove this import
import { injectable, inject } from 'tsyringe'; // Add imports
import type { FastifyBaseLogger } from 'fastify'; // Import Fastify logger type
import { ISuggestionGenerator, IStorageService } from '@/core/interfaces';

@injectable() // Add injectable decorator
export class SuggestionService {
    private suggestionGenerator: ISuggestionGenerator;
    private storageService: IStorageService;
    private updateIntervalId: NodeJS.Timeout | null = null;
    private logger: FastifyBaseLogger; // Use Fastify logger type
    private isUpdating: boolean = false; // Prevent concurrent updates

    constructor(        
        @inject("ISuggestionGenerator") suggestionGenerator: ISuggestionGenerator, // Add inject decorator
        @inject("IStorageService") storageService: IStorageService,             // Add inject decorator
        @inject("Logger") logger: FastifyBaseLogger                             // Add inject decorator
    ) {
        this.suggestionGenerator = suggestionGenerator;
        this.storageService = storageService;
        this.logger = logger;
        this.logger.info('SuggestionService initialized'); // Add init log
    }

    /**
     * Performs a single run of generating suggestions and saving them.
     */
    async updateAndStoreSuggestions(): Promise<void> {
        if (this.isUpdating) {
            this.logger.warn('Suggestion update already in progress, skipping this run.');
            return;
        }
        this.isUpdating = true;
        this.logger.info('Starting suggestion generation and storage...');
        try {
            const newSuggestions = await this.suggestionGenerator.generateSuggestions();
            await this.storageService.saveSuggestions(newSuggestions);
            this.logger.info(`Successfully generated and saved ${newSuggestions.length} suggestions.`);
        } catch (error) {
            // Use structured logging if the logger supports it
            if (error instanceof Error) {
                this.logger.error({ err: { message: error.message, stack: error.stack } }, 'Failed to update suggestions.');
            } else {
                 this.logger.error({ err: error }, 'Failed to update suggestions with non-Error object.');
            }
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
            this.logger.warn('Periodic updates are already running.');
            return;
        }

        this.logger.info(`Starting periodic suggestion updates every ${intervalMs / (60 * 60 * 1000)} hours.`);

        if (runImmediately) {
            await this.updateAndStoreSuggestions();
        }

        this.updateIntervalId = setInterval(async () => {
            await this.updateAndStoreSuggestions();
        }, intervalMs);
    }

    /**
     * Stops the periodic update process.
     */
    stopPeriodicUpdates(): void {
        if (this.updateIntervalId) {
            clearInterval(this.updateIntervalId);
            this.updateIntervalId = null;
            this.logger.info('Stopped periodic suggestion updates.');
        } else {
            this.logger.info('Periodic suggestion updates were not running.');
        }
    }
} 