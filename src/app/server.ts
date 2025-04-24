import "reflect-metadata"; // REQUIRED: Must be the first import for tsyringe
import 'module-alias/register';
import "dotenv/config";
import Fastify, { FastifyInstance } from "fastify";
import fastifyJwt from '@fastify/jwt'; // Import @fastify/jwt
import fastifySwagger from '@fastify/swagger'; // Import Swagger
import fastifySwaggerUi from '@fastify/swagger-ui'; // Import Swagger UI
// Import Zod type provider components
import {
  serializerCompiler, validatorCompiler, ZodTypeProvider, jsonSchemaTransform
} from 'fastify-type-provider-zod';

// Service/Client imports are mostly handled by bootstrap
// Import types needed for events or direct use
import type { TokenTradingSignal } from "@/infra/external/tokenMetrics";
// Keep route imports
import publicRoutes from '@/modules/routes/publicRoutes';
import authenticatedRoutes from '@/modules/routes/authenticatedRoutes';
import authRoutes from '@/modules/auth/routes/auth.routes'; // Import the new auth routes
import { polymarketRoutes } from '@/modules/polymarket'; // Import Polymarket routes

// Import bootstrap function and AppServices type
import { bootstrapApp, AppServices } from './bootstrap';

// Import the new service class
import { SuggestionService } from '@/modules/suggestions/services/suggestion.service';
// Import the InfiniteGamesService interface
import { IInfiniteGamesService } from '@/core/interfaces/IInfiniteGamesService';

// Import needed types and ccxt
import type { Trade } from '@prisma/client';
import type { Order as CcxtOrder } from 'ccxt'; // Alias CcxtOrder
import * as ccxt from 'ccxt';
import { container } from "tsyringe"; // Import tsyringe container
import type { FastifyBaseLogger } from 'fastify';

// Main function to build the Fastify app
export async function build(): Promise<FastifyInstance> {
    // Add the ZodTypeProvider generic
    const fastify = Fastify({
      logger: true, // Use Fastify's built-in logger
    }).withTypeProvider<ZodTypeProvider>();

    // Set the validator and serializer compilers
    fastify.setValidatorCompiler(validatorCompiler);
    fastify.setSerializerCompiler(serializerCompiler);

    // === Register Logger with DI Container ===
    // Must happen AFTER fastify is created but BEFORE services needing the logger are resolved/used.
    container.registerInstance<FastifyBaseLogger>("Logger", fastify.log);
    fastify.log.info("Fastify logger registered with DI container.");
    // ========================================

    // --- Bootstrap Core Services ---
    let services: AppServices;
    try {
        // Bootstrap now resolves services, including TradeClosureService which depends on Logger
        services = await bootstrapApp();
    } catch (initError) {
        // Log error using console initially, as Fastify logger might not be ready
        console.error("CRITICAL: Failed to bootstrap application services:", initError);
        // Use Fastify logger if available, otherwise console
        (fastify.log || console).error("CRITICAL: Failed to bootstrap application services:", initError);
        process.exit(1);
    }

    // --- Register Core Plugins (like JWT) ---
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      // Log a warning if no secret is set, especially important for production
      fastify.log.warn('JWT_SECRET environment variable not set. Using default secret for development ONLY.');
    }
    fastify.register(fastifyJwt, {
      secret: jwtSecret || 'default-very-insecure-secret-for-dev-use-only' // Use env secret or a default (change default!)
      // Add other JWT options here if needed (e.g., sign: { expiresIn: '1h' })
    });
    
    // --- Register Swagger --- 
    // Should be registered before routes
    await fastify.register(fastifySwagger, {
      // Add the transform for Zod schemas
      transform: jsonSchemaTransform,
      swagger: {
        info: {
          title: 'CryptoCompass API',
          description: 'API documentation for the CryptoCompass backend service.',
          version: '0.1.0' // Update version as needed
        },
        // externalDocs: { url: 'https://swagger.io', description: 'Find more info here' },
        host: process.env.API_HOST || 'localhost:3001', // Adjust host if needed
        schemes: [process.env.API_SCHEME || 'http'], // Adjust scheme if needed (http/https)
        consumes: ['application/json'],
        produces: ['application/json'],
        tags: [ // Define tags for grouping routes
          { name: 'public', description: 'Public Endpoints (No Auth Required)' },
          { name: 'auth', description: 'Authentication Endpoints' },
          { name: 'user', description: 'User-specific Endpoints (Auth Required)' },
          { name: 'crypto', description: 'Crypto-related Endpoints' },
          { name: 'polymarket', description: 'Polymarket-related Endpoints' },
        ],
        // Define security definitions for JWT
        securityDefinitions: {
          apiKey: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header',
            description: 'Enter your JWT token in the format \'Bearer <token>\''
          }
        }
        // Add global security requirement if needed
        // security: [{ apiKey: [] }],
      }
    });
    
    // Register Swagger UI for interactive documentation
    await fastify.register(fastifySwaggerUi, {
      routePrefix: '/documentation', // Access UI at /documentation
      uiConfig: {
        docExpansion: 'list', // 'full', 'none'
        deepLinking: false
      },
      // uiHooks: { onRequest: function (request, reply, next) { next() }, preHandler: function (request, reply, next) { next() } },
      staticCSP: false, // Disable CSP to potentially resolve HTTP loading issues
      // transformStaticCSP: (header) => header,
      // transformSpecification: (swaggerObject, request, reply) => { return swaggerObject },
      // transformSpecificationClone: true
    });

    // --- Decorate Fastify Instance (with core services) ---
    fastify.decorate('storageService', services.storageService);
    fastify.decorate('binanceService', services.binanceService);
    fastify.decorate('tokenMetricsClient', services.tokenMetricsClient);
    fastify.decorate('signalGenerator', services.signalGenerator);
    // Add decorations for Repositories and UserService
    fastify.decorate('userRepository', services.userRepository);
    fastify.decorate('tradeRepository', services.tradeRepository);
    fastify.decorate('userService', services.userService);
    fastify.decorate('tradeClosureService', services.tradeClosureService); // Decorate the new service
    // Optionally decorate others if directly needed by plugins/hooks added here
    fastify.decorate('suggestionGenerator', services.suggestionGenerator);

    fastify.decorate('infiniteGamesClient', services.infiniteGamesClient); // Already has IG Client
    fastify.decorate('infiniteGamesService', services.infiniteGamesService); // Decorate with the new service
    
    // --- Instantiate Services Requiring Fastify Instance (like logger) ---
    const suggestionService = container.resolve(SuggestionService); // Resolve SuggestionService if needed here

    // --- Register Route Plugins --- 
    // Routes rely on decorated services or resolve from container
    fastify.register(publicRoutes);
    fastify.register(authenticatedRoutes);
    fastify.register(authRoutes);
    fastify.register(polymarketRoutes); // Register Polymarket routes with prefix

    // --- Start Periodic Tasks & Event Listeners --- 
    const SUGGESTION_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; 
    const INFINITE_GAMES_UPDATE_INTERVAL_MS = 1 * 60 * 60 * 1000; // 1 hour

    // Start suggestion updates using the resolved service
    // Ensure SuggestionService is correctly resolved/instantiated if needed here or via bootstrap
    await suggestionService.startPeriodicUpdates(SUGGESTION_UPDATE_INTERVAL_MS, true); // Run immediately

    // Start Infinite Games updates
    await services.infiniteGamesService.startPeriodicUpdates(INFINITE_GAMES_UPDATE_INTERVAL_MS, true);

    await services.signalGenerator.start();

    // --- Signal Event Listeners --- 
    services.signalGenerator.on('buy', async (symbol: string, signal: TokenTradingSignal) => {
        fastify.log.info(`***** RECEIVED BUY SIGNAL for ${symbol} *****`, signal);
        // TODO: Implement actual buy logic if enabled/needed
        
        // Call the TradeClosureService to handle potential closures
        await services.tradeClosureService.processSignal('buy', symbol, signal);
    });

    services.signalGenerator.on('sell', async (symbol: string, signal: TokenTradingSignal) => {
        fastify.log.info(`***** RECEIVED SELL SIGNAL for ${symbol} *****`, signal);
        // TODO: Implement actual sell logic if enabled/needed

        // Call the TradeClosureService to handle potential closures
        await services.tradeClosureService.processSignal('sell', symbol, signal);
    });

    services.signalGenerator.on('error', (error: Error) => {
        fastify.log.error("***** SIGNAL GENERATOR ERROR *****", error);
    });

    // --- Shutdown Hook --- 
    fastify.addHook('onClose', async (instance) => {
        // Stop suggestion service updates
        suggestionService.stopPeriodicUpdates();
        // Stop Infinite Games service updates
        services.infiniteGamesService.stopPeriodicUpdates();
        
        // Stop signal generator
        if (services.signalGenerator) {
             services.signalGenerator.stop();
        }
        // Consider adding DB closing logic if needed and exposed
        // e.g., if bootstrap returned a closeDb function: await services.closeDatabase();
    });

    return fastify;
}

// --- Server Start (if run directly) --- 
if (require.main === module) {
  (async () => {
    let server: FastifyInstance | null = null;
    try {
      server = await build();
      const port = parseInt(process.env.PORT || "3001", 10);
      server.log.info(`Server attempting to listen on http://0.0.0.0:${port}`);
      await server.listen({ port, host: "0.0.0.0" });
    } catch (err) {
      const logger = server?.log || console; // Use server logger if available
      console.error(err)
      // Pass error object as the first argument or in an object for better logging
      logger.error({ err }, "Server startup failed");
      process.exit(1);
    }
  })();
}
