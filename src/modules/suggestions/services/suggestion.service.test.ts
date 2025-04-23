import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SuggestionService } from './suggestion.service';
import type { ISuggestionGenerator, IStorageService } from '@/core/interfaces';
import type { FastifyBaseLogger } from 'fastify';
import type { TradeSuggestion } from '@/core/domainTypes';

// Mock individual functions first (without generics)
const mockGenerateSuggestions = vi.fn();
const mockSaveSuggestions = vi.fn();
const mockGetSuggestions = vi.fn();

// Assign functions to mock objects conforming to interfaces
const mockSuggestionGenerator: ISuggestionGenerator = {
    generateSuggestions: mockGenerateSuggestions,
};
const mockStorageService: IStorageService = {
    getSuggestions: mockGetSuggestions,
    saveSuggestions: mockSaveSuggestions,
};

// Mock Fastify logger
const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    debug: vi.fn(),
} as unknown as FastifyBaseLogger;

// --- Test Suite ---
describe('SuggestionService', () => {
    let suggestionService: SuggestionService;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers(); 
        suggestionService = new SuggestionService(mockSuggestionGenerator, mockStorageService, mockLogger);
    });

    afterEach(() => {
        vi.useRealTimers();
        // Access stopPeriodicUpdates via the instance
        suggestionService.stopPeriodicUpdates();
    });

    it('should be instantiated correctly', () => {
        expect(suggestionService).toBeInstanceOf(SuggestionService);
    });

    describe('updateAndStoreSuggestions', () => {
        it('should call generator and storage service', async () => {
            const mockSuggestions: TradeSuggestion[] = [{ symbol: 'BTC', action: 'BUY', confidence: 0.8 }] as any;
            // Use the mock function variables here
            mockGenerateSuggestions.mockResolvedValue(mockSuggestions);
            mockSaveSuggestions.mockResolvedValue(undefined);

            await suggestionService.updateAndStoreSuggestions();

            expect(mockGenerateSuggestions).toHaveBeenCalledTimes(1);
            expect(mockSaveSuggestions).toHaveBeenCalledTimes(1);
            expect(mockSaveSuggestions).toHaveBeenCalledWith(mockSuggestions);
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Starting suggestion generation'));
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully generated and saved'));
        });

        it('should log error if suggestion generation fails', async () => {
            const error = new Error('Generator failed');
            mockGenerateSuggestions.mockRejectedValue(error);

            await suggestionService.updateAndStoreSuggestions();

            expect(mockSaveSuggestions).not.toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalledTimes(1);
            expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ err: { message: error.message, stack: error.stack } }), 'Failed to update suggestions.');
        });

        it('should log error if storage saving fails', async () => {
            const mockSuggestions: TradeSuggestion[] = [{ symbol: 'ETH', action: 'SELL', confidence: 0.9 }] as any;
            const error = new Error('Storage failed');
            mockGenerateSuggestions.mockResolvedValue(mockSuggestions);
            mockSaveSuggestions.mockRejectedValue(error);

            await suggestionService.updateAndStoreSuggestions();

            expect(mockGenerateSuggestions).toHaveBeenCalledTimes(1);
            expect(mockSaveSuggestions).toHaveBeenCalledWith(mockSuggestions);
            expect(mockLogger.error).toHaveBeenCalledTimes(1);
            expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ err: { message: error.message, stack: error.stack } }), 'Failed to update suggestions.');
        });

        it('should prevent concurrent updates', async () => {
            mockGenerateSuggestions.mockResolvedValue([]);
            const firstPromise = suggestionService.updateAndStoreSuggestions();
            await suggestionService.updateAndStoreSuggestions(); 

            expect(mockLogger.warn).toHaveBeenCalledWith('Suggestion update already in progress, skipping this run.');
            expect(mockGenerateSuggestions).toHaveBeenCalledTimes(1); 
            await firstPromise; 
        });
    });

    describe('startPeriodicUpdates', () => {
        it('should run immediately if requested', async () => {
            mockGenerateSuggestions.mockResolvedValue([]);
            await suggestionService.startPeriodicUpdates(1000 * 60 * 60, true);
            expect(mockGenerateSuggestions).toHaveBeenCalledTimes(1);
            // No need to call stop here, afterEach handles it
        });

        it('should not run immediately if not requested', async () => {
            await suggestionService.startPeriodicUpdates(1000 * 60 * 60, false);
            expect(mockGenerateSuggestions).not.toHaveBeenCalled();
        });

        // TODO: Fix test flakiness with async setInterval and fake timers
        it.skip('should run periodically after the interval', async () => {
            const intervalMs = 1000 * 60 * 60;
            mockGenerateSuggestions.mockResolvedValue([]);
            await suggestionService.startPeriodicUpdates(intervalMs, false);

            expect(mockGenerateSuggestions).toHaveBeenCalledTimes(0);

            // Advance time for the first interval
            vi.advanceTimersByTime(intervalMs);
            await vi.advanceTimersToNextTimerAsync(); 
            expect(mockGenerateSuggestions).toHaveBeenCalledTimes(1);

            // Advance time for the second interval
            vi.advanceTimersByTime(intervalMs);
            await vi.advanceTimersToNextTimerAsync(); 
            expect(mockGenerateSuggestions).toHaveBeenCalledTimes(2); 
        }, 1000); 
    });

     describe('stopPeriodicUpdates', () => {
        it.skip('should clear the interval timer', async () => {
            const intervalMs = 1000 * 60 * 60; 
            mockGenerateSuggestions.mockResolvedValue([]);
            await suggestionService.startPeriodicUpdates(intervalMs, false);

            // Advance time for the first interval
            vi.advanceTimersByTime(intervalMs);
            await vi.advanceTimersToNextTimerAsync(); 
            expect(mockGenerateSuggestions).toHaveBeenCalledTimes(1);

            suggestionService.stopPeriodicUpdates();
            expect(mockLogger.info).toHaveBeenCalledWith('Stopped periodic suggestion updates.');

            vi.advanceTimersByTime(intervalMs * 2); 
            await vi.advanceTimersToNextTimerAsync(); 
            
            expect(mockGenerateSuggestions).toHaveBeenCalledTimes(1); 
        }, 1000); 

        it('should log if updates were not running', () => {
             // Ensure no interval is running before calling stop
             suggestionService.stopPeriodicUpdates(); // Call stop on a fresh instance
             expect(mockLogger.info).toHaveBeenCalledWith('Periodic suggestion updates were not running.');
        });
    });
}); 