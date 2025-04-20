import "dotenv/config";
import Fastify, { FastifyInstance } from "fastify";
import { initializeDatabase } from "./services/database";
// import { authenticate } from "./middleware/auth"; // Auth middleware is now applied in authenticatedRoutes

// Import service factories and types
import createStorageService from "./services/storage";
import { createTokenMetricsClient } from "./api/tokenMetrics";
import { createInfiniteGamesClient } from "./api/infiniteGames";
import { createSuggestionGenerator, SuggestionGenerator } from "./services/suggestionGenerator";
import binanceService from "./services/binance";
import { TradeSuggestion } from "./types";
import * as userService from './services/userService';
import { getUserApiCredentials } from './services/database';

// Import route plugins
import publicRoutes from './routes/publicRoutes';
import authenticatedRoutes from './routes/authenticatedRoutes';

// Main function to build the Fastify app
export async function build(): Promise<FastifyInstance> {
    const fastify = Fastify({
      logger: true,
    });

    // --- Service Initialization --- 
    const SUGGESTION_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
    let storageServiceInstance: ReturnType<typeof createStorageService>;
    let tokenMetricsClient: ReturnType<typeof createTokenMetricsClient>;
    let infiniteGamesClient: ReturnType<typeof createInfiniteGamesClient>;
    let suggestionGenerator: SuggestionGenerator;
    // Note: binanceService is already a singleton instance

    async function initializeServices() {
        console.log("Initializing services...");
        await initializeDatabase();
        await binanceService.loadMarkets(); 
        // Get MarketInfo records
        const spotMarketInfoMap = binanceService.getUsdcSpotMarketInfo();    
        const futuresMarketInfoMap = binanceService.getUsdcFuturesMarketInfo(); 
        tokenMetricsClient = createTokenMetricsClient();
        infiniteGamesClient = createInfiniteGamesClient();
        // Pass MarketInfo records to the generator
        suggestionGenerator = createSuggestionGenerator(tokenMetricsClient, spotMarketInfoMap, futuresMarketInfoMap);
        storageServiceInstance = createStorageService();
        console.log("All services initialized successfully!");

        // Decorate Fastify instance with initialized services
        fastify.decorate('storageService', storageServiceInstance);
        fastify.decorate('binanceService', binanceService); // Decorate with the singleton instance
        // Add other decorators if needed
    }

    // --- Suggestion Update Logic --- 
    const updateSuggestions = async () => {
        // Check if services are initialized (using decorators)
        if (!suggestionGenerator || !fastify.storageService) {
            console.warn('Services not initialized, skipping suggestion update.');
            return; 
        }
        console.log("Starting suggestion generation...");
        try {
            const newSuggestions = await suggestionGenerator.generateSuggestions();
            await fastify.storageService.saveSuggestions(newSuggestions);
            console.log(`Successfully generated and saved ${newSuggestions.length} suggestions.`);
        } catch (error) {
            console.error("Failed to update suggestions:", error);
        }
    };

    // --- Initialize Services --- 
    await initializeServices(); 

    // --- Register Route Plugins --- 
    fastify.register(publicRoutes);
    fastify.register(authenticatedRoutes);
    // Note: No need to register auth middleware here, it's inside authenticatedRoutes plugin

    // --- Periodic Tasks & Shutdown Hooks --- 
    await updateSuggestions(); // Initial run
    const intervalId = setInterval(updateSuggestions, SUGGESTION_UPDATE_INTERVAL_MS);
    console.log(`Suggestion updates scheduled every ${SUGGESTION_UPDATE_INTERVAL_MS / (60 * 60 * 1000)} hours.`);

    fastify.addHook('onClose', async (instance) => {
        clearInterval(intervalId);
        console.log('Cleared suggestion update interval.');
        // await closeDatabase(); // Consider adding DB closing
    });

    return fastify;
}

// --- Server Start (if run directly) --- 
if (require.main === module) {
  (async () => {
    try {
      const server = await build();
      const port = parseInt(process.env.PORT || "3001", 10);
      await server.listen({ port, host: "0.0.0.0" });
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  })();
}
