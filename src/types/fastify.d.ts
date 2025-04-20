import { StorageService } from '../services/storage'; // Adjust path as needed
import { BinanceService } from '../services/binance'; // Adjust path as needed

// Use declaration merging to add properties to FastifyInstance
declare module 'fastify' {
  interface FastifyInstance {
    storageService: StorageService;
    binanceService: BinanceService;
    // Add other services you want to decorate here
  }
} 