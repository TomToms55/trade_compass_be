import { EventEmitter } from 'events';
import type { MarketInfo, TradeSuggestion, TokenMetricsTraderGrade, InfiniteGamesEvent } from './domainTypes';
import type { TokenTradingSignal } from '@/infra/external/tokenMetrics'; // Correct: Import directly from source
import type { Exchange, Market, Order } from 'ccxt'; // Import ccxt types
import type { User, Trade, Prisma, PrismaClient } from '@prisma/client'; // Import Prisma types
import type { Order as CcxtOrder } from 'ccxt'; // Import ccxt Order type for TradeData input

// Moved from domainTypes.ts
export interface IStorageService {
  getSuggestions(): Promise<TradeSuggestion[]>;
  saveSuggestions(suggestions: TradeSuggestion[]): Promise<void>;
}

export interface IBinanceService {
  loadMarkets(): Promise<void>;
  getMarkets(): { [symbol: string]: Market };
  getUsdcSpotMarketInfo(): Record<string, MarketInfo>;
  getUsdcFuturesMarketInfo(): Record<string, MarketInfo>;
  isValidUsdcSpotPair(symbol: string): boolean;
  isValidUsdcFuturesPair(symbol: string): boolean;
  getMarketInfo(symbol: string): MarketInfo | null;
  getExchangeInstance(): Exchange;
  fetchUserUsdcBalance(apiKey: string, apiSecret: string, useTestnet: boolean): Promise<{ spot: number; futures: number }>;
  placeMarketOrder(
    apiKey: string,
    apiSecret: string,
    useTestnet: boolean,
    marketSymbol: string,
    side: 'buy' | 'sell',
    amount: number,
    marketType: 'spot' | 'futures'
  ): Promise<Order>;
}

export interface ITokenMetricsClient {
  getTraderGrades(symbols?: string[] | null): Promise<TokenMetricsTraderGrade[]>;
  getTradingSignals(/* parameters? */): Promise<TokenTradingSignal[]>;
}

export interface IInfiniteGamesClient {
  getEventPredictions(): Promise<InfiniteGamesEvent[]>;
}

export interface ISuggestionGenerator {
  generateSuggestions(): Promise<TradeSuggestion[]>;
}

// Interface for SignalGenerator events (already defined in the class file, but useful here)
export interface SignalGeneratorEvents {
  buy: (symbol: string, signal: TokenTradingSignal) => void;
  sell: (symbol: string, signal: TokenTradingSignal) => void;
  error: (error: Error) => void;
}

// Interface for the SignalGenerator class itself
export interface ISignalGenerator extends EventEmitter {
  // Redeclare inherited methods for clarity if desired, or rely on EventEmitter typing
  on<K extends keyof SignalGeneratorEvents>(event: K, listener: SignalGeneratorEvents[K]): this;
  once<K extends keyof SignalGeneratorEvents>(event: K, listener: SignalGeneratorEvents[K]): this;
  emit<K extends keyof SignalGeneratorEvents>(event: K, ...args: Parameters<SignalGeneratorEvents[K]>): boolean;

  // Custom methods
  start(): Promise<void>;
  stop(): void;
  getCurrentSignalsState(): ReadonlyMap<string, number>;
}

// Interface for the new SuggestionService
export interface ISuggestionService {
  updateAndStoreSuggestions(): Promise<void>;
  startPeriodicUpdates(intervalMs: number, runImmediately?: boolean): Promise<void>;
  stopPeriodicUpdates(): void;
}

// == Repository Interfaces ==

// Interface for data needed to create/update a user
// Based on UserSeedData and UserSettingsUpdateData from old database.ts
export interface UserDataInput {
  id: string;
  apiKey?: string;          // Optional for update
  apiSecret?: string;         // Optional for update
  passwordHash?: string;      // Optional for update
  automaticTradingEnabled?: boolean;
}

// Interface for user settings updates
export interface UserSettingsUpdateInput {
    automaticTradingEnabled?: boolean;
    apiKey?: string;
    apiSecret?: string;
    // Add other updatable settings here
}

// Interface for user credentials
export interface UserCredentials {
    apiKey: string;
    apiSecret: string;
}

export interface IUserRepository {
    // Renamed from getUserById
    findById(userId: string): Promise<User | null>; 
    // Renamed from getUserApiCredentials
    findCredentialsById(userId: string): Promise<UserCredentials | null>; 
    // Renamed from addOrUpdateUserDb
    addOrUpdate(userData: UserDataInput): Promise<User>; 
    // Renamed from updateUserSettingsDb
    updateSettings(userId: string, settings: UserSettingsUpdateInput): Promise<User | null>; 
    // Renamed from deleteUserDb
    deleteById(userId: string): Promise<User | null>; 
}

// Interface for data needed to create a trade record
// Based on TradeData from old database.ts
export interface TradeDataInput {
    userId: string;
    order: CcxtOrder; // Use CCXT order type as input
    marketType: 'spot' | 'futures';
}

export interface ITradeRepository {
    // Renamed from addTradeDb
    add(tradeData: TradeDataInput): Promise<Trade>; 
    // findByOrderId(orderId: string): Promise<Trade | null>; // Example future method
    // findByUserId(userId: string, limit?: number): Promise<Trade[]>; // Example future method
}

// Optional: Interface for the Prisma Client itself, if needed for direct injection (less common)
// export type IDbClient = PrismaClient;

// == Service Interfaces (from refactored services) ==

// Interface for user registration data (needed by IUserService)
export interface UserRegistrationData {
    apiKey: string;
    apiSecret: string;
    password: string;
}

// Matches the public methods of the UserService class
export interface IUserService {
    registerUser(data: UserRegistrationData): Promise<{ success: boolean; userId?: string; error?: string }>;
    findUserById(userId: string): Promise<User | null>;
    verifyUserCredentials(userId: string, passwordAttempt: string): Promise<boolean>;
    deleteUserForTest(userId: string): Promise<void>; // Returns void
    updateUserSettings(userId: string, settings: UserSettingsUpdateInput): Promise<{ success: boolean; error?: string }>;
}

// ... existing service interfaces (IStorageService etc.) ... 