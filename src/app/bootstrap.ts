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
 * Initializes and wires up all core application services.
 * This acts as the Composition Root.
 */
export async function bootstrapApp(): Promise<AppServices> {
    console.log("Bootstrapping application services...");


    // Binance Service (Singleton)
    // Use the imported singleton instance
    const binanceService: IBinanceService = binanceServiceInstance;
    await binanceService.loadMarkets();
    const spotMarketInfoMap = binanceService.getUsdcSpotMarketInfo();
    const futuresMarketInfoMap = binanceService.getUsdcFuturesMarketInfo();
    console.log("Binance markets loaded.");

    // --- External Client Initialization ---
    const tokenMetricsClient: ITokenMetricsClient = createTokenMetricsClient();
    console.log("TokenMetrics client created.");
    
    const infiniteGamesClient: IInfiniteGamesClient = createInfiniteGamesClient();
    console.log("InfiniteGames client created.");

    // --- Application Service Initialization ---
    const storageService: IStorageService = createStorageService();
    console.log("Storage service created.");

    const suggestionGenerator: ISuggestionGenerator = createSuggestionGenerator(
        tokenMetricsClient,
        spotMarketInfoMap,
        futuresMarketInfoMap
    );
    console.log("Suggestion generator created.");

    const signalCheckIntervalMinutes = parseInt(process.env.SIGNAL_CHECK_INTERVAL_MINUTES || "60", 10);
    const signalGenerator: ISignalGenerator = new SignalGenerator(
        tokenMetricsClient, 
        signalCheckIntervalMinutes
    );
    console.log("Signal generator created.");

    // Instantiate missing repositories and service
    const userRepository = new UserRepository();
    const tradeRepository = new TradeRepository();
    const userService = new UserService(userRepository);

    console.log("Core application services bootstrapped successfully!");
    return {
        storageService,
        binanceService,
        tokenMetricsClient,
        infiniteGamesClient,
        suggestionGenerator, // Return the generator
        signalGenerator,
        userRepository,
        tradeRepository,
        userService,
    };
} 