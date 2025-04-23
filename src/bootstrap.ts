import { PrismaClient } from '@prisma/client';
import { IUserRepository, ITradeRepository, IUserService } from './core/interfaces';
import prisma from './infra/db/prisma.client'; // Corrected: Default import
import { UserRepository } from './infra/db/repositories/UserRepository'; // Corrected: Named import
import { TradeRepository } from './infra/db/repositories/TradeRepository'; // Corrected: Named import
import { UserService } from './modules/services/userService'; // Corrected path based on file search


// Centralized service container type - Simplified for now
export interface AppServices {
  userRepository: IUserRepository;
  tradeRepository: ITradeRepository;
  userService: IUserService;
  prisma: PrismaClient; // Keep Prisma client instance available if needed
}

/**
 * Initializes and bootstraps core application services.
 * @returns {Promise<AppServices>} A promise resolving to the initialized services.
 */
export async function bootstrapServices(): Promise<AppServices> {
  // Initialize services - Simplified for now
  console.log('Bootstrapping application services...'); // Simple console log for now

  // const cache = new CacheService();

  // const storage = new S3StorageService(/* config */);
  // logger.info('Storage service initialized (S3).');


  // Instantiate Repositories (using the Prisma client singleton)
  const userRepository = new UserRepository();
  const tradeRepository = new TradeRepository();
  console.log('Database repositories initialized.');

  // Instantiate User Service (injecting dependencies)
  const userService = new UserService(userRepository); // Inject UserRepository
  console.log('User service initialized.');

  console.log('Service bootstrapping complete.');

  // Return all initialized services
  return {
    userRepository,
    tradeRepository,
    userService,
    prisma
  };
} 