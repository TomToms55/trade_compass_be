import { TradeSuggestion, TradingAction, TokenMetricsTraderGrade, MarketInfo } from "@/core/domainTypes";
import { ITokenMetricsClient, ISuggestionGenerator } from "@/core/interfaces";
import binanceService from "@/modules/services/binance"; // Keep using concrete for now, or use IBinanceService if passed

// The top cryptocurrencies to generate suggestions for
const TARGET_SYMBOLS = ["BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "AVAX", "DOT", "LINK", "MATIC", "UNI", "AAVE", "LTC", "ATOM", "ALGO"];

export class SuggestionGenerator implements ISuggestionGenerator {
  private tokenMetricsClient: ITokenMetricsClient;
  // Store records mapping symbol to MarketInfo
  private spotMarketInfoMap: Record<string, MarketInfo>;
  private futuresMarketInfoMap: Record<string, MarketInfo>;

  // Updated constructor signature to accept MarketInfo records
  constructor(tokenMetricsClient: ITokenMetricsClient, spotMarketInfoMap: Record<string, MarketInfo>, futuresMarketInfoMap: Record<string, MarketInfo>) {
    this.tokenMetricsClient = tokenMetricsClient;
    this.spotMarketInfoMap = spotMarketInfoMap;
    this.futuresMarketInfoMap = futuresMarketInfoMap;
    console.log(
      `SuggestionGenerator initialized with info for ${Object.keys(this.spotMarketInfoMap).length} Spot & ${
        Object.keys(this.futuresMarketInfoMap).length
      } Futures pairs.`
    );
  }

  /**
   * Generate trade suggestions based on data from various APIs,
   * identifying available Binance Spot and Futures USDC markets. // Updated comment
   */
  async generateSuggestions(): Promise<TradeSuggestion[]> {
    const traderGrades = await this.tokenMetricsClient.getTraderGrades(TARGET_SYMBOLS);
    const suggestions: TradeSuggestion[] = [];
    const skippedSymbols: string[] = [];
    const seenMarkets = new Set<string>();

    for (const grade of traderGrades) {
      const baseSymbolUpper = grade.symbol_id.toUpperCase();

      if (grade.symbol.toLowerCase().includes("binance-peg")) {
        skippedSymbols.push(baseSymbolUpper);
        continue;
      }
      
      const spotMarketSymbol = `${baseSymbolUpper}/USDC`;
      const futuresMarketSymbol = `${baseSymbolUpper}/USDC:USDC`;

      // Look up MarketInfo from the maps
      const spotInfo = this.spotMarketInfoMap[spotMarketSymbol] || null;
      const futuresInfo = this.futuresMarketInfoMap[futuresMarketSymbol] || null;

      const hasSpotMarket = !!spotInfo;
      const hasFuturesMarket = !!futuresInfo;

      if (hasSpotMarket || hasFuturesMarket) {
        const { action, confidence } = this.determineActionAndConfidence(grade.ta_grade, grade.quant_grade, grade.tm_grade);

        if (action === "SELL" && !hasFuturesMarket) {
          skippedSymbols.push(baseSymbolUpper);
          continue;
        }

        // Check for duplicate markets
        if (seenMarkets.has(spotMarketSymbol)) {
          skippedSymbols.push(baseSymbolUpper);
          continue;
        }

        // Add markets to the seen set
        if (hasSpotMarket) seenMarkets.add(spotMarketSymbol);

        suggestions.push({
          symbol_id: grade.symbol_id,
          symbol: grade.symbol,
          spotMarket: hasSpotMarket ? spotMarketSymbol : null,
          futuresMarket: hasFuturesMarket ? futuresMarketSymbol : null,
          spotMarketInfo: spotInfo, // Add market info
          futuresMarketInfo: futuresInfo, // Add market info
          action,
          confidence,
          details: {
            ta_grade: grade.ta_grade,
            quant_grade: grade.quant_grade,
            tm_grade: grade.tm_grade,
          },
        });
      } else {
        skippedSymbols.push(baseSymbolUpper);
      }
    }

    console.log(`Skipped suggestions for ${skippedSymbols.length} symbols: ${skippedSymbols.join(", ")}`);
    return suggestions;
  }

  private determineActionAndConfidence(taGrade: number, quantGrade: number, tmGrade: number): { action: TradingAction; confidence: number } {
    const avg = (taGrade + quantGrade + tmGrade) / 3;

    const BUY_THRESHOLD = 59;
    const SELL_THRESHOLD = 41;

    let action: TradingAction;
    let confidence: number;

    if (avg >= BUY_THRESHOLD) {
      action = "BUY";
      // How far above BUY_THRESHOLD, normalized to a 0–1 range
      confidence = (avg - BUY_THRESHOLD) / (100 - BUY_THRESHOLD);
    } else if (avg <= SELL_THRESHOLD) {
      // Strong sell zone
      action = "SELL";
      // How far below SELL_THRESHOLD, normalized
      confidence = (SELL_THRESHOLD - avg) / SELL_THRESHOLD;
    } else {
      action = "HOLD";
      const mid = (BUY_THRESHOLD + SELL_THRESHOLD) / 2;
      const halfRange = (BUY_THRESHOLD - SELL_THRESHOLD) / 2;
      // The closer you are to mid, the higher your HOLD confidence
      confidence = 1 - Math.abs(avg - mid) / halfRange;
    }

    // Cap & round
    confidence = Math.min(Math.max(confidence, 0), 0.99);
    confidence = Math.round(confidence * 100) / 100;

    return { action, confidence };
  }
}

// Updated factory function signature
export function createSuggestionGenerator(
  tokenMetricsClient: ITokenMetricsClient,
  spotMarketInfoMap: Record<string, MarketInfo>, // Pass maps
  futuresMarketInfoMap: Record<string, MarketInfo>
): ISuggestionGenerator {
  return new SuggestionGenerator(tokenMetricsClient, spotMarketInfoMap, futuresMarketInfoMap);
}

// Note: Default export might need adjustment depending on how it's used in index.ts
// We will modify index.ts next to pass the pairs list.
// export default createSuggestionGenerator; // Commenting out for now
