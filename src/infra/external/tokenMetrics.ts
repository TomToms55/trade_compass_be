import { TokenMetricsClient as TMAxios, TraderGradeDataItem } from "tmai-api";
import * as fs from "fs/promises"; // Added import for file system operations
import * as path from "path"; // Added import for path manipulation

import {
  TokenMetricsTraderGrade,
  // TokenMetricsTraderGradeResponse // Removed as it's not directly used here
} from "@/core/domainTypes"; // Updated path
import type { ITokenMetricsClient } from '@/core/interfaces'; // Import the interface and dependent types if needed

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

export class TokenMetricsClient implements ITokenMetricsClient { // Implement the interface
  // Make the underlying SDK client optional
  private client?: TMAxios;

  // Constructor now optionally accepts the API key
  constructor(apiKey?: string) {
    // Only instantiate the real SDK client if an API key is provided
    if (apiKey) {
      // Basic check to prevent obvious invalid keys during real init
      if (apiKey === "your_api_key_here" || apiKey.length < 10) {
        // Adjust length check as needed
        console.error("Attempted to initialize real TokenMetrics SDK with invalid API key.");
        // Decide how to handle this: throw error, or leave client undefined?
        // Leaving client undefined might lead to errors later. Throwing is safer.
        throw new Error("Invalid Token Metrics API key provided for real client.");
      }
      try {
        this.client = new TMAxios(apiKey);
      } catch (sdkError) {
        console.error("Error instantiating TokenMetrics SDK (TMAxios):", sdkError);
        throw sdkError; // Re-throw to prevent proceeding with a broken client
      }
    } else {
      // If no apiKey provided, ensure client is undefined (relevant for mock scenario)
      this.client = undefined;
    }
  }

  // Original method - now needs to check if the client was initialized
  async getTraderGrades(symbols?: string[] | null): Promise<TokenMetricsTraderGrade[]> {
    // If called on a mock instance or if initialization failed, this.client will be undefined
    if (!this.client) {
      console.error(
        "getTraderGrades called, but the underlying TokenMetrics SDK client is not initialized. Ensure mocking is intended or the API key is valid."
      );
      // Return empty array or throw error depending on desired behavior for this edge case
      return [];
    }

    // Proceed with the original API call logic using the initialized client
    try {
      const options: Record<string, string | number> = {
        traderGrade: 0,
        exchange: "binance",
        limit: 1000,
        marketcap: 500000,
        volume: 20000,
        page: 0,
      };

      if (symbols && symbols.length > 0) {
        options.symbol = symbols.join(",");
      }

      // Use the validated this.client
      const response = await this.client.traderGrades.get(options);

      if (!response || !response.data) {
        console.warn("Received unexpected trader grades response from SDK:", response);
        return [];
      }

      return response.data.map((grade: TraderGradeDataItem) => ({
        symbol: grade.TOKEN_NAME,
        symbol_id: grade.TOKEN_SYMBOL,
        date: grade.DATE,
        ta_grade: grade.TA_GRADE,
        quant_grade: grade.QUANT_GRADE,
        tm_grade: grade.TM_TRADER_GRADE,
      }));
    } catch (error) {
      // Log specific SDK errors
      console.error("Error fetching trader grades using SDK:", error);
      return [];
    }
  }

  // New method to fetch trading signals
  async getTradingSignals(/* Add parameters if the API needs them, e.g., symbols? */): Promise<TokenTradingSignal[]> {
    if (!this.client) {
      console.error("getTradingSignals called, but the underlying TokenMetrics SDK client is not initialized.");
      // Depending on requirements, you might return empty array or throw
      return [];
    }

    try {
      // Assuming the SDK method exists and takes optional parameters
      // Adjust 'tradingSignals.get' and options based on the actual SDK method
      const response = await this.client.tradingSignals.get({
        exchange: "binance",
        limit: 1000,
        marketcap: 500000,
        volume: 20000,
        page: 0,
      });

      if (!response || !response.data || !Array.isArray(response.data)) {
        console.warn("Received unexpected trading signals response from SDK:", response);
        return [];
      }

      // Map the raw data to the simpler TokenTradingSignal structure
      return response.data.map((signal: TradingSignalDataItem) => ({
        symbol: signal.TOKEN_SYMBOL,
        signal: signal.TRADING_SIGNAL,
        date: signal.DATE,
        // Include other fields if needed by the SignalGenerator
      }));
    } catch (error) {
      console.error("Error fetching trading signals using SDK:", error);
      return []; // Return empty array on error
    }
  }
}

export function createTokenMetricsClient(): TokenMetricsClient {
  // Use a more general mock flag if mocking applies to multiple endpoints
  // TODO: Decide if USE_MOCK_TRADER_GRADES or a new USE_MOCK_TOKEN_METRICS flag is better
  const useMock = process.env.USE_MOCK_TRADER_GRADES === "true"; // Or process.env.USE_MOCK_TOKEN_METRICS === 'true';

  if (useMock) {
    console.log("Mocking enabled: Creating mock TokenMetricsClient.");
    const mockClient = new TokenMetricsClient(); // No API key

    // Mock getTraderGrades (keep existing implementation)
    mockClient.getTraderGrades = async (/* symbols? */): Promise<TokenMetricsTraderGrade[]> => {
      console.log("Using mock trader grades data...");
      const mockFilePath =
        process.env.NODE_ENV === "production"
          ? "/app/static_data/trader_grades_response.json"
          : path.join(process.cwd(), "static_data/trader_grades_response.json");
      console.log(`Attempting to read mock trader grades file from: ${mockFilePath}`);

      try {
        const mockDataRaw = await fs.readFile(mockFilePath, "utf-8");
        const mockResponse = JSON.parse(mockDataRaw);
        const gradesData = Array.isArray(mockResponse) ? mockResponse : mockResponse.data;

        if (!Array.isArray(gradesData)) {
          console.error("Mock trader grades data (after potential unwrapping) is not an array:", gradesData);
          return [];
        }

        // Keep the existing mapping logic for trader grades
        return gradesData.map((grade: TraderGradeDataItem) => ({
          symbol: grade.TOKEN_NAME,
          symbol_id: grade.TOKEN_SYMBOL,
          date: grade.DATE,
          ta_grade: grade.TA_GRADE,
          quant_grade: grade.QUANT_GRADE,
          tm_grade: grade.TM_TRADER_GRADE, // Assuming TM_TRADER_GRADE exists in mock
        }));
      } catch (error) {
        console.error("Error reading or parsing mock trader grades file in mock method:", error);
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          console.error(`Mock file not found at calculated path. Check if 'static_data/trader_grades_response.json' exists relative to project root.`);
        }
        return [];
      }
    };

    // --> Add Mock for getTradingSignals <--
    mockClient.getTradingSignals = async (): Promise<TokenTradingSignal[]> => {
      console.log("Using mock trading signals data...");
      // Assume a similar structure for the mock file name
      const mockFilePath =
        process.env.NODE_ENV === "production"
          ? "/app/static_data/trading_signals_response.json" // <-- NEW MOCK FILE
          : path.join(process.cwd(), "static_data/trading_signals_response.json"); // <-- NEW MOCK FILE
      console.log(`Attempting to read mock trading signals file from: ${mockFilePath}`);

      try {
        const mockDataRaw = await fs.readFile(mockFilePath, "utf-8");
        const mockResponse = JSON.parse(mockDataRaw);
        // Assuming the mock file directly contains the array of TradingSignalDataItem
        // Adjust if the actual mock data is nested (e.g., mockResponse.data)
        const signalsData = Array.isArray(mockResponse) ? mockResponse : mockResponse.data;

        if (!Array.isArray(signalsData)) {
          console.error("Mock trading signals data is not an array:", signalsData);
          return [];
        }

        // Map the raw mock data to the simpler TokenTradingSignal structure
        return signalsData.map((signal: TradingSignalDataItem) => ({
          symbol: signal.TOKEN_SYMBOL,
          signal: signal.TRADING_SIGNAL,
          date: signal.DATE,
        }));
      } catch (error) {
        console.error("Error reading or parsing mock trading signals file:", error);
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          console.error(`Mock file not found at path: ${mockFilePath}. Please create 'static_data/trading_signals_response.json' with the expected format.`);
        }
        return [];
      }
    };

    return mockClient; // Return the instance configured for mocking
  } else {
    // Real client creation logic (remains the same)
    console.log("Mocking disabled: Creating real TokenMetricsClient.");
    const apiKey = process.env.TOKEN_METRICS_API_KEY; // Don't provide default empty string here

    if (!apiKey) {
      // Stricter check: Key must exist
      console.error("TOKEN_METRICS_API_KEY environment variable is not set. Cannot create real Token Metrics client.");
      // Throw an error to prevent proceeding without a key
      throw new Error("Real Token Metrics client requested but TOKEN_METRICS_API_KEY is not set.");
    }

    // Let the constructor handle validation and SDK instantiation
    try {
      const realClient = new TokenMetricsClient(apiKey);
      console.log("Real TokenMetricsClient instantiated successfully.");
      return realClient;
    } catch (error) {
      console.error("Failed to create real TokenMetricsClient instance:", error);
      // Rethrow or handle as appropriate for your application startup
      throw error;
    }
  }
}

export default createTokenMetricsClient;
