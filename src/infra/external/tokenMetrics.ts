import { TokenMetricsClient as TMAxios, TraderGradeDataItem } from "tmai-api";
import * as fs from "fs/promises"; // Added import for file system operations
import * as path from "path"; // Added import for path manipulation

import {
  TokenMetricsTraderGrade,
  // TokenMetricsTraderGradeResponse // Removed as it's not directly used here
} from "@/core/domainTypes"; // Updated path
import type { ITokenMetricsClient } from '@/core/interfaces'; // Import the interface and dependent types if needed
import { singleton } from "tsyringe";

let MAX_PAGES = 2;

// Define the structure for the trading signal response item
export interface TradingSignalDataItem {
  TOKEN_ID: number;
  TOKEN_NAME: string;
  TOKEN_SYMBOL: string;
  DATE: string; // Consider parsing to Date object if needed elsewhere
  TRADING_SIGNAL: number; // -1 (Sell), 0 (Hold), 1 (Buy)
  TOKEN_TREND: number;
  TRADING_SIGNALS_RETURNS?: number; // Optional based on example
  HOLDING_RETURNS?: number; // Optional based on example
  tm_link?: string; // Optional based on example
  TM_TRADER_GRADE?: number; // Optional based on example
  TM_INVESTOR_GRADE?: number; // Optional based on example
  TM_LINK?: string; // Optional based on example
}

// Define a simpler structure for what the SignalGenerator might need
export interface TokenTradingSignal {
  symbol: string;
  signal: number; // -1, 0, or 1
  date: string;
}

@singleton()
export class TokenMetricsClient implements ITokenMetricsClient { // Implement the interface
  private client?: TMAxios;
  private isMockInstance: boolean = false; // Track if we are using mock data

  constructor() {
    // Use a more general mock flag if mocking applies to multiple endpoints
    const useMock = process.env.USE_MOCK_TRADER_GRADES === "true"; // Or process.env.USE_MOCK_TOKEN_METRICS === 'true';
    const apiKey = process.env.TOKEN_METRICS_API_KEY;

    if (useMock) {
      console.log("Mocking enabled: TokenMetricsClient created as mock.");
      this.isMockInstance = true;
      // No real client initialized for mock instance
    } else {
      console.log("Mocking disabled: Creating real TokenMetricsClient instance.");
      if (!apiKey) {
        console.error("TOKEN_METRICS_API_KEY environment variable is not set. Cannot create real Token Metrics client.");
        throw new Error("Real Token Metrics client requested but TOKEN_METRICS_API_KEY is not set.");
      }
      // Basic check to prevent obvious invalid keys during real init
      if (apiKey === "your_api_key_here" || apiKey.length < 10) { // Adjust length check as needed
        console.error("Attempted to initialize real TokenMetrics SDK with potentially invalid API key.");
        // Optionally throw error, or just log and continue (client will be undefined or SDK might throw)
         throw new Error("Invalid or placeholder Token Metrics API key provided.");
      }
      try {
        this.client = new TMAxios(apiKey);
        console.log("Real TokenMetrics SDK (TMAxios) instantiated successfully.");
      } catch (sdkError) {
        console.error("Error instantiating TokenMetrics SDK (TMAxios):", sdkError);
        throw sdkError; // Re-throw to prevent proceeding with a broken client
      }
    }
  }

  // --- Mock Data Loading Logic (extracted for reuse) ---
  private async loadMockData<T>(fileName: string, dataKey?: string): Promise<T[]> {
    const mockFilePath =
      process.env.NODE_ENV === "production"
        ? `/app/static_data/${fileName}` // Use absolute path in production container
        : path.join(process.cwd(), `static_data/${fileName}`); // Use relative path for local dev
    console.log(`Attempting to read mock file from: ${mockFilePath}`);

    try {
      const mockDataRaw = await fs.readFile(mockFilePath, "utf-8");
      const mockResponse = JSON.parse(mockDataRaw);
      // If a dataKey is provided (like 'data'), use it, otherwise assume the root is the array
      const data = dataKey ? mockResponse[dataKey] : mockResponse;

      if (!Array.isArray(data)) {
        console.error(`Mock data in ${fileName} (key: ${dataKey || 'root'}) is not an array:`, data);
        return [];
      }
      return data as T[]; // Cast to expected type
    } catch (error) {
      console.error(`Error reading or parsing mock file ${fileName}:`, error);
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        console.error(`Mock file not found at calculated path. Check if 'static_data/${fileName}' exists relative to project root or at '/app/static_data/' in production.`);
      }
      return [];
    }
  }

  async getTraderGrades(symbols?: string[] | null): Promise<TokenMetricsTraderGrade[]> {
    if (this.isMockInstance) {
      console.log("Using mock trader grades data (getTraderGrades)...");
      // Assuming mock file structure might contain a 'data' key or be a direct array
      const gradesData = await this.loadMockData<TraderGradeDataItem>("trader_grades_response.json"); // Try without dataKey first
      let actualGradesData: TraderGradeDataItem[];
      if (gradesData.length > 0 && !gradesData[0].TOKEN_NAME) { // Simple check if direct array didn't work, try 'data' key
         console.log("Direct array parse failed for trader grades mock, trying 'data' key...");
         actualGradesData = await this.loadMockData<TraderGradeDataItem>("trader_grades_response.json", "data");
      } else {
         actualGradesData = gradesData;
      }

      return actualGradesData.map((grade: TraderGradeDataItem) => ({
        symbol: grade.TOKEN_NAME,
        symbol_id: grade.TOKEN_SYMBOL,
        date: grade.DATE,
        ta_grade: grade.TA_GRADE,
        quant_grade: grade.QUANT_GRADE,
        tm_grade: grade.TM_TRADER_GRADE, // Assuming TM_TRADER_GRADE exists in mock
      }));
    }

    // Real client logic
    if (!this.client) {
      console.error(
        "getTraderGrades called on non-mock instance, but the underlying TokenMetrics SDK client is not initialized."
      );
      return []; // Should not happen if constructor logic is correct, but defensive check
    }

    try {
      const allGrades: TokenMetricsTraderGrade[] = [];
      let currentPage = 0;
      let keepFetching = true;
      const limit = 1000;

      console.log("Fetching real trader grades...");
      while (keepFetching) {
        const options: Record<string, string | number | undefined> = { // Allow undefined for symbol
          traderGrade: 0, // Assuming this means "get all grades", adjust if needed
          exchange: "binance",
          limit: limit,
          marketcap: 500000,
          volume: 20000,
          page: currentPage,
          // Only add the symbol parameter if symbols are provided and not empty
          symbol: symbols && symbols.length > 0 ? symbols.join(",") : undefined,
        };

        // Use the validated this.client
        const response = await this.client.traderGrades.get(options);

        if (!response || !response.data || !Array.isArray(response.data)) {
          console.warn(`Received unexpected trader grades response from SDK on page ${currentPage}:`, response);
          keepFetching = false; // Stop if response is invalid
          continue;
        }

        const fetchedData = response.data.map((grade: TraderGradeDataItem) => ({
          symbol: grade.TOKEN_NAME,
          symbol_id: grade.TOKEN_SYMBOL,
          date: grade.DATE,
          ta_grade: grade.TA_GRADE,
          quant_grade: grade.QUANT_GRADE,
          tm_grade: grade.TM_TRADER_GRADE,
        }));

        allGrades.push(...fetchedData);

        if (fetchedData.length < limit || currentPage == MAX_PAGES) {
          keepFetching = false; // Last page reached
        } else {
          ++currentPage;
        }
      }

      console.log(`Fetched a total of ${allGrades.length} real trader grades.`);
      return allGrades;

    } catch (error) {
      // Log specific SDK errors
      console.error("Error fetching real trader grades using SDK:", error);
      return [];
    }
  }

  async getTradingSignals(/* Add parameters if the API needs them, e.g., symbols? */): Promise<TokenTradingSignal[]> {
     if (this.isMockInstance) {
      console.log("Using mock trading signals data (getTradingSignals)...");
      // Assuming mock file structure might contain a 'data' key or be a direct array
      const signalsData = await this.loadMockData<TradingSignalDataItem>("trading_signals_response.json"); // Try direct first
      let actualSignalsData: TradingSignalDataItem[];
       if (signalsData.length > 0 && !signalsData[0].TOKEN_SYMBOL) { // Simple check if direct array didn't work, try 'data' key
         console.log("Direct array parse failed for trading signals mock, trying 'data' key...");
         actualSignalsData = await this.loadMockData<TradingSignalDataItem>("trading_signals_response.json", "data");
       } else {
          actualSignalsData = signalsData;
       }

      // Map the raw mock data to the simpler TokenTradingSignal structure
      return actualSignalsData.map((signal: TradingSignalDataItem) => ({
        symbol: signal.TOKEN_SYMBOL,
        signal: signal.TRADING_SIGNAL,
        date: signal.DATE,
      }));
    }

    // Real client logic
    if (!this.client) {
       console.error(
        "getTradingSignals called on non-mock instance, but the underlying TokenMetrics SDK client is not initialized."
      );
      return [];
    }

    try {
      const allSignals: TokenTradingSignal[] = [];
      let currentPage = 0;
      let keepFetching = true;
      const limit = 1000; // Assuming the limit used in options

      console.log("Fetching real trading signals...");
      while (keepFetching) {
        // Assuming the SDK method exists and takes optional parameters
        // Adjust 'tradingSignals.get' and options based on the actual SDK method
        const response = await this.client.tradingSignals.get({
          exchange: "binance",
          limit: limit,
          marketcap: 500000,
          volume: 20000,
          page: currentPage, // Add page parameter
          // Add other necessary parameters for the real API call here if needed
        });

        if (!response || !response.data || !Array.isArray(response.data)) {
          console.warn(`Received unexpected trading signals response from SDK on page ${currentPage}:`, response);
          keepFetching = false; // Stop if response is invalid
          continue;
        }

        const fetchedData = response.data.map((signal: TradingSignalDataItem) => ({
          symbol: signal.TOKEN_SYMBOL,
          signal: signal.TRADING_SIGNAL,
          date: signal.DATE,
          // Include other fields if needed by the SignalGenerator
        }));

        allSignals.push(...fetchedData);

        if(fetchedData.length < limit || currentPage == MAX_PAGES) {
          keepFetching = false; // Last page reached
        } else {
          currentPage++;
        }
      }

      console.log(`Fetched a total of ${allSignals.length} real trading signals.`);
      return allSignals;

    } catch (error) {
      console.error("Error fetching real trading signals using SDK:", error);
      return []; // Return empty array on error
    }
  }
}
