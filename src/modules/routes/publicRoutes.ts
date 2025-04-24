import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { TradeSuggestion } from '@/core/domainTypes';
import { container } from 'tsyringe'; // Import container
import { IStorageService } from '@/core/interfaces'; // Import needed interfaces
// Import the type for event suggestions
import { PredictedFullEvent } from '@/modules/infinite_games/services/infiniteGames.service';
import { z } from 'zod'; // Import Zod

// --- Zod Schemas for public routes ---

// Generic Error Schema
const PublicErrorResponseSchema = z.object({
  error: z.string().describe('Error category/type'),
  message: z.string().describe('Detailed error message'),
}).describe('Standard error response for public routes');

// Root route response schema
const RootResponseSchema = z.object({
  status: z.literal('ok'),
  message: z.string(),
}).describe('API status check response');

// Pagination Base Schema (can be reused)
const PaginationInfoSchema = z.object({
    totalItems: z.number().int().nonnegative().describe('Total number of items matching the query'),
    totalPages: z.number().int().nonnegative().describe('Total number of pages available'),
    currentPage: z.number().int().positive().describe('The current page number (1-indexed)'),
    itemsPerPage: z.number().int().positive().describe('Number of items requested per page'),
});

// Schema for TradeSuggestion item (refine based on actual TradeSuggestion structure)
const TradeSuggestionSchema = z.any().describe('Trade suggestion object structure (replace with detailed schema if needed)');

// Suggestions response schema
const SuggestionsResponseSchema = PaginationInfoSchema.extend({
    items: z.array(TradeSuggestionSchema).describe('Array of trade suggestions for the current page'),
}).describe('Paginated list of trade suggestions');

// Schema for PredictedFullEvent item (refine based on actual PredictedFullEvent structure)
const PredictedFullEventSchema = z.any().describe('Combined event data structure (replace with detailed schema if needed)');

// Event suggestions response schema
const EventSuggestionsResponseSchema = PaginationInfoSchema.extend({
    items: z.array(PredictedFullEventSchema).describe('Array of event suggestions for the current page'),
}).describe('Paginated list of event suggestions');

// --- Routes --- 

export default async function publicRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {

    // Resolve dependencies from the container
    const storageService = container.resolve<IStorageService>('IStorageService');

    // Dependency check (optional)
    if (!storageService) { 
        throw new Error('Storage service not resolved from container');
    }

    // Default route
    fastify.get("/", {
        schema: {
            description: 'Check the status of the CryptoCompass API.',
            tags: ['public'],
            summary: 'API Status Check',
            response: {
                200: RootResponseSchema,
            }
        }
    }, async (_request, reply) => {
        return reply.send({
            status: "ok",
            message: "CryptoCompass API is running",
        });
    });

    // GET /crypto/suggestions
    fastify.get("/crypto/suggestions", {
        schema: {
            description: 'Fetch trade suggestions based on various signals and analysis.',
            tags: ['crypto'],
            summary: 'Get Crypto Trade Suggestions',
            querystring: z.object({ // Define query params schema
                limit: z.string().optional().default('9').describe('Maximum number of suggestions per page'),
                offset: z.string().optional().default('0').describe('Number of suggestions to skip for pagination'),
                confidence: z.string().optional().default('0.5').describe('Minimum confidence level for suggestions (0.0 to 1.0)'),
            }),
            response: {
                200: SuggestionsResponseSchema,
                500: PublicErrorResponseSchema
            }
        }
    }, async (request, reply) => {
        try {
            const query = request.query as { limit?: string; offset?: string; confidence?: string };
            const limit = query.limit ? parseInt(query.limit, 10) : 9;
            const offset = query.offset ? parseInt(query.offset, 10) : 0;
            const minConfidence = query.confidence ? parseFloat(query.confidence) : 0.5;
            
            let suggestions = await storageService.getSuggestions();
                
            if (suggestions.length === 0) {
                return reply.send({ items: [], totalItems: 0, totalPages: 0, currentPage: 1, itemsPerPage: limit });
            }
            
            suggestions = suggestions.filter((s: TradeSuggestion) => (s.action === "BUY" || s.action === "SELL") && s.confidence > minConfidence);
            const totalFilteredItems = suggestions.length;
            const totalPages = Math.ceil(totalFilteredItems / limit);
            const paginatedSuggestions = suggestions.slice(offset, offset + limit);
            const currentPage = Math.floor(offset / limit) + 1;

            const response = {
                items: paginatedSuggestions,
                totalItems: totalFilteredItems,
                totalPages: totalPages,
                currentPage: currentPage,
                itemsPerPage: limit,
            };
            return reply.send(response);
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ 
                error: "Internal Server Error",
                message: "Failed to fetch suggestions"
            });
        }
    });

    // GET /events/suggestions
    fastify.get("/events/suggestions", {
        schema: {
            description: 'Fetch event suggestions derived from external prediction markets (e.g., Infinite Games).',
            tags: ['events'],
            summary: 'Get Event Suggestions',
            querystring: z.object({ // Define query params schema
                limit: z.string().optional().default('9').describe('Maximum number of suggestions per page'),
                offset: z.string().optional().default('0').describe('Number of suggestions to skip for pagination'),
                confidence: z.string().optional().default('0.15').describe('Minimum prediction delta from 0.5 (e.g., 0.15 means prediction > 0.65 or < 0.35)'),
                market: z.string().optional().describe('Filter events by market type (e.g., POLYMARKET, KALSHI)'),
            }),
            response: {
                200: EventSuggestionsResponseSchema,
                500: PublicErrorResponseSchema
            }
        }
    }, async (request, reply) => {
        try {
            // Parse query parameters including the new confidence threshold and market filter
            const query = request.query as { limit?: string; offset?: string; confidence?: string; market?: string };
            const limit = query.limit ? parseInt(query.limit, 10) : 9;
            const offset = query.offset ? parseInt(query.offset, 10) : 0;
            const confidenceThreshold = query.confidence ? parseFloat(query.confidence) : 0.15; // Default 0.15 delta
            const marketFilter = query.market?.toUpperCase(); // Normalize to uppercase for case-insensitive comparison

            if (isNaN(confidenceThreshold) || confidenceThreshold < 0 || confidenceThreshold > 0.5) {
                return reply.status(400).send({
                    error: "Bad Request",
                    message: "Invalid confidence threshold. Must be a number between 0.0 and 0.5."
                });
            }

            const allEventData = await storageService.getInfiniteGamesData();

            // Filter events based on market type first (if provided)
            let intermediateEvents = allEventData;
            if (marketFilter) {
                intermediateEvents = intermediateEvents.filter(event => 
                    event.market_type?.toUpperCase() === marketFilter
                );
            }

            // Filter events based on community prediction confidence and ensure prediction exists
            const filteredEvents = intermediateEvents.filter(event => {
                const prediction = event.communityPrediction?.community_prediction;
                // Ensure prediction is a valid number before comparing
                return typeof prediction === 'number' && 
                       !isNaN(prediction) &&
                       (prediction > (0.5 + confidenceThreshold) || prediction < (0.5 - confidenceThreshold));
            });

            // Sort filtered events by end_date (ascending - soonest first)
            // Ensure end_date is treated as a number (timestamp)
             const sortedEvents = filteredEvents.sort((a, b) => {
                 const endDateA = typeof a.end_date === 'number' ? a.end_date : Infinity;
                 const endDateB = typeof b.end_date === 'number' ? b.end_date : Infinity;
                 return endDateA - endDateB;
             });


            if (sortedEvents.length === 0) {
                // Return empty response respecting pagination structure
                return reply.send({ items: [], totalItems: 0, totalPages: 0, currentPage: 1, itemsPerPage: limit });
            }

            // Paginate the sorted and filtered data
            const totalItems = sortedEvents.length;
            const totalPages = Math.ceil(totalItems / limit);
            // Clamp offset to prevent going beyond available items
            const clampedOffset = Math.max(0, Math.min(offset, totalItems)); 
            const paginatedData = sortedEvents.slice(clampedOffset, clampedOffset + limit);
            // Calculate current page based on clamped offset
            const currentPage = totalItems === 0 ? 1 : Math.floor(clampedOffset / limit) + 1; 

            const response = {
                items: paginatedData,
                totalItems: totalItems,
                totalPages: totalPages,
                currentPage: currentPage,
                itemsPerPage: limit,
            };
            return reply.send(response);
        } catch (error) {
            request.log.error({ err: error }, 'Failed to fetch event suggestions');
            return reply.status(500).send({ 
                error: "Internal Server Error",
                message: "Failed to fetch event suggestions"
            });
        }
    });
} 