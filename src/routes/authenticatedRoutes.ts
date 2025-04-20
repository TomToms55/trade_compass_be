import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { authenticate } from '../middleware/auth';
import { getUserApiCredentials } from '../services/database';
import ccxt, { Exchange } from 'ccxt';

export default async function authenticatedRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {

    // Apply authentication middleware to all routes registered in this plugin
    fastify.addHook('onRequest', authenticate);

    // We will need binanceService, likely decorated onto fastify
    const binanceService = fastify.binanceService;
    if (!binanceService) {
        throw new Error('Binance service not decorated on Fastify instance');
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

    // POST /fetchBalance
    fastify.post("/fetchBalance", async (request, reply) => {
        if (!request.user) {
            return reply.code(401).send({ error: "Unauthorized", message: "User context missing." });
        }

        const userId = request.user.user_id;
        request.log.info(`User ${userId} requesting balance.`);

        try {
            // 1. Get user credentials
            const credentials = await getUserApiCredentials(userId);
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
                symbol: { type: 'string', description: 'Base symbol (e.g., BTC, ETH)' },
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
        const { symbol: baseSymbol, side, amount } = request.body as { symbol: string; side: 'buy' | 'sell'; amount: number };
        
        request.log.info(`User ${userId} requested to ${side} ${amount} of ${baseSymbol}`);

        // Declare variables outside try block for catch block access
        let targetMarket: string | null = null; 
        let marketType: 'spot' | 'futures' | null = null;

        try {
            // 1. Get user credentials
            const credentials = await getUserApiCredentials(userId);
            if (!credentials) {
                request.log.error(`API credentials not found for user ${userId}.`);
                return reply.code(403).send({ error: "Forbidden", message: "API credentials not configured or user not found." });
            }

            // 2. Construct potential market symbols
            const baseSymbolUpper = baseSymbol.toUpperCase();
            const spotMarketSymbol = `${baseSymbolUpper}/USDC`;
            const futuresMarketSymbol = `${baseSymbolUpper}/USDC:USDC`;

            // 3. Determine target market and type based on availability and side
            const hasFuturesMarket = binanceService.isValidUsdcFuturesPair(futuresMarketSymbol);
            const hasSpotMarket = binanceService.isValidUsdcSpotPair(spotMarketSymbol);

            if (hasFuturesMarket) {
                // Prefer futures if available for both buy and sell
                targetMarket = futuresMarketSymbol;
                marketType = 'futures';
                request.log.info(`User ${userId} trade target: Futures market (${targetMarket})`);
            } else if (hasSpotMarket && side === 'buy') {
                // Fallback to spot ONLY for BUY orders if futures not available
                targetMarket = spotMarketSymbol;
                marketType = 'spot';
                request.log.info(`User ${userId} trade target: Spot market (${targetMarket}) - Buy only`);
            } else {
                // Error: Spot sell not allowed, or neither market available
                let reason = `No supported market found for ${baseSymbolUpper}`;
                if (hasSpotMarket && side === 'sell') {
                    reason = `Selling on the spot market (${spotMarketSymbol}) is not supported via this endpoint.`;
                }
                request.log.warn(`Trade rejected for user ${userId}: ${reason}`);
                // Use 400 for invalid request based on rules, or 501 if feature is intentionally unimplemented
                return reply.code(400).send({ error: "Trade Not Allowed", message: reason });
            }

            // 4. Determine if using Testnet
            const useTestnet = process.env.USE_BINANCE_TESTNET === 'true';

            // 5. Call the service method
            const order = await binanceService.placeMarketOrder(
                credentials.apiKey,
                credentials.apiSecret,
                useTestnet,
                targetMarket, // Use the determined target market
                side,
                amount,
                marketType    // Pass the determined market type
            );

            // 6. Send successful response with order details
            request.log.info({ order: order }, `User ${userId} successfully placed ${side} order ${order.id} on ${marketType} market ${targetMarket}`);
            return reply.send({ 
                message: "Trade placed successfully", 
                order: order // Send back the full order details from CCXT
            });

        } catch (error: any) {
            // Now targetMarket and marketType are accessible here
            request.log.error({ err: error }, `Error placing ${marketType || 'unknown type'} trade for user ${userId} (${side} ${amount} ${baseSymbol}) on market ${targetMarket || 'unknown'}`);

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
} 