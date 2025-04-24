import { EventEmitter } from 'events';
import type { MarketInfo, TradeSuggestion, TokenMetricsTraderGrade, InfiniteGamesEvent } from './domainTypes';
import type { TokenTradingSignal } from '@/infra/external/tokenMetrics'; // Correct: Import directly from source
import type { EventDetails } from '@/infra/external/infiniteGames'; // Import PredictedEvent
import type { Exchange, Market, Order } from 'ccxt'; // Import ccxt types
import type { User, Trade, Prisma, PrismaClient } from '@prisma/client'; // Import Prisma types
import type { Order as CcxtOrder } from 'ccxt'; // Import ccxt Order type for TradeData input
import type { CommunityPredictionResponse } from '@/infra/external/infiniteGames'; // Import the new response type
import type { PredictedFullEvent } from '@/modules/infinite_games/services/infiniteGames.service';

// == LLM Interface ==
export interface ILLMClient {
    /**
     * Generates content based on a prompt, typically used for summarization or other text generation tasks.
     * @param prompt The input text/prompt for the LLM.
     * @returns The generated text content.
     * @throws Error if the generation fails.
     */
    generateContent(prompt: string): Promise<string>;
}

// Moved from domainTypes.ts
export interface IStorageService {
  getSuggestions(): Promise<TradeSuggestion[]>;
  saveSuggestions(suggestions: TradeSuggestion[]): Promise<void>;
  saveInfiniteGamesData(data: PredictedFullEvent[]): Promise<void>;
  getInfiniteGamesData(): Promise<PredictedFullEvent[]>;
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
    marketType: 'spot' | 'futures',
    params?: Record<string, any>
  ): Promise<Order>;
}

export interface ITokenMetricsClient {
  getTraderGrades(symbols?: string[] | null): Promise<TokenMetricsTraderGrade[]>;
  getTradingSignals(/* parameters? */): Promise<TokenTradingSignal[]>;
}

export interface IInfiniteGamesClient {
  getEvents(limit?: number, offset?: number, order?: string): Promise<InfiniteGamesEvent[]>;
  getSingleEventDetails(eventId: string): Promise<EventDetails>;
  getCommunityPrediction(eventId: string): Promise<CommunityPredictionResponse>;
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
  email?: string;           // Optional email for update/create via upsert
  apiKey?: string;          // Optional for update
  apiSecret?: string;         // Optional for update
  passwordHash?: string;      // Optional for update
  automaticTradingEnabled?: boolean;
}

// Define a more specific type for user creation data
export interface UserCreateInput {
    id: string; // ID is required for creation (generated beforehand)
    email: string; // Add email field
    apiKey: string;
    apiSecret: string;
    passwordHash: string;
    automaticTradingEnabled?: boolean; // Optional, assuming a default exists
    // Add any other non-optional fields required by your Prisma schema
}

// Interface for updating user settings
// Ensure keys match Prisma schema fields intended for update
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
    findByEmail(email: string): Promise<User | null>; // Add findByEmail method
    // Renamed from getUserApiCredentials
    findCredentialsById(userId: string): Promise<UserCredentials | null>; 
    
    // Method for creating a new user
    create(userData: UserCreateInput): Promise<User>; 
    
    // Renamed from addOrUpdateUserDb - Consider removing if 'create' and 'update' are preferred
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
    findByUserId(userId: string, limit?: number): Promise<Trade[]>;
    // findByOrderId(orderId: string): Promise<Trade | null>; // Example future method
    // Add methods for finding open trades and updating closure
    findOpenTradesBySymbolAndSide(symbol: string, side: 'buy' | 'sell'): Promise<Trade[]>;
    updateTradeClosure(tradeId: number, closureData: { 
        closeOrderId: string; 
        closeTimestamp: Date; 
        closePrice?: number | null; 
        closeCost?: number | null; 
        profit?: number | null; 
        durationMs?: number | null; 
    }): Promise<Trade>;
}

// Optional: Interface for the Prisma Client itself, if needed for direct injection (less common)
// export type IDbClient = PrismaClient;

// == Service Interfaces (from refactored services) ==

// Interface for user registration data (needed by IAuthService)
export interface UserRegistrationData {
    email: string; // Add email
    apiKey: string;
    apiSecret: string;
    password: string;
}

// Add the new IAuthService interface
export interface IAuthService {
    registerUser(userData: UserRegistrationData): Promise<{ success: boolean, userId?: string, message?: string }>;
    // Replace verifyUserCredentials with a method accepting either identifier
    // verifyUserCredentials(userId: string, passwordAttempt: string): Promise<boolean>; // Old method
    verifyUserCredentialsWithIdentifier(
      userId: string | undefined, // Can be undefined if email is provided
      email: string | undefined, // Can be undefined if userId is provided
      passwordAttempt: string
    ): Promise<{ isValid: boolean, userId?: string }>; // Return userId on success
    // Removed issueAuthToken as JWT signing is handled in the route
    // Potentially add other auth-related methods later (e.g., refreshToken, verifyToken)
}

// Matches the public methods of the UserService class
export interface IUserService {
    // Keep user-specific methods here
    // Methods related to registration/login are now in IAuthService
    updateUserSettings(userId: string, settings: Partial<{ apiKey: string, apiSecret: string, automaticTradingEnabled: boolean }>): Promise<User | null>;
    getUserSettings(userId: string): Promise<{ apiKey: string; apiSecret: string } | null>;
}

// ... existing service interfaces (IStorageService etc.) ... 

// Interface for the new Trade Closure Service
export interface ITradeClosureService {
    /**
     * Processes an incoming trading signal to find and close 
     * any existing open trades in the opposite direction for the given symbol.
     * 
     * @param signalSide The side of the incoming signal ('buy' or 'sell').
     * @param symbol The market symbol (e.g., 'BTC/USDC').
     * @param signal The raw signal data (optional, for logging/context).
     */
    processSignal(signalSide: 'buy' | 'sell', symbol: string, signal?: TokenTradingSignal): Promise<void>;
} 