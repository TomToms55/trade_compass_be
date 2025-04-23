export type TradingAction = 'BUY' | 'SELL' | 'HOLD';

export interface TradeSuggestionDetails {
  ta_grade: number;
  quant_grade: number;
  tm_grade: number;
}

export interface TradeSuggestion {
  symbol_id: string;
  symbol: string;
  spotMarket: string | null;
  futuresMarket: string | null;
  spotMarketInfo: MarketInfo | null;
  futuresMarketInfo: MarketInfo | null;
  action: TradingAction;
  confidence: number;
  details: TradeSuggestionDetails;
}

// Token Metrics API response types
// Based on example responses
export interface TokenMetricsTraderGradeResponse {
  TOKEN_NAME: string;
  DATE: string;
  TA_GRADE: number;
  QUANT_GRADE: number;
  TM_TRADER_GRADE: number;
}

export interface TokenMetricsTraderGrade {
  symbol: string;
  symbol_id: string;
  date: string;
  ta_grade: number;
  quant_grade: number;
  tm_grade: number;
}

// Infinite Games API response types (placeholder for future implementation)
export interface InfiniteGamesEvent {
  event_id: string;
  description: string;
  related_symbols: string[];
  probability: number;
  impact: number;
}

// Interface for market precision details
export interface MarketPrecision {
    amount: number | null; // Decimal places for amount
    price: number | null;  // Decimal places for price
    cost?: number | null; // Decimal places for cost 
}

// Interface for market limit details
export interface MarketLimits {
    amount: { min: number | null; max: number | null } | null;
    price: { min: number | null; max: number | null } | null;
    cost: { min: number | null; max: number | null } | null; // Min/max cost for orders (esp. market buys)
    market?: { min: number | null; max: number | null } | null; // Min/max quantity for market orders
}

// Combined structure for market info needed by FE
export interface MarketInfo {
    symbol: string;
    type: 'spot' | 'futures'; // Indicate market type
    precision: MarketPrecision;
    limits: MarketLimits;
    // Add other fields if needed, e.g., market.contractSize for futures
    contractSize?: number | null;
}

// StorageService interface moved to src/core/interfaces.ts
// export interface StorageService {
//   getSuggestions(): Promise<TradeSuggestion[]>;
//   saveSuggestions(suggestions: TradeSuggestion[]): Promise<void>;
// }