import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { authenticate } from '@/middleware/auth';
// Import repository interfaces
import { IUserRepository, ITradeRepository, TradeDataInput } from '@/core/interfaces'; 
// Still need UserService for updateUserSettings
import { UserService } from '@/modules/services/userService'; 
import ccxt, { Exchange, Order } from 'ccxt';

export default async function authenticatedRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {

    // Apply authentication middleware to all routes registered in this plugin
    fastify.addHook('onRequest', authenticate);

    // Dependencies will be decorated onto fastify
    const binanceService = fastify.binanceService; // Assuming IBinanceService
    const userRepository = fastify.userRepository as IUserRepository; // Assuming IUserRepository
    const tradeRepository = fastify.tradeRepository as ITradeRepository; // Assuming ITradeRepository
    const userService = fastify.userService as UserService; // Assuming UserService class instance

    // Basic check for decorated dependencies
    if (!binanceService || !userRepository || !tradeRepository || !userService) {
        throw new Error('Required services or repositories not decorated on Fastify instance');
    }

    // Define schema for /fetchOHLCV request body
    const fetchOhlcvSchema = {
        body: {
            type: 'object',
            required: ['symbol'],
            properties: {
                symbol: { type: 'string', description: 'Trading pair symbol (e.g., BTC/USDC)' },
                timeframe: { type: 'string', description: 'Timeframe for OHLCV data (e.g., 1h, 1d, 1M)', nullable: true, default: '1h' },
                limit: { type: 'integer', description: 'Number of candles to fetch', nullable: true, default: 100, minimum: 1 },
            },
        },
    };

    // POST /fetchOHLCV update for futures support also
    fastify.post("/fetchOHLCV", { schema: fetchOhlcvSchema }, async (request, reply) => {
        if (!request.user) {
            return reply.code(401).send({ error: "Unauthorized", message: "Missing user context" });
        }
        
        // Use defaults from schema if not provided
        const { symbol, timeframe = '1h', limit = 100 } = request.body as { 
            symbol: string; 
            timeframe?: string; 
            limit?: number 
        };
        const exchange = binanceService.getExchangeInstance(); // Use decorated service

        try {
            const ohlcvData = await exchange.fetchOHLCV(symbol, timeframe, undefined, limit);

            if (!ohlcvData || ohlcvData.length === 0) {
                return reply.code(404).send({ 
                    error: "Not Found",
                    message: `No OHLCV data found for symbol ${symbol} with timeframe ${timeframe}`,
                });
            }
            
            return reply.send(ohlcvData);

        } catch (error: any) {
            request.log.error(`Error fetching OHLCV for ${symbol} (${timeframe}, limit ${limit}): ${error.message}`);
            // Error handling (copied from index.ts)
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

    // GET /fetchBalance
    fastify.get("/fetchBalance", async (request, reply) => {
        if (!request.user) {
            return reply.code(401).send({ error: "Unauthorized", message: "User context missing." });
        }

        const userId = request.user.user_id;
        request.log.info(`User ${userId} requesting balance.`);

        try {
            // Use repository to get credentials
            const credentials = await userRepository.findCredentialsById(userId);
            if (!credentials) {
                request.log.error(`API credentials not found for user ${userId}.`);
                return reply.code(403).send({ error: "Forbidden", message: "API credentials not configured or user not found." });
            }

            // 2. Determine if using Testnet
            const useTestnet = process.env.USE_BINANCE_TESTNET === 'true';

            // 3. Call the service method
            const balances = await binanceService.fetchUserUsdcBalance(
                credentials.apiKey,
                credentials.apiSecret,
                useTestnet
            );

            // 4. Send successful response with both balances
            return reply.send({ 
                message: "Balance fetched successfully", 
                usdcBalance: {
                    spot: balances.spot,
                    futures: balances.futures
                } 
            });

        } catch (error: any) {
            request.log.error(`Error in /fetchBalance route for user ${userId}: ${error.message}`);
            
            // Handle specific CCXT errors re-thrown by the service
            if (error instanceof ccxt.AuthenticationError) {
                 return reply.code(403).send({ error: 'Authentication Error', message: 'Invalid Binance API key or secret provided.' });
            }
            if (error instanceof ccxt.NetworkError || error instanceof ccxt.ExchangeNotAvailable) {
                 return reply.code(503).send({ error: 'Service Unavailable', message: `Binance API error: ${error.message}` });
            }
            if (error instanceof ccxt.RateLimitExceeded) {
                 return reply.code(429).send({ error: 'Too Many Requests', message: `Rate limit exceeded: ${error.message}` });
            }
            // Handle other specific ccxt.ExchangeError if needed
            if (error instanceof ccxt.ExchangeError) { // Catch-all for other Binance errors
                 return reply.code(502).send({ error: 'Bad Gateway', message: `Binance exchange error: ${error.message}` });
            }

            // Handle the generic error thrown by the service or other unexpected errors
            return reply.code(500).send({ 
                error: "Internal Server Error", 
                message: error.message || "Failed to fetch balance due to an unexpected error." 
            });
        }
    });

    // --- Place Trade --- 

    // Define schema for /placeTrade request body
    const placeTradeSchema = {
        body: {
            type: 'object',
            required: ['symbol', 'side', 'amount'],
            properties: {
                symbol: { type: 'string', description: 'Full market symbol (e.g., BTC/USDC for spot, BTC/USDC:USDC for futures)' },
                side: { type: 'string', enum: ['buy', 'sell'] },
                amount: { type: 'number', exclusiveMinimum: 0, description: 'For BUY: cost in USDC. For SELL: quantity in base asset.' },
            },
        },
    };

    // POST /placeTrade 
    fastify.post("/placeTrade", { schema: placeTradeSchema }, async (request, reply) => {
        if (!request.user) {
            return reply.code(401).send({ error: "Unauthorized", message: "User context missing." });
        }

        const userId = request.user.user_id;
        // Now 'symbol' is the full market symbol from the user
        const { symbol, side, amount } = request.body as { 
            symbol: string; 
            side: 'buy' | 'sell'; 
            amount: number 
        };
        
        request.log.info(`User ${userId} requested to ${side} ${amount} on market ${symbol}`);

        // Declare variables outside try block for catch block access
        let marketType: 'spot' | 'futures' | null = null; // Initialize to null

        try {
            // Use repository to get credentials
            const credentials = await userRepository.findCredentialsById(userId);
            if (!credentials) {
                 return reply.code(403).send({ error: "Forbidden", message: "API credentials not configured or user not found." });
            }

            // 2. Determine market type and validate the symbol
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
                 // Spot sells might still be restricted depending on service logic, but the route allows attempting it.
                 request.log.info(`User ${userId} trade target: Spot market (${symbol})`);
            }

            // 3. Determine if using Testnet
            const useTestnet = process.env.USE_BINANCE_TESTNET === 'true';

            // 4. Call the service method with the user-provided symbol and determined type
            const order: Order = await binanceService.placeMarketOrder(
                credentials.apiKey,
                credentials.apiSecret,
                useTestnet,
                symbol, // Use the validated user-provided symbol directly
                side,
                amount,
                marketType // Pass the determined market type
            );

            // 5. Store the successful trade in the database
            //    Ensure marketType is not null here. The logic above should guarantee it.
            if (marketType) { 
                const tradeData: TradeDataInput = { userId, order, marketType };
                await tradeRepository.add(tradeData); 
                request.log.info(`Trade details for order ${order.id} saved to database for user ${userId}.`);
            } else {
                // This case should theoretically not happen if validation is correct
                request.log.error(`Market type was null after placing order ${order.id} for user ${userId}. Trade not saved to DB.`);
            }

            // 6. Send successful response with order details
            request.log.info({ order: order }, `User ${userId} successfully placed ${side} order ${order.id} on ${marketType} market ${symbol}`);
            return reply.send({ 
                message: "Trade placed successfully", 
                order: order // Send back the full order details from CCXT
            });

        } catch (error: any) {
            // Use the determined marketType and the original symbol in logs
            request.log.error({ err: error }, `Error placing ${marketType || 'unknown type'} trade for user ${userId} (${side} ${amount} on market ${symbol})`);

            // Handle specific CCXT errors re-thrown by the service
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
            if (error instanceof ccxt.ExchangeError) { // Catch-all for other Binance errors
                 return reply.code(502).send({ error: 'Bad Gateway', message: `Binance exchange error: ${error.message}` });
            }

            // Handle generic errors or ones wrapped by the service
            return reply.code(500).send({ 
                error: "Internal Server Error", 
                message: error.message || "Failed to place trade due to an unexpected error." 
            });
        }
    });

    // --- User Settings --- 

    // Define schema for /user/settings request body
    const updateUserSettingsSchema = {
        body: {
            type: 'object',
            required: ['automaticTradingEnabled'], // Only this setting is supported for now
            properties: {
                automaticTradingEnabled: { type: 'boolean', description: 'Enable or disable automatic trading strategies.' },
                // Add other settings here in the future
            },
             additionalProperties: false // Disallow properties not defined in the schema
        },
    };

    // PATCH /user/settings
    fastify.patch("/user/settings", { schema: updateUserSettingsSchema }, async (request, reply) => {
        if (!request.user) {
            return reply.code(401).send({ error: "Unauthorized", message: "User context missing." });
        }

        const userId = request.user.user_id;
        const settingsToUpdate = request.body as { automaticTradingEnabled: boolean }; // Cast based on schema

        request.log.info({ settings: settingsToUpdate }, `User ${userId} requesting to update settings.`);

        try {
            // Use the UserService instance
            const result = await userService.updateUserSettings(userId, settingsToUpdate);

            if (result.success) {
                request.log.info(`Successfully updated settings for user ${userId}.`);
                // Optionally fetch and return the updated user settings
                return reply.send({ message: "User settings updated successfully." });
            } else {
                request.log.warn(`Failed to update settings for user ${userId}: ${result.error}`);
                // Determine appropriate status code based on the error message
                if (result.error?.includes('User not found')) {
                     return reply.code(404).send({ error: "Not Found", message: result.error });
                }
                 if (result.error?.includes('Invalid setting value')) {
                     return reply.code(400).send({ error: "Bad Request", message: result.error });
                }
                // Generic internal server error for other failures
                return reply.code(500).send({ error: "Internal Server Error", message: result.error || "Failed to update user settings." });
            }
        } catch (error: any) {
            request.log.error({ err: error }, `Unexpected error updating settings for user ${userId}`);
            return reply.code(500).send({ 
                error: "Internal Server Error", 
                message: "An unexpected error occurred while updating user settings." 
            });
        }
    });
} 