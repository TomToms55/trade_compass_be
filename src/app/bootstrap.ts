//import "reflect-metadata"; // Must be imported first for tsyringe
import { container } from "tsyringe";

import binanceServiceInstance, { BinanceService } from '@/modules/services/binance'; // Import the instance and potentially the class
import createStorageService from '@/modules/services/storage';
import { createTokenMetricsClient } from '@/infra/external/tokenMetrics';
import { createInfiniteGamesClient } from '@/infra/external/infiniteGames';
import { createSuggestionGenerator } from '@/modules/suggestions/services/suggestionGenerator';
import { SignalGenerator } from '@/modules/services/signalGenerator';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { UserRepository } from '@/infra/db/repositories/UserRepository';
import { TradeRepository } from '@/infra/db/repositories/TradeRepository';
import { UserService } from '@/modules/services/userService';
import { AuthService } from "@/modules/auth/services/auth.service"; // Import AuthService

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
    IAuthService // Import IAuthService
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
    // suggestionService: ISuggestionService; // Removed
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

    // Register Repositories
    container.register("IUserRepository", UserRepository);
    container.register("ITradeRepository", TradeRepository);

    // Register UserService
    container.register("IUserService", UserService);

    // Register Singleton Binance Service
    const binanceService: IBinanceService = binanceServiceInstance;
    await binanceService.loadMarkets(); // Perform async setup before registering instance
    container.registerInstance<IBinanceService>("IBinanceService", binanceService);
    console.log("Binance Service registered & markets loaded.");

    // Register External Clients using Factories
    container.register<ITokenMetricsClient>("ITokenMetricsClient", {
         useFactory: (dependencyContainer) => createTokenMetricsClient()
    });
    console.log("TokenMetricsClient factory registered.");

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

    // Instantiate missing repositories and service - OLD WAY (Commented out/removed)
    // const userRepository = new UserRepository(); 
    // const tradeRepository = new TradeRepository();
    // const userService = new UserService(userRepository);

    console.log("Initial Tsyringe registrations complete. Further refactoring needed.");
    console.log("Core application services bootstrapped successfully!");

    // TODO: Decide what bootstrapApp should return now. Maybe nothing?
    // For now, returning potentially stale instances from manual creation.
    return {
        storageService: container.resolve("IStorageService"),
        binanceService: container.resolve("IBinanceService"),
        tokenMetricsClient: container.resolve("ITokenMetricsClient"),
        infiniteGamesClient: container.resolve("IInfiniteGamesClient"),
        suggestionGenerator: container.resolve("ISuggestionGenerator"),
        signalGenerator: container.resolve("ISignalGenerator"),
        userRepository: container.resolve("IUserRepository"), 
        tradeRepository: container.resolve("ITradeRepository"),
        userService: container.resolve("IUserService"),
    };
} 