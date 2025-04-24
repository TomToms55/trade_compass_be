import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { PolymarketService } from '../services/polymarket.service';
// Assuming logger exists at this path based on conventions
// If not, replace with console.log or adjust path
// import { logger } from '@/utils/logger'; // Replaced with console
import { Side } from "@polymarket/clob-client"; // Import Side enum
import { z } from 'zod'; // Import Zod

// TODO: Instantiate or inject PolymarketService properly (e.g., via composition root)
// For now, creating a new instance here for simplicity. Reflects step 6 (100-120min)
const polymarketService = new PolymarketService();

// Define types for request bodies/params for better safety and validation
// interface EventParams { eventId: string; } // Replaced by Zod schema
// interface TradeBody { eventId: string; outcomeName: 'YES' | 'NO'; side: 'BUY' | 'SELL'; size: number; } // Replaced by Zod schema

// --- Zod Schemas for Polymarket routes ---

const PolymarketErrorResponseSchema = z.object({
  error: z.string().describe('Error description'),
  details: z.string().optional().describe('Optional additional details'),
}).describe('Standard error response for Polymarket routes');

// Schemas for /polymarket/events
const EventsQuerySchema = z.object({
    limit: z.string().optional().default('10').describe('Maximum number of markets to return'),
});
const MarketSchema = z.any().describe('Polymarket Market object structure (replace with detailed schema)');
const EventsResponseSchema = z.array(MarketSchema).describe('List of open Polymarket markets');

// Schemas for /polymarket/events/:eventId
const EventParamsSchema = z.object({
    eventId: z.string().describe('The unique ID (address) of the Polymarket event market'),
});
const MarketDetailsSchema = z.any().describe('Polymarket Market Details object structure (replace with detailed schema)');
const EventDetailsResponseSchema = MarketDetailsSchema.nullable().describe('Details of a specific market or null if not found');

// Schemas for /polymarket/trade
const TradeBodySchema = z.object({
    eventId: z.string().describe('The unique ID (address) of the Polymarket event market'),
    outcomeName: z.enum(['YES', 'NO']).describe('Which outcome token to trade (YES or NO)'),
    side: z.enum(['BUY', 'SELL']).describe('Whether to buy or sell the outcome token'),
    size: z.number().positive().describe('The amount of outcome tokens to trade'),
});
type TradeBody = z.infer<typeof TradeBodySchema>; // Keep inferred type
const TradeResultSchema = z.any().describe('Result object from placing a trade (replace with detailed schema)');
const TradeResponseSchema = z.object({
    message: z.string(),
    result: TradeResultSchema,
}).describe('Response after successfully placing a trade');

// Schemas for /polymarket/balance/usdc
const UsdcBalanceResponseSchema = z.object({
    usdcBalance: z.number().nonnegative().describe('The user\'s available USDC balance on Polymarket'),
}).describe('Polymarket USDC balance response');

// Fastify requires routes to be defined within a plugin
// Use `async function` and `export default` for Fastify auto-loading
const polymarketRoutes = async (fastify: FastifyInstance, opts: FastifyPluginOptions) => {

    // GET /polymarket/events
    fastify.get('/polymarket/events', {
        schema: {
            description: 'List currently open Polymarket event markets.',
            tags: ['polymarket'],
            summary: 'List Polymarket Markets',
            querystring: EventsQuerySchema,
            response: {
                200: EventsResponseSchema,
                400: PolymarketErrorResponseSchema, // For invalid limit
                500: PolymarketErrorResponseSchema
            }
        }
    }, async (request: FastifyRequest<{ Querystring: z.infer<typeof EventsQuerySchema> }>, reply: FastifyReply) => {
        try {
            // Zod handles default and basic type validation
            const limit = parseInt(request.query.limit, 10);
            // Additional validation if needed (e.g., Zod refinement could handle positivity)
            if (isNaN(limit) || limit <= 0) {
                 console.warn(`Invalid limit parameter received: ${ request.query.limit}`);
                 return reply.status(400).send({ error: 'Invalid limit parameter: must be a positive integer.' });
             }
            const markets = await polymarketService.listOpenMarkets(limit);
            reply.send(markets); // Fastify validates against EventsResponseSchema
        } catch (error: any) {
            console.error('Error fetching Polymarket events:', error);
            reply.status(500).send({ error: 'Failed to fetch Polymarket events', details: error.message });
        }
    });

    // GET /polymarket/events/:eventId
     fastify.get<{ Params: z.infer<typeof EventParamsSchema> }>('/polymarket/events/:eventId', {
        schema: {
            description: 'Get detailed information for a specific Polymarket event market.',
            tags: ['polymarket'],
            summary: 'Get Polymarket Market Details',
            params: EventParamsSchema,
            response: {
                200: EventDetailsResponseSchema,
                400: PolymarketErrorResponseSchema, // For invalid eventId format if stricter validation added
                404: PolymarketErrorResponseSchema, // For market not found
                500: PolymarketErrorResponseSchema
            }
        }
     }, async (request, reply) => {
        try {
            const eventId = request.params.eventId;
            // Basic validation already done by Zod params schema
            const marketDetails = await polymarketService.getMarketDetails(eventId);
            if (marketDetails === null) { 
                console.info(`Market details not found for eventId: ${eventId}`);
                return reply.status(404).send({ error: `Market with ID ${eventId} not found or details unavailable` });
            }
            reply.send(marketDetails); // Fastify validates against EventDetailsResponseSchema
        } catch (error: any) {
            console.error(`Error fetching details for market ${request.params.eventId}:`, error);
            reply.status(500).send({ error: 'Failed to fetch market details', details: error.message });
        }
    });


    // POST /polymarket/trade
    fastify.post<{ Body: TradeBody }>('/polymarket/trade', {
        schema: {
            description: 'Place a market order (buy or sell) for a specific outcome (YES/NO) on a Polymarket event.',
            tags: ['polymarket'],
            summary: 'Place Polymarket Trade',
            body: TradeBodySchema,
            response: {
                201: TradeResponseSchema,
                400: PolymarketErrorResponseSchema, // For validation errors
                500: PolymarketErrorResponseSchema
            }
        }
    }, async (request, reply) => { 
        try {
            // Zod handles validation based on TradeBodySchema
            const { eventId, outcomeName, side, size } = request.body;
            const orderSide = side === 'BUY' ? Side.BUY : Side.SELL;

            console.info(`Received trade request: ${side} ${size} ${outcomeName} on ${eventId}`);
            const result = await polymarketService.placeMarketOrder(eventId, outcomeName, orderSide, size);
            reply.status(201).send({ message: 'Trade placed successfully', result }); // Fastify validates against TradeResponseSchema
        } catch (error: any) {
            console.error('Error placing Polymarket trade:', { body: request.body, error: error.message, stack: error.stack });
             reply.status(500).send({ error: 'Failed to place trade', details: error.message });
        } 
    });

    // GET /polymarket/balance/usdc
    fastify.get('/polymarket/balance/usdc', {
        schema: {
            description: 'Fetch the available USDC balance for the configured wallet on Polymarket.',
            tags: ['polymarket'],
            summary: 'Get Polymarket USDC Balance',
            response: {
                200: UsdcBalanceResponseSchema,
                500: PolymarketErrorResponseSchema
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const balance = await polymarketService.getUsdcBalance();
            reply.send({ usdcBalance: balance }); // Fastify validates against UsdcBalanceResponseSchema
        } catch (error: any) {
            console.error('Error fetching USDC balance:', error);
            reply.status(500).send({ error: 'Failed to fetch balance', details: error.message });
        }
    });

    // logger.info('Polymarket routes registered');
    console.info('Polymarket routes registered');
};

// Ensure default export for Fastify plugin registration
export default polymarketRoutes; 