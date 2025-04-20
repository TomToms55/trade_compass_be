import 'dotenv/config';
import createTokenMetricsClient from '../api/tokenMetrics';
import createStorageService from '../services/storage';
import { createSuggestionGenerator } from '../services/suggestionGenerator';
import binanceService from '../services/binance';

/**
 * Script to generate and store suggestions
 * Can be run as a scheduled job (e.g., daily)
 */
async function main() {
  try {
    console.log('Starting suggestion generation process...');
    
    // Initialize binance and load markets
    await binanceService.loadMarkets();
    // Get MarketInfo records
    const spotMarketInfoMap = binanceService.getUsdcSpotMarketInfo();    
    const futuresMarketInfoMap = binanceService.getUsdcFuturesMarketInfo(); 
    
    // Initialize clients and services
    const tokenMetricsClient = createTokenMetricsClient();
    //const infiniteGamesClient = createInfiniteGamesClient();
    const suggestionGenerator = createSuggestionGenerator(tokenMetricsClient, spotMarketInfoMap, futuresMarketInfoMap);
    const storageService = createStorageService();
    
    // Generate suggestions
    console.log('Fetching data and generating suggestions...');
    const suggestions = await suggestionGenerator.generateSuggestions();
    
    // Store suggestions
    console.log(`Generated ${suggestions.length} suggestions. Storing them...`);
    await storageService.saveSuggestions(suggestions);
    
    console.log('Suggestion generation completed successfully!');
  } catch (error) {
    console.error('Error generating suggestions:', error);
    process.exit(1);
  }
}

// Run the script
main(); 