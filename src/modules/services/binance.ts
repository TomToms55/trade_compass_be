import * as ccxt from 'ccxt';
import { MarketInfo, MarketLimits, MarketPrecision } from '@/core/domainTypes'; // Updated path
import type { IBinanceService } from '@/core/interfaces'; // Import the interface
import type { Exchange, Market, Order } from 'ccxt'; // Ensure CCXT types are imported if needed by interface methods

// Helper function to safely get min/max number values
const safeMinMax = (limit: any): { min: number | null; max: number | null } | null => {
    if (!limit) return null;
    return {
        min: typeof limit.min === 'number' ? limit.min : null,
        max: typeof limit.max === 'number' ? limit.max : null,
    };
};

// Export the class type for use in declarations
export class BinanceService implements IBinanceService { // Implement the interface
    private exchange: ccxt.Exchange;
    private markets: { [symbol: string]: ccxt.Market } = {};
    // Store MarketInfo objects instead of just symbols
    private usdcSpotMarketInfo: Record<string, MarketInfo> = {};    
    private usdcFuturesMarketInfo: Record<string, MarketInfo> = {}; 

    constructor() {
        // Initialize the Binance exchange instance
        // Note: No API keys needed for public data like markets
        this.exchange = new ccxt.binance({
             // We might add options later if needed, e.g., rate limits
        });
        console.log('Binance CCXT instance initialized.');
    }

    // Load markets from Binance
    async loadMarkets(): Promise<void> {
        try {
            this.markets = await this.exchange.loadMarkets();
            console.log(`Loaded ${Object.keys(this.markets).length} markets from Binance.`);
            
            this.usdcSpotMarketInfo = {};    // Reset records on reload
            this.usdcFuturesMarketInfo = {}; // Reset records on reload

            for (const symbol in this.markets) {
                const market = this.markets[symbol];
                if (market && market.active) {
                    
                    // Extract common info safely
                    const precision: MarketPrecision = {
                        amount: market.precision?.amount ?? null,
                        price: market.precision?.price ?? null,
                        cost: market.precision?.cost ?? null,
                    };
                    const limits: MarketLimits = {
                        amount: safeMinMax(market.limits?.amount),
                        price: safeMinMax(market.limits?.price),
                        cost: safeMinMax(market.limits?.cost),
                        market: safeMinMax(market.limits?.market),
                    };

                    // Check for Spot USDC pairs
                    if (market.spot && market.quote === 'USDC' && symbol.endsWith('/USDC')) {
                         this.usdcSpotMarketInfo[symbol] = {
                             symbol: symbol,
                             type: 'spot',
                             precision: precision,
                             limits: limits,
                             contractSize: market.contractSize ?? null,
                         };
                    }
                    // Check for Linear Perpetual Futures USDC pairs
                    if (market.type === 'swap' && market.linear && market.quote === 'USDC' && symbol.endsWith('/USDC:USDC')) {
                         this.usdcFuturesMarketInfo[symbol] = {
                             symbol: symbol,
                             type: 'futures',
                             precision: precision,
                             limits: limits,
                             contractSize: market.contractSize ?? null,
                         };
                    }
                }
            }

            console.log(`Found ${Object.keys(this.usdcSpotMarketInfo).length} active USDC Spot pairs with info.`);
            console.log(`Found ${Object.keys(this.usdcFuturesMarketInfo).length} active USDC Linear Perpetual Futures pairs with info.`);

        } catch (error: any) {
            console.error('Error loading Binance markets:', error.message);
            throw new Error('Failed to load Binance markets'); 
        }
    }

    // Get the loaded markets object
    getMarkets(): { [symbol: string]: ccxt.Market } {
        return this.markets;
    }

    getUsdcSpotMarketInfo(): Record<string, MarketInfo> {
        return { ...this.usdcSpotMarketInfo }; // Return a copy
    }
    
    getUsdcFuturesMarketInfo(): Record<string, MarketInfo> {
        return { ...this.usdcFuturesMarketInfo }; // Return a copy
    }

    // Check if a specific USDC Spot pair symbol is valid and active - Renamed
    isValidUsdcSpotPair(symbol: string): boolean {
        return symbol in this.usdcSpotMarketInfo;
    }

    // Check if a specific USDC Futures pair symbol is valid and active - Added
    isValidUsdcFuturesPair(symbol: string): boolean {
        return symbol in this.usdcFuturesMarketInfo;
    }

    getMarketInfo(symbol: string): MarketInfo | null {
        return this.usdcSpotMarketInfo[symbol] || this.usdcFuturesMarketInfo[symbol] || null;
    }

     // Get the CCXT exchange instance (needed for placing trades, fetching balance, etc.)
    getExchangeInstance(): ccxt.Exchange {
        return this.exchange;
    }

    /**
     * Fetches the USDC balance for a specific user using their API credentials.
     * Creates a temporary, user-specific exchange instance.
     * 
     * @param apiKey The user's Binance API key.
     * @param apiSecret The user's Binance API secret.
     * @param useTestnet Flag to indicate whether to use the Testnet.
     * @returns The user's total USDC balance.
     * @throws {ccxt.AuthenticationError} If API keys are invalid.
     * @throws {ccxt.NetworkError | ccxt.ExchangeError} If there's an issue communicating with Binance.
     * @throws {Error} For other unexpected errors.
     */
    async fetchUserUsdcBalance(apiKey: string, apiSecret: string, useTestnet: boolean): Promise<{ spot: number; futures: number }> {
        const envType = useTestnet ? 'Testnet' : 'Realnet';
        console.log(`Fetching Spot and Futures USDC balance for user (${envType})...`);
        
        const userExchange: ccxt.Exchange = new ccxt.binance({
            apiKey: apiKey,
            secret: apiSecret,
            enableRateLimit: true, // Good practice to enable rate limiting
        });

        try {
            if (useTestnet) {
                userExchange.setSandboxMode(true);
            }
            
            // Fetch Spot Balance (Default)
            console.log(`Fetching Spot balance...`);
            const spotBalance = await userExchange.fetchBalance();
            const spotUsdcTotalRaw = spotBalance.total && 'USDC' in spotBalance.total ? spotBalance.total.USDC : 0;
            const spotUsdcBalance = typeof spotUsdcTotalRaw === 'number' ? spotUsdcTotalRaw : 0;
            console.log(`Spot USDC Balance: ${spotUsdcBalance}`);

            // Fetch Futures Balance (USDC-M)
            // Use type: 'future' or 'swap' based on CCXT convention for Binance USDC-M
            let futuresUsdcBalance = 0;
            try {
                console.log(`Fetching Futures (USDC-M) balance...`);
                // Parameters might vary slightly based on CCXT version/exchange specifics.
                // common params: { type: 'future' }, { type: 'swap' }, { type: 'delivery' }, { options: { defaultType: 'future' } }
                const futuresBalance = await userExchange.fetchBalance({ 'type': 'future' }); 
                const futuresUsdcTotalRaw = futuresBalance.total && 'USDC' in futuresBalance.total ? futuresBalance.total.USDC : 0;
                futuresUsdcBalance = typeof futuresUsdcTotalRaw === 'number' ? futuresUsdcTotalRaw : 0;
                 console.log(`Futures USDC Balance: ${futuresUsdcBalance}`);
            } catch (futuresError: any) {
                // Log error fetching futures balance but don't fail the whole request
                // Could be due to account not having futures enabled, etc.
                console.warn(`Could not fetch Futures balance for user (${envType}): ${futuresError.message}`);
                // Optionally check for specific errors like 'Account has no futures permission'
                futuresUsdcBalance = 0; // Default to 0 if futures balance fetch fails
            }
           
            return { 
                spot: spotUsdcBalance, 
                futures: futuresUsdcBalance 
            };

        } catch (error) {
            console.error(`CCXT Error in fetchUserUsdcBalance (Spot fetch likely):`, error);
            
            // Re-throw the original CCXT error or a generic one
            // Check for specific known error types from CCXT
            if (error instanceof ccxt.AuthenticationError || 
                error instanceof ccxt.NetworkError || 
                error instanceof ccxt.ExchangeNotAvailable ||
                error instanceof ccxt.RateLimitExceeded ||
                error instanceof ccxt.ExchangeError) { // General exchange error
                throw error; 
            }
            // Throw a generic error for other issues
            throw new Error('An unexpected error occurred while fetching user balance.');
        }
    }

    /**
     * Places a market order on Binance for a specific user.
     *
     * @param apiKey User's API key.
     * @param apiSecret User's API secret.
     * @param useTestnet Flag to use Testnet.
     * @param marketSymbol The full market symbol (e.g., "BTC/USDC").
     * @param side "buy" or "sell".
     * @param amount The amount to trade. For market buys, this is the cost (quote currency, e.g., USDC). For market sells, this is the quantity (base currency, e.g., BTC).
     * @param marketType "spot" or "futures"
     * @returns The order information returned by CCXT.
     * @throws {ccxt.InsufficientFunds} If the user doesn't have enough balance.
     * @throws {ccxt.InvalidOrder} If the order parameters are invalid (e.g., amount too small).
     * @throws {ccxt.AuthenticationError | ccxt.NetworkError | ccxt.ExchangeError} For other API/network issues.
     * @throws {Error} For unexpected errors.
     */
    async placeMarketOrder(
        apiKey: string, 
        apiSecret: string, 
        useTestnet: boolean, 
        marketSymbol: string, 
        side: 'buy' | 'sell', 
        amount: number,
        marketType: 'spot' | 'futures'
    ): Promise<ccxt.Order> {
        console.log(`Placing ${side} market order for ${amount} on ${marketSymbol} (${marketType}, using ${useTestnet ? 'Testnet' : 'Realnet'})...`);

        const userExchange: ccxt.Exchange = new ccxt.binance({
            apiKey: apiKey,
            secret: apiSecret,
            enableRateLimit: true,
        });

        if (useTestnet) {
            userExchange.setSandboxMode(true);
        }

        try {
            // Validate if market exists (using the appropriate check based on type)
            const isValidMarket = marketType === 'spot' 
                ? this.isValidUsdcSpotPair(marketSymbol) 
                : this.isValidUsdcFuturesPair(marketSymbol);
            
            if (!isValidMarket) {
                 throw new ccxt.BadSymbol(`Market ${marketSymbol} (${marketType}) not found, loaded, or is inactive.`);
            }

            let order: ccxt.Order;
            
            if (marketType === 'futures') {
                 // For FUTURES, amount is always base currency quantity for market orders with createOrder
                 console.log(`Attempting FUTURES market ${side} with quantity: ${amount} ${marketSymbol.split('/')[0]}`);
                 // We might need to set position side or other params for futures depending on user settings/exchange requirements
                 // For now, assume simple market order works.
                 const params = { 
                     // Example: Add futures-specific parameters if necessary
                     // 'positionSide': 'BOTH', // or 'LONG'/'SHORT' if hedging mode is enabled
                 };
                 order = await userExchange.createOrder(marketSymbol, 'market', side, amount, undefined /* price */, params);
            } else { // marketType === 'spot'
                if (side === 'buy') {
                    // For SPOT BUY, use amount as the cost (in USDC)
                    console.log(`Attempting SPOT market buy with cost: ${amount} ${marketSymbol.split('/')[1]}`);
                    if (typeof userExchange.createMarketBuyOrderWithCost === 'function') {
                        order = await userExchange.createMarketBuyOrderWithCost(marketSymbol, amount);
                    } else {
                        console.warn(`createMarketBuyOrderWithCost not available on this exchange instance for ${marketSymbol}.`);
                        throw new ccxt.NotSupported('createMarketBuyOrderWithCost is required for cost-based spot market buys on this exchange setup.');
                    }
                } else { // side === 'sell'
                    // For SPOT SELL, use amount as the quantity (in Base currency)
                    console.log(`Attempting SPOT market sell with quantity: ${amount} ${marketSymbol.split('/')[0]}`);
                    order = await userExchange.createOrder(marketSymbol, 'market', side, amount);
                }
            }
            
            console.log(`Order placed successfully on ${marketType} market: ${order.id}`);
            return order;

        } catch (error: any) { // Catch as any temporarily
            console.error(`CCXT Error in placeMarketOrder for ${marketSymbol}:`, error);
            
            // Revert to instanceof checks
            if (error instanceof ccxt.InsufficientFunds || 
                error instanceof ccxt.InvalidOrder || 
                error instanceof ccxt.AuthenticationError ||
                error instanceof ccxt.NetworkError || 
                error instanceof ccxt.ExchangeNotAvailable ||
                error instanceof ccxt.RateLimitExceeded ||
                error instanceof ccxt.BadSymbol ||        // Added back
                error instanceof ccxt.NotSupported ||      // Added back
                error instanceof ccxt.ExchangeError) {
                throw error; // Re-throw known CCXT errors
            }
            // If it wasn't identified as a specific CCXT error, wrap it
            // It might be the generic Error we threw earlier, or something else
            throw new Error(error.message || 'An unexpected error occurred while placing the market order.');
        }
    }
}

// Singleton instance
const binanceService = new BinanceService();

export default binanceService; 