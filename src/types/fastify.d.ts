// Import the INTERFACES for the decorated services using relative path
import type { 
    IStorageService, 
    IBinanceService, 
    ITokenMetricsClient, 
    ISignalGenerator,
    // Add imports for the missing repository and service interfaces
    IUserRepository,
    ITradeRepository,
    IUserService 
} from '../core/interfaces'; // Corrected relative path assuming types/ is sibling to core/

// Use declaration merging to add properties to FastifyInstance
declare module 'fastify' {
  interface FastifyInstance {
    // Use interface types and add missing ones
    storageService: IStorageService;
    binanceService: IBinanceService;
    tokenMetricsClient: ITokenMetricsClient;
    signalGenerator: ISignalGenerator;
    // Add the missing properties
    userRepository: IUserRepository;
    tradeRepository: ITradeRepository;
    userService: IUserService;
    // Add others here if decorated in server.ts
  }
} 