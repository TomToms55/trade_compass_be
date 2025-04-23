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

// Import bootstrap function and AppServices type
import { bootstrapApp, AppServices } from './bootstrap';

// Import the new service class
import { SuggestionService } from '@/modules/suggestions/services/suggestion.service';

// Main function to build the Fastify app
export async function build(): Promise<FastifyInstance> {
    // Add the ZodTypeProvider generic
    const fastify = Fastify({
      logger: true, // Use Fastify's built-in logger
    }).withTypeProvider<ZodTypeProvider>();

    // Set the validator and serializer compilers
    fastify.setValidatorCompiler(validatorCompiler);
    fastify.setSerializerCompiler(serializerCompiler);

    // --- Bootstrap Core Services ---
    let services: AppServices;
    try {
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
          { name: 'trading', description: 'Trading Endpoints (Auth Required)' },
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
    // Optionally decorate others if directly needed by plugins/hooks added here
    // fastify.decorate('suggestionGenerator', services.suggestionGenerator);
    // fastify.decorate('infiniteGamesClient', services.infiniteGamesClient);
    
    // --- Instantiate Services Requiring Fastify Instance (like logger) ---
    const suggestionService = new SuggestionService(
        services.suggestionGenerator, 
        services.storageService, 
        fastify.log // Pass the logger
    );

    // --- Register Route Plugins --- 
    // Routes rely on decorated services or resolve from container
    fastify.register(publicRoutes);
    fastify.register(authenticatedRoutes);
    fastify.register(authRoutes);

    // --- Start Periodic Tasks & Event Listeners --- 
    const SUGGESTION_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; 
    
    // Start suggestion updates using the new service
    await suggestionService.startPeriodicUpdates(SUGGESTION_UPDATE_INTERVAL_MS, true); // Run immediately

    await services.signalGenerator.start();

    services.signalGenerator.on('buy', (symbol: string, signal: TokenTradingSignal) => {
        fastify.log.info(`***** RECEIVED BUY SIGNAL for ${symbol} *****`, signal);
        // TODO: Implement buy logic (e.g., call services.binanceService.placeMarketOrder)
    });

    services.signalGenerator.on('sell', (symbol: string, signal: TokenTradingSignal) => {
        fastify.log.info(`***** RECEIVED SELL SIGNAL for ${symbol} *****`, signal);
        // TODO: Implement sell logic (e.g., call services.binanceService.placeMarketOrder)
    });

    services.signalGenerator.on('error', (error: Error) => {
        fastify.log.error("***** SIGNAL GENERATOR ERROR *****", error);
    });

    // --- Shutdown Hook --- 
    fastify.addHook('onClose', async (instance) => {
        // Stop suggestion service updates
        suggestionService.stopPeriodicUpdates();
        
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
