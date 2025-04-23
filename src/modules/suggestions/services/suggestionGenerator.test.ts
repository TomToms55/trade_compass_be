import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuggestionGenerator } from './suggestionGenerator'; // Import the class under test
import type { ITokenMetricsClient } from '@/core/interfaces';
import type { MarketInfo, TradeSuggestion, TokenMetricsTraderGrade } from '@/core/domainTypes';

// Mock individual dependency functions
const mockGetTraderGrades = vi.fn();
const mockGetTradingSignals = vi.fn(); // Mock this even if unused for completeness

// Create mock object conforming to interface
const mockTokenMetricsClient: ITokenMetricsClient = {
    getTraderGrades: mockGetTraderGrades,
    getTradingSignals: mockGetTradingSignals,
};

// --- Mock Data ---
const mockBtcSpotInfo: MarketInfo = { 
    symbol: 'BTC/USDC', type: 'spot', precision: { amount: 6, price: 2 }, limits: {} 
} as any;
const mockEthFuturesInfo: MarketInfo = { 
    symbol: 'ETH/USDC:USDC', type: 'futures', precision: { amount: 4, price: 3 }, limits: {} 
} as any;
const mockSolSpotInfo: MarketInfo = { 
    symbol: 'SOL/USDC', type: 'spot', precision: { amount: 2, price: 4 }, limits: {} 
} as any;

const mockSpotMap: Record<string, MarketInfo> = {
    'BTC/USDC': mockBtcSpotInfo,
    'SOL/USDC': mockSolSpotInfo,
};
const mockFuturesMap: Record<string, MarketInfo> = {
    'ETH/USDC:USDC': mockEthFuturesInfo,
};

// Sample trader grades from mock client
const mockGrades: TokenMetricsTraderGrade[] = [
    // Strong Buy (BTC)
    { symbol: 'Bitcoin', symbol_id: 'BTC', date: 'd', ta_grade: 80, quant_grade: 70, tm_grade: 90 }, // Avg 80
    // Strong Sell (ETH)
    { symbol: 'Ethereum', symbol_id: 'ETH', date: 'd', ta_grade: 20, quant_grade: 30, tm_grade: 10 }, // Avg 20
    // Hold (SOL)
    { symbol: 'Solana', symbol_id: 'SOL', date: 'd', ta_grade: 50, quant_grade: 50, tm_grade: 50 }, // Avg 50
    // Buy (LINK - but no market info provided in maps)
    { symbol: 'Chainlink', symbol_id: 'LINK', date: 'd', ta_grade: 70, quant_grade: 70, tm_grade: 70 }, // Avg 70
    // Sell (ADA - spot market only, should be skipped)
    { symbol: 'Cardano', symbol_id: 'ADA', date: 'd', ta_grade: 30, quant_grade: 30, tm_grade: 30 }, // Avg 30
];

// --- Test Suite ---
describe('SuggestionGenerator', () => {
    let generator: SuggestionGenerator;

    beforeEach(() => {
        vi.clearAllMocks();
        generator = new SuggestionGenerator(mockTokenMetricsClient, mockSpotMap, mockFuturesMap);
        // Setup default mock return value using the specific mock function variable
        mockGetTraderGrades.mockResolvedValue(mockGrades);
    });

    it('should generate suggestions based on trader grades and market info', async () => {
        const suggestions = await generator.generateSuggestions();
        expect(mockGetTraderGrades).toHaveBeenCalledTimes(1);
        // Expected: BTC (Buy), ETH (Sell), SOL (Hold)
        // LINK skipped (no market), ADA skipped (Sell w/o futures)
        expect(suggestions).toHaveLength(3); 
    });

    it('should correctly format a BUY suggestion with only spot market', async () => {
        const btcGrade: TokenMetricsTraderGrade = { symbol: 'Bitcoin', symbol_id: 'BTC', date: 'd', ta_grade: 80, quant_grade: 70, tm_grade: 90 }; // Avg 80 => BUY
        mockGetTraderGrades.mockResolvedValue([btcGrade]);
        // Only provide spot map for BTC
        generator = new SuggestionGenerator(mockTokenMetricsClient, { 'BTC/USDC': mockBtcSpotInfo }, {});

        const suggestions = await generator.generateSuggestions();

        expect(suggestions).toHaveLength(1);
        const btcSuggestion = suggestions[0];
        expect(btcSuggestion.symbol_id).toBe('BTC');
        expect(btcSuggestion.action).toBe('BUY');
        expect(btcSuggestion.spotMarket).toBe('BTC/USDC');
        expect(btcSuggestion.futuresMarket).toBeNull();
        expect(btcSuggestion.spotMarketInfo).toEqual(mockBtcSpotInfo);
        expect(btcSuggestion.futuresMarketInfo).toBeNull();
        expect(btcSuggestion.confidence).toBeCloseTo((80 - 59) / (100 - 59)); // Check confidence calculation
        expect(btcSuggestion.details).toEqual({ ta_grade: 80, quant_grade: 70, tm_grade: 90 });
    });

    it('should correctly format a SELL suggestion with only futures market', async () => {
        const ethGrade: TokenMetricsTraderGrade = { symbol: 'Ethereum', symbol_id: 'ETH', date: 'd', ta_grade: 20, quant_grade: 30, tm_grade: 10 }; // Avg 20 => SELL
        mockGetTraderGrades.mockResolvedValue([ethGrade]);
        generator = new SuggestionGenerator(mockTokenMetricsClient, {}, { 'ETH/USDC:USDC': mockEthFuturesInfo });

        const suggestions = await generator.generateSuggestions();

        expect(suggestions).toHaveLength(1);
        const ethSuggestion = suggestions[0];
        expect(ethSuggestion.symbol_id).toBe('ETH');
        expect(ethSuggestion.action).toBe('SELL');
        expect(ethSuggestion.spotMarket).toBeNull();
        expect(ethSuggestion.futuresMarket).toBe('ETH/USDC:USDC');
        expect(ethSuggestion.spotMarketInfo).toBeNull();
        expect(ethSuggestion.futuresMarketInfo).toEqual(mockEthFuturesInfo);
        expect(ethSuggestion.confidence).toBeCloseTo((41 - 20) / 41); // Check confidence calculation
        expect(ethSuggestion.details).toEqual({ ta_grade: 20, quant_grade: 30, tm_grade: 10 });
    });

     it('should correctly format a HOLD suggestion', async () => {
        const solGrade: TokenMetricsTraderGrade = { symbol: 'Solana', symbol_id: 'SOL', date: 'd', ta_grade: 50, quant_grade: 50, tm_grade: 50 }; // Avg 50 => HOLD
        mockGetTraderGrades.mockResolvedValue([solGrade]);
        generator = new SuggestionGenerator(mockTokenMetricsClient, { 'SOL/USDC': mockSolSpotInfo }, {});

        const suggestions = await generator.generateSuggestions();
        expect(suggestions).toHaveLength(1);
        const solSuggestion = suggestions[0];
        expect(solSuggestion.action).toBe('HOLD');
        expect(solSuggestion.spotMarket).toBe('SOL/USDC');
        expect(solSuggestion.futuresMarket).toBeNull();
        // Confidence calc: 1 - abs(50 - 50) / 9 = 1, but capped at 0.99
        expect(solSuggestion.confidence).toBeCloseTo(0.99); // Adjusted expectation
    });

    it('should skip suggestions for symbols with no available market info', async () => {
        const linkGrade: TokenMetricsTraderGrade = { symbol: 'Chainlink', symbol_id: 'LINK', date: 'd', ta_grade: 70, quant_grade: 70, tm_grade: 70 }; // Avg 70 => BUY
        mockGetTraderGrades.mockResolvedValue([linkGrade]);
        // Provide no market info for LINK
        generator = new SuggestionGenerator(mockTokenMetricsClient, {}, {}); 

        const suggestions = await generator.generateSuggestions();
        expect(suggestions).toHaveLength(0);
    });

    it('should skip SELL suggestions if only spot market exists', async () => {
        const adaGrade: TokenMetricsTraderGrade = { symbol: 'Cardano', symbol_id: 'ADA', date: 'd', ta_grade: 30, quant_grade: 30, tm_grade: 30 }; // Avg 30 => SELL
        mockGetTraderGrades.mockResolvedValue([adaGrade]);
        const adaSpotInfo: MarketInfo = { symbol: 'ADA/USDC', type: 'spot' } as any;
        // Provide only spot market info for ADA
        generator = new SuggestionGenerator(mockTokenMetricsClient, { 'ADA/USDC': adaSpotInfo }, {}); 

        const suggestions = await generator.generateSuggestions();
        expect(suggestions).toHaveLength(0);
    });

    it('should return empty array if trader grades are empty', async () => {
        mockGetTraderGrades.mockResolvedValue([]);
        const suggestions = await generator.generateSuggestions();
        expect(suggestions).toEqual([]);
    });
}); 