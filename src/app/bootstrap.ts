//import "reflect-metadata"; // Must be imported first for tsyringe
import { container } from "tsyringe";

import BinanceService from '@/modules/services/binance'; // Import the instance and potentially the class
import createStorageService from '@/modules/services/storage';
import { createInfiniteGamesClient } from '@/infra/external/infiniteGames';
import { createSuggestionGenerator } from '@/modules/suggestions/services/suggestionGenerator';
import { SignalGenerator } from '@/modules/services/signalGenerator';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { UserRepository } from '@/infra/db/repositories/UserRepository';
import { TradeRepository } from '@/infra/db/repositories/TradeRepository';
import { UserService } from '@/modules/services/userService';
import { AuthService } from "@/modules/auth/services/auth.service"; // Import AuthService
import { TradeClosureService } from "@/modules/trading/services/trade-closure.service"; // Import TradeClosureService
import { IInfiniteGamesService } from '@/core/interfaces/IInfiniteGamesService'; 
import { InfiniteGamesService } from '@/modules/infinite_games/services/infiniteGames.service';
import { SuggestionService } from '@/modules/suggestions/services/suggestion.service'; // Import SuggestionService
// Import the concrete class for direct registration
import { TokenMetricsClient } from '@/infra/external/tokenMetrics';
// Import the new LLM client
import { GeminiClient } from '@/infra/external/llm/gemini.client';

// Import interfaces for type safety
import type { 
    IBinanceService, 
    IStorageService, 
    ITokenMetricsClient, 
    IInfiniteGamesClient, 
    ISuggestionGenerator, 
    ISignalGenerator, 
    IUserRepository, 
    ITradeRepository, 
    IUserService,
    IAuthService, // Import IAuthService
    ITradeClosureService, // Import ITradeClosureService
    ILLMClient // Add LLM Client interface
    // ISuggestionService // No longer returned from here
} from '@/core/interfaces';

// AppServices now returns the dependencies needed to create SuggestionService later
export interface AppServices {
    storageService: IStorageService;
    binanceService: IBinanceService;
    tokenMetricsClient: ITokenMetricsClient;
    infiniteGamesClient: IInfiniteGamesClient;
    suggestionGenerator: ISuggestionGenerator; // SuggestionService needs this
    signalGenerator: ISignalGenerator;
    userRepository: IUserRepository;
    tradeRepository: ITradeRepository;
    userService: IUserService;
    tradeClosureService: ITradeClosureService; // Add TradeClosureService
    infiniteGamesService: IInfiniteGamesService; // Add the service interface back
    llmClient: ILLMClient; // Add LLM Client
}

/**
 * Initializes and wires up all core application services using Tsyringe.
 * This acts as the Composition Root.
 */
export async function bootstrapApp(): Promise<AppServices> { // Return type might change
    console.log("Bootstrapping application services with Tsyringe...");

    // --- Tsyringe Container Registration ---

    // Example: Registering AuthService
    container.register<IAuthService>("IAuthService", { useClass: AuthService });

    // Register TradeClosureService
    container.register<ITradeClosureService>("ITradeClosureService", { useClass: TradeClosureService });

    // Register InfiniteGamesService
    container.register<IInfiniteGamesService>("IInfiniteGamesService", { useClass: InfiniteGamesService });
    console.log("InfiniteGamesService registered.");

    // Register SuggestionService
    container.register<SuggestionService>(SuggestionService, { useClass: SuggestionService });
    console.log("SuggestionService registered.");

    // Register Repositories
    container.register("IUserRepository", UserRepository);
    container.register("ITradeRepository", TradeRepository);

    // Register UserService
    container.register("IUserService", UserService);

    const binanceService = container.resolve<BinanceService>(BinanceService);
    await binanceService.loadMarkets(); // Perform async setup before registering instance
    container.registerInstance<IBinanceService>("IBinanceService", binanceService);
    console.log("Binance Service registered & markets loaded.");

    // Register External Clients using Factories/Classes
    // **** UPDATED **** Use useClass for TokenMetricsClient which is now a singleton
    container.register<ITokenMetricsClient>("ITokenMetricsClient", {
         useClass: TokenMetricsClient 
    });
    console.log("TokenMetricsClient registered using useClass.");

    container.register<IInfiniteGamesClient>("IInfiniteGamesClient", {
         useFactory: (dependencyContainer) => createInfiniteGamesClient()
    });
    console.log("InfiniteGamesClient factory registered.");

    // Register Storage Service using Factory
    container.register<IStorageService>("IStorageService", {
         useFactory: (dependencyContainer) => createStorageService()
    });
    console.log("StorageService factory registered.");

    // Register SuggestionGenerator using Factory
    container.register<ISuggestionGenerator>("ISuggestionGenerator", {
        useFactory: (dependencyContainer) => {
            const tokenMetricsClient = dependencyContainer.resolve<ITokenMetricsClient>("ITokenMetricsClient");
            const binanceService = dependencyContainer.resolve<IBinanceService>("IBinanceService");
            // Assuming binanceService is already loaded/initialized
            const spotMarketInfoMap = binanceService.getUsdcSpotMarketInfo();
            const futuresMarketInfoMap = binanceService.getUsdcFuturesMarketInfo();
            return createSuggestionGenerator(tokenMetricsClient, spotMarketInfoMap, futuresMarketInfoMap);
        }
    });
    console.log("SuggestionGenerator factory registered.");

    // Register SignalGenerator using Factory to handle constructor arguments
    container.register<ISignalGenerator>("ISignalGenerator", {
        useFactory: (dependencyContainer) => {
            const tokenMetricsClient = dependencyContainer.resolve<ITokenMetricsClient>("ITokenMetricsClient");
            // Read interval from environment or use default
            const interval = parseInt(process.env.SIGNAL_CHECK_INTERVAL_MINUTES || "60", 10);
            // Manually instantiate with resolved dependency and config value
            return new SignalGenerator(tokenMetricsClient, interval);
        }
    });
    console.log("SignalGenerator factory registered.");

    // Register LLM Client
    container.register<ILLMClient>("ILLMClient", { useClass: GeminiClient });
    console.log("LLM Client (Gemini) registered.");

    console.log("Initial Tsyringe registrations complete");
    console.log("Core application services bootstrapped successfully!");

    // TODO: Decide what bootstrapApp should return now. Maybe nothing?
    // For now, returning potentially stale instances from manual creation.
    return {
        storageService: container.resolve("IStorageService"),
        binanceService: container.resolve("IBinanceService"),
        tokenMetricsClient: container.resolve("ITokenMetricsClient"), // This will now correctly resolve the singleton
        infiniteGamesClient: container.resolve("IInfiniteGamesClient"),
        suggestionGenerator: container.resolve("ISuggestionGenerator"),
        signalGenerator: container.resolve("ISignalGenerator"),
        userRepository: container.resolve("IUserRepository"), 
        tradeRepository: container.resolve("ITradeRepository"),
        userService: container.resolve("IUserService"),
        tradeClosureService: container.resolve("ITradeClosureService"), // Resolve TradeClosureService
        infiniteGamesService: container.resolve("IInfiniteGamesService"), // Resolve and return the new service again
        llmClient: container.resolve("ILLMClient") // Resolve LLM Client
    };
} 