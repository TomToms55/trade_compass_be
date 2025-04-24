import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { authenticate } from '@/middleware/auth';
// Import repository interfaces
import { IUserRepository, ITradeRepository, TradeDataInput, IBinanceService, IUserService } from '@/core/interfaces'; 
// Import the container for dependency resolution
import { container } from 'tsyringe';
import ccxt, { Exchange, Order } from 'ccxt';
import { z } from 'zod'; // Import Zod
// Import the payload type if not already
import { JwtPayload } from '@/middleware/auth';

// --- Common Schemas ---
const ErrorResponseSchema = z.object({
  error: z.string().describe('Error category/type'),
  message: z.string().describe('Detailed error message'),
}).describe('Standard error response');

const UnauthorizedResponseSchema = z.object({
  error: z.literal('Unauthorized'),
  message: z.string()
}).describe('Authentication is required or failed');

// --- OHLCV Schemas ---
const FetchOhlcvBodySchema = z.object({
  symbol: z.string().describe('Trading pair symbol (e.g., BTC/USDC)'),
  timeframe: z.string().optional().default('1h').describe('Timeframe for OHLCV data (e.g., 1h, 1d, 1M)'),
  limit: z.number().int().min(1).optional().default(100).describe('Number of candles to fetch'),
}).describe('Request body for fetching OHLCV data');
type FetchOhlcvBody = z.infer<typeof FetchOhlcvBodySchema>; // Keep inferred type

const OhlcvDataSchema = z.array(
  z.tuple([
    z.number().describe('Timestamp (milliseconds)'), // Timestamp (ms)
    z.number().describe('Open price'),          // Open
    z.number().describe('High price'),          // High
    z.number().describe('Low price'),           // Low
    z.number().describe('Close price'),         // Close
    z.number().describe('Volume')           // Volume
  ])
).describe('Array of OHLCV candles (Timestamp, Open, High, Low, Close, Volume)');

// --- Balance Schemas ---
const BalanceResponseSchema = z.object({
    message: z.string(),
    usdcBalance: z.object({
        spot: z.number().optional().describe('Available USDC balance in Spot account'), // Allow optional for flexibility
        futures: z.number().optional().describe('Available USDC balance in Futures account') // Allow optional for flexibility
    }).describe('USDC balances for Spot and Futures')
}).describe('Successful balance fetch response');

// --- Trade Schemas ---
const PlaceTradeBodySchema = z.object({
  symbol: z.string().describe('Full market symbol (e.g., BTC/USDC for spot, BTC/USDC:USDC for futures)'),
  side: z.enum(['buy', 'sell']).describe('Order side'),
  amount: z.number().positive().describe('For BUY: cost in USDC. For SELL: quantity in base asset.'),
}).describe('Request body for placing a market trade');
type PlaceTradeBody = z.infer<typeof PlaceTradeBodySchema>; // Keep inferred type

// Define a basic Zod schema for the ccxt Order object
// Note: This is simplified. A full schema would be very complex.
const CcxtOrderSchema = z.any().describe('CCXT Order object structure (represented as any)');

const PlaceTradeSuccessResponseSchema = z.object({
    message: z.string(),
    order: CcxtOrderSchema
}).describe('Successful trade placement response');

// --- User Settings Schemas ---
const UpdateUserSettingsBodySchema = z.object({
    automaticTradingEnabled: z.boolean().describe('Enable or disable automatic trading strategies based on signals.')
}).describe('Request body for updating user settings');
type UpdateUserSettingsBody = z.infer<typeof UpdateUserSettingsBodySchema>; // Keep inferred type

// Define a basic User schema (adjust based on your actual User model)
const UserSchema = z.object({
    id: z.string(),
    automaticTradingEnabled: z.boolean(),
    // Add other user fields that might be returned
}).describe('User object structure');

const UpdateUserSettingsSuccessResponseSchema = z.object({
    message: z.string(),
    user: UserSchema
}).describe('Successful user settings update response');

// --- Trades List Schemas ---
// Define a Zod schema for the Trade object based on Prisma model (adjust fields as needed)
const TradeSchema = z.object({
    tradeId: z.number().int().positive().describe('Unique identifier for the trade'),
    userId: z.string().describe('User ID associated with the trade'),
    orderId: z.string().describe('Original exchange order ID'),
    timestamp: z.date().describe('Timestamp when the order was placed'),
    symbol: z.string().describe('Market symbol (e.g., BTC/USDC)'),
    type: z.string().describe('Order type (e.g., market, limit)'),
    side: z.string().describe('Order side (e.g., buy, sell)'),
    price: z.number().nullable().describe('Execution price (null if not applicable)'),
    amount: z.number().describe('Ordered amount'),
    cost: z.number().nullable().describe('Total cost (price * amount)'),
    filled: z.number().describe('Amount filled'),
    remaining: z.number().describe('Amount remaining'),
    status: z.string().nullable().describe('Order status (e.g., open, closed, canceled)'),
    feeCost: z.number().nullable().describe('Fee cost'),
    feeCurrency: z.string().nullable().describe('Fee currency'),
    marketType: z.string().describe('Market type (spot or futures)'),
    // rawOrder: z.string().describe('Raw order data (JSON string)'), // Omitted for brevity
    tcState: z.string().nullable().describe('Trade lifecycle state (e.g., OPEN, COMPLETED)'),
    closeOrderId: z.string().nullable().describe('Order ID of the closing trade'),
    closeTimestamp: z.date().nullable().describe('Timestamp of the closing trade'),
    closePrice: z.number().nullable().describe('Price of the closing trade'),
    closeCost: z.number().nullable().describe('Cost of the closing trade'),
    profit: z.number().nullable().describe('Realized profit/loss'),
    durationMs: z.number().int().nullable().describe('Duration of the trade in milliseconds'),
}).describe('Detailed information about a single trade');

// Schema for the successful response (array of trades)
const GetTradesSuccessResponseSchema = z.array(TradeSchema).describe('List of trades for the user');


export default async function authenticatedRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {

    // Apply authentication middleware to all routes registered in this plugin
    fastify.addHook('onRequest', authenticate);

    // Resolve dependencies from the container
    const binanceService = container.resolve<IBinanceService>('IBinanceService');
    const userRepository = container.resolve<IUserRepository>('IUserRepository');
    const tradeRepository = container.resolve<ITradeRepository>('ITradeRepository');
    const userService = container.resolve<IUserService>('IUserService');
    
    // Define security requirement for all routes in this plugin
    const securityRequirement = [{ apiKey: [] }];

    // POST /crypto/fetchOHLCV
    fastify.post<{ Body: FetchOhlcvBody }>("/crypto/fetchOHLCV", {
         schema: {
             description: 'Fetch historical OHLCV (candlestick) data for a given market symbol.',
             tags: ['crypto'],
             summary: 'Fetch Crypto OHLCV Data',
             security: securityRequirement,
             body: FetchOhlcvBodySchema,
             response: {
                 200: OhlcvDataSchema,
                 400: ErrorResponseSchema, // Bad Request (e.g., invalid symbol)
                 401: UnauthorizedResponseSchema,
                 404: ErrorResponseSchema, // Not Found (no data)
                 429: ErrorResponseSchema, // Rate Limit
                 500: ErrorResponseSchema, // Internal Server Error
                 503: ErrorResponseSchema  // Service Unavailable (Binance)
             }
         } 
        }, 
        async (request, reply) => {
        // Handler logic remains the same, but relies on Zod validation now
        if (!request.auth) { // Keep auth check
            // Reply automatically handled by schema if validation fails, 
            // but explicit check needed for middleware logic
            return reply.code(401).send({ error: "Unauthorized", message: "Missing authentication context" }); 
        }
        // Request body is now correctly typed
        const { symbol, timeframe, limit } = request.body;
        const exchange = binanceService.getExchangeInstance();

        try {
            const ohlcvData = await exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
            if (!ohlcvData || ohlcvData.length === 0) {
                return reply.code(404).send({ 
                    error: "Not Found",
                    message: `No OHLCV data found for symbol ${symbol} with timeframe ${timeframe}`,
                });
            }
            // Fastify automatically validates the response against OhlcvDataSchema
            return reply.send(ohlcvData);
        } catch (error: any) { // Keep existing error handling logic
            request.log.error(`Error fetching OHLCV for ${symbol} (${timeframe}, limit ${limit}): ${error.message}`);
            if (error instanceof ccxt.BadSymbol) {
                return reply.code(400).send({ error: 'Bad Request', message: `Invalid symbol: ${error.message}` });
            }
            if (error instanceof ccxt.NetworkError || error instanceof ccxt.ExchangeNotAvailable) {
                return reply.code(503).send({ error: 'Service Unavailable', message: `Binance API error: ${error.message}` });
            }
            if (error instanceof ccxt.RateLimitExceeded) {
                return reply.code(429).send({ error: 'Too Many Requests', message: `Rate limit exceeded: ${error.message}` });
            }
            return reply.code(500).send({ error: 'Internal Server Error', message: `Failed to fetch OHLCV data for ${symbol} (${timeframe})` });
        }
    });

    // GET /crypto/balance
    fastify.get("/crypto/balance", {
        schema: {
            description: 'Fetch the current USDC balance for both Spot and Futures accounts associated with the user\'s API keys.',
            tags: ['crypto'],
            summary: 'Fetch Crypto Balance',
            security: securityRequirement,
            response: {
                200: BalanceResponseSchema,
                401: UnauthorizedResponseSchema,
                403: ErrorResponseSchema, // Forbidden (no credentials / invalid key)
                429: ErrorResponseSchema, // Rate Limit
                500: ErrorResponseSchema, // Internal Server Error
                502: ErrorResponseSchema, // Bad Gateway (Binance exchange error)
                503: ErrorResponseSchema  // Service Unavailable (Binance network)
            }
        }
    }, async (request, reply) => {
        // Handler logic remains largely the same
        if (!request.auth) {
             return reply.code(401).send({ error: "Unauthorized", message: "Authentication context missing." });
        }
        const userId = request.auth.user_id;
        request.log.info(`User ${userId} requesting balance.`);

        try {
            const credentials = await userRepository.findCredentialsById(userId);
            if (!credentials) {
                request.log.error(`API credentials not found for user ${userId}.`);
                return reply.code(403).send({ error: "Forbidden", message: "API credentials not configured or user not found." });
            }
            const useTestnet = process.env.USE_BINANCE_TESTNET === 'true';
            const balances = await binanceService.fetchUserUsdcBalance(
                credentials.apiKey, credentials.apiSecret, useTestnet
            );
            // Response validated by Fastify/Zod
            return reply.send({ 
                message: "Balance fetched successfully", 
                usdcBalance: { spot: balances.spot, futures: balances.futures } 
            });
        } catch (error: any) { // Keep existing error handling
            request.log.error(`Error in /crypto/balance route for user ${userId}: ${error.message}`);
            if (error instanceof ccxt.AuthenticationError) {
                 return reply.code(403).send({ error: 'Authentication Error', message: 'Invalid Binance API key or secret provided.' });
            }
            if (error instanceof ccxt.NetworkError || error instanceof ccxt.ExchangeNotAvailable) {
                 return reply.code(503).send({ error: 'Service Unavailable', message: `Binance API error: ${error.message}` });
            }
            if (error instanceof ccxt.RateLimitExceeded) {
                 return reply.code(429).send({ error: 'Too Many Requests', message: `Rate limit exceeded: ${error.message}` });
            }
            if (error instanceof ccxt.ExchangeError) {
                 return reply.code(502).send({ error: 'Bad Gateway', message: `Binance exchange error: ${error.message}` });
            }
            return reply.code(500).send({ 
                error: "Internal Server Error", 
                message: error.message || "Failed to fetch balance due to an unexpected error." 
            });
        }
    });

    // POST /crypto/trade
    fastify.post<{ Body: PlaceTradeBody }>("/crypto/trade", { 
        schema: {
            description: 'Place a market order (buy or sell) on either the Spot or Futures market.',
            tags: ['crypto'],
            summary: 'Place Crypto Market Order',
            security: securityRequirement,
            body: PlaceTradeBodySchema,
            response: {
                200: PlaceTradeSuccessResponseSchema,
                400: ErrorResponseSchema, // Bad Request (invalid symbol, insufficient funds, invalid order)
                401: UnauthorizedResponseSchema,
                403: ErrorResponseSchema, // Forbidden (no credentials / invalid key)
                429: ErrorResponseSchema, // Rate Limit
                500: ErrorResponseSchema, // Internal Server Error
                501: ErrorResponseSchema, // Not Implemented (e.g., feature not supported by exchange)
                502: ErrorResponseSchema, // Bad Gateway (Binance exchange error)
                503: ErrorResponseSchema  // Service Unavailable (Binance network)
            }
        } 
    }, async (request, reply) => {
        // Handler logic remains largely the same
        if (!request.auth) {
             return reply.code(401).send({ error: "Unauthorized", message: "Authentication context missing." });
        }
        const userId = request.auth.user_id;
        // Body is now correctly typed
        const { symbol, side, amount } = request.body;
        request.log.info(`User ${userId} requested to ${side} ${amount} on market ${symbol}`);
        let marketType: 'spot' | 'futures' | null = null;

        try {
            const credentials = await userRepository.findCredentialsById(userId);
            if (!credentials) {
                return reply.code(403).send({ error: "Forbidden", message: "API credentials not configured or user not found." });
            }

            if (symbol.includes(':')) {
                marketType = 'futures';
                if (!binanceService.isValidUsdcFuturesPair(symbol)) {
                    const message = `Invalid or unsupported futures market symbol provided: ${symbol}`;
                    request.log.warn(`Trade rejected for user ${userId}: ${message}`);
                    return reply.code(400).send({ error: "Bad Request", message });
                }
                 request.log.info(`User ${userId} trade target: Futures market (${symbol})`);
            } else {
                marketType = 'spot';
                 if (!binanceService.isValidUsdcSpotPair(symbol)) {
                    const message = `Invalid or unsupported spot market symbol provided: ${symbol}`;
                    request.log.warn(`Trade rejected for user ${userId}: ${message}`);
                    return reply.code(400).send({ error: "Bad Request", message });
                }
                 request.log.info(`User ${userId} trade target: Spot market (${symbol})`);
            }

            const useTestnet = process.env.USE_BINANCE_TESTNET === 'true';
            const order: Order = await binanceService.placeMarketOrder(
                credentials.apiKey, credentials.apiSecret, useTestnet, symbol, side, amount, marketType
            );

            if (marketType) { 
                const tradeData: TradeDataInput = { userId, order, marketType };
                await tradeRepository.add(tradeData); 
                request.log.info(`Trade details for order ${order.id} saved to database for user ${userId}.`);
            } else {
                request.log.error(`Market type was null after placing order ${order.id} for user ${userId}. Trade not saved to DB.`);
            }

            request.log.info({ order: order }, `User ${userId} successfully placed ${side} order ${order.id} on ${marketType} market ${symbol}`);
            // Response validated by Zod
            return reply.send({ 
                message: "Trade placed successfully", 
                order: order 
            });
        } catch (error: any) { // Keep existing error handling
            request.log.error({ err: error }, `Error placing ${marketType || 'unknown type'} trade for user ${userId} (${side} ${amount} on market ${symbol})`);
            if (error instanceof ccxt.InsufficientFunds) {
                 return reply.code(400).send({ error: 'Insufficient Funds', message: error.message });
            }
            if (error instanceof ccxt.InvalidOrder) {
                 return reply.code(400).send({ error: 'Invalid Order', message: error.message });
            }
             if (error instanceof ccxt.BadSymbol) { 
                 return reply.code(400).send({ error: 'Bad Request', message: error.message });
            }
             if (error instanceof ccxt.NotSupported) { 
                 return reply.code(501).send({ error: 'Not Implemented', message: error.message });
            }
            if (error instanceof ccxt.AuthenticationError) {
                 return reply.code(403).send({ error: 'Authentication Error', message: 'Invalid Binance API key or secret provided.' });
            }
            if (error instanceof ccxt.NetworkError || error instanceof ccxt.ExchangeNotAvailable) {
                 return reply.code(503).send({ error: 'Service Unavailable', message: `Binance API error: ${error.message}` });
            }
            if (error instanceof ccxt.RateLimitExceeded) {
                 return reply.code(429).send({ error: 'Too Many Requests', message: `Rate limit exceeded: ${error.message}` });
            }
            if (error instanceof ccxt.ExchangeError) {
                 return reply.code(502).send({ error: 'Bad Gateway', message: `Binance exchange error: ${error.message}` });
            }
            return reply.code(500).send({ 
                error: "Internal Server Error", 
                message: error.message || "Failed to place trade due to an unexpected error." 
            });
        }
    });

    // GET /crypto/trades
    fastify.get("/crypto/trades", {
        schema: {
            description: 'Fetch all trades recorded for the authenticated user, ordered by most recent first.',
            tags: ['crypto'],
            summary: 'Fetch Crypto Trades',
            security: securityRequirement,
            response: {
                200: GetTradesSuccessResponseSchema,
                401: UnauthorizedResponseSchema,
                500: ErrorResponseSchema // Internal Server Error
            }
        }
    }, async (request, reply) => {
        if (!request.auth) {
            return reply.code(401).send({ error: "Unauthorized", message: "Authentication context missing." });
        }
        const authPayload = request.auth as JwtPayload;
        const userId = authPayload.user_id;
        request.log.info(`User ${userId} requesting their trades.`);

        try {
            // TODO: Implement tradeRepository.findByUserId(userId)
            // For now, assume it returns Trade[]
            const trades = await tradeRepository.findByUserId(userId); 
            
            // Response validated by Zod
            return reply.send(trades); 

        } catch (error: any) {
            request.log.error({ err: error }, `Error fetching trades for user ${userId}`);
            return reply.code(500).send({
                error: "Internal Server Error",
                message: "An unexpected error occurred while fetching trades."
            });
        }
    });

    // PATCH /user/settings
    fastify.patch<{ Body: UpdateUserSettingsBody }>("/user/settings", { 
        schema: {
            description: 'Update user-specific settings. Currently only supports enabling/disabling automatic trading.',
            tags: ['user'],
            summary: 'Update User Settings',
            security: securityRequirement,
            body: UpdateUserSettingsBodySchema,
            response: {
                200: UpdateUserSettingsSuccessResponseSchema,
                401: UnauthorizedResponseSchema,
                404: ErrorResponseSchema, // User not found
                500: ErrorResponseSchema // Internal Server Error
            }
        } 
    }, async (request, reply) => {
        // Handler logic remains largely the same
        if (!request.auth) {
            return reply.code(401).send({ error: "Unauthorized", message: "Authentication context missing." });
        }
        const authPayload = request.auth as JwtPayload;
        const userId = authPayload.user_id;
        // Body is now correctly typed
        const settingsToUpdate = request.body;

        request.log.info({ settings: settingsToUpdate }, `User ${userId} requesting to update settings.`);

        try {
            const updatedUser = await userService.updateUserSettings(userId, {
                automaticTradingEnabled: settingsToUpdate.automaticTradingEnabled
            });

            if (updatedUser) {
                request.log.info(`Successfully updated settings for user ${userId}.`);
                 // Response validated by Zod
                 return reply.send({ message: "User settings updated successfully.", user: updatedUser });
            } else {
                request.log.warn(`Failed to update settings for user ${userId}. User might not exist or repo error.`);
                return reply.code(404).send({ error: "Not Found", message: "User not found or settings update failed." }); 
            }
        } catch (error: any) { // Keep existing error handling
            request.log.error({ err: error }, `Unexpected error updating settings for user ${userId}`);
            return reply.code(500).send({ 
                error: "Internal Server Error", 
                message: "An unexpected error occurred while updating user settings." 
            });
        }
    });
} 