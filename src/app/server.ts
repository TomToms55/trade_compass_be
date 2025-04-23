import 'module-alias/register';
import "dotenv/config";
import Fastify, { FastifyInstance } from "fastify";

// Service/Client imports are mostly handled by bootstrap
// Import types needed for events or direct use
import type { TokenTradingSignal } from "@/infra/external/tokenMetrics";
// Keep route imports
import publicRoutes from '@/modules/routes/publicRoutes';
import authenticatedRoutes from '@/modules/routes/authenticatedRoutes';

// Import bootstrap function and AppServices type
import { bootstrapApp, AppServices } from './bootstrap';

// Import the new service class
import { SuggestionService } from '@/modules/suggestions/services/suggestion.service';

// Main function to build the Fastify app
export async function build(): Promise<FastifyInstance> {
    const fastify = Fastify({
      logger: true, // Use Fastify's built-in logger
    });

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
    // Routes rely on decorated services
    fastify.register(publicRoutes);
    fastify.register(authenticatedRoutes);

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
        // TODO: Add error handling/alerting
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
      logger.error("Server startup failed:", err);
      process.exit(1);
    }
  })();
}
