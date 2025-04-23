import { injectable, inject } from 'tsyringe';
import type { FastifyBaseLogger } from 'fastify';
import type { ITradeRepository, IUserRepository, IBinanceService, ITradeClosureService } from '@/core/interfaces';
import type { TokenTradingSignal } from '@/infra/external/tokenMetrics';
import type { Order as CcxtOrder } from 'ccxt';
import * as ccxt from 'ccxt';

@injectable()
export class TradeClosureService implements ITradeClosureService {
    private log: FastifyBaseLogger;

    constructor(
        @inject('ITradeRepository') private tradeRepository: ITradeRepository,
        @inject('IUserRepository') private userRepository: IUserRepository,
        @inject('IBinanceService') private binanceService: IBinanceService,
        @inject('Logger') log: FastifyBaseLogger 
    ) {
        this.log = log.child({ service: 'TradeClosureService' });
    }

    /**
     * Processes an incoming trading signal to find and close 
     * any existing open trades in the opposite direction for the given symbol.
     */
    async processSignal(signalSide: 'buy' | 'sell', symbol: string, signal?: TokenTradingSignal): Promise<void> {
        const oppositeSide = signalSide === 'buy' ? 'sell' : 'buy';
        this.log.info(`[${signalSide.toUpperCase()} Signal - ${symbol}] Checking for open ${oppositeSide} trades to close.`);

        try {
            const openTradesToClose = await this.tradeRepository.findOpenTradesBySymbolAndSide(symbol, oppositeSide);

            if (openTradesToClose.length === 0) {
                this.log.info(`[${signalSide.toUpperCase()} Signal - ${symbol}] No open ${oppositeSide} trades found to close.`);
                return;
            }

            this.log.info(`[${signalSide.toUpperCase()} Signal - ${symbol}] Found ${openTradesToClose.length} open ${oppositeSide} trade(s) to close.`);

            for (const tradeToClose of openTradesToClose) {
                this.log.info(`Attempting to close ${tradeToClose.side} trade ID: ${tradeToClose.tradeId} for symbol ${tradeToClose.symbol}`);

                // 1. Fetch User Credentials
                const user = await this.userRepository.findById(tradeToClose.userId);
                if (!user) {
                    this.log.error({ tradeId: tradeToClose.tradeId, userId: tradeToClose.userId }, `User not found for trade. Skipping closure.`);
                    continue;
                }
                if (!user.apiKey || !user.apiSecret) {
                     this.log.error({ userId: user.id, tradeId: tradeToClose.tradeId }, `Missing API Key/Secret for User. Skipping closure.`);
                     continue;
                }

                // 2. Determine Close Order Parameters
                const closingSide = tradeToClose.side === 'buy' ? 'sell' : 'buy';
                const closingAmount = tradeToClose.filled;
                const marketType = tradeToClose.marketType as ('spot' | 'futures');
                const params: Record<string, any> = {};
                if (marketType === 'futures') {
                    params.reduceOnly = true;
                }

                if (!closingAmount || closingAmount <= 0) {
                    this.log.error({ tradeId: tradeToClose.tradeId, closingAmount }, `Invalid or zero filled amount for trade. Skipping closure.`);
                    continue;
                }

                try {
                    // 3. Place Closing Order
                    this.log.info({ tradeId: tradeToClose.tradeId, side: closingSide, amount: closingAmount, symbol, marketType }, `Placing closing order...`);
                    const closingOrder: CcxtOrder = await this.binanceService.placeMarketOrder(
                        user.apiKey,
                        user.apiSecret,
                        false, // TODO: Configurable useTestnet
                        tradeToClose.symbol,
                        closingSide,
                        closingAmount,
                        marketType,
                        params
                    );
                    this.log.info({ tradeId: tradeToClose.tradeId, closingOrderId: closingOrder.id }, `Successfully placed closing order.`);

                    // 4. Calculate Profit & Duration
                    const closeTimestamp = closingOrder.timestamp ? new Date(closingOrder.timestamp) : new Date();
                    const durationMs = closeTimestamp.getTime() - tradeToClose.timestamp.getTime();
                    
                    let profit: number | null = null;
                    const originalCost = tradeToClose.cost;
                    const closeCost = closingOrder.cost;
                    const closePrice = closingOrder.average;

                    if (originalCost !== null && closeCost !== null) {
                        if (tradeToClose.side === 'buy') {
                            profit = closeCost - originalCost;
                        } else {
                            profit = originalCost - closeCost;
                        }
                        this.log.info({ tradeId: tradeToClose.tradeId, profit: profit?.toFixed(4) }, `Calculated PnL.`);
                    } else {
                         this.log.warn({ tradeId: tradeToClose.tradeId, originalCost, closeCost }, `Could not calculate profit due to missing cost data.`);
                    }

                    // 5. Update Trade Record
                    await this.tradeRepository.updateTradeClosure(tradeToClose.tradeId, {
                        closeOrderId: closingOrder.id,
                        closeTimestamp: closeTimestamp,
                        closePrice: closePrice,
                        closeCost: closeCost,
                        profit: profit,
                        durationMs: durationMs
                    });
                    this.log.info({ tradeId: tradeToClose.tradeId }, `Updated trade record to COMPLETED.`);

                } catch (orderError: any) {
                    const errorInfo = { 
                        tradeId: tradeToClose.tradeId, 
                        userId: user.id, 
                        symbol: tradeToClose.symbol,
                        closingAmount, 
                        errorMsg: orderError.message, 
                        errorStack: orderError.stack 
                    };
                    if (orderError instanceof ccxt.InsufficientFunds) {
                        this.log.error(errorInfo, `Insufficient funds to close trade.`);
                    } else if (orderError instanceof ccxt.InvalidOrder) {
                        this.log.error(errorInfo, `Invalid order parameters for closing trade.`);
                    } else if (orderError instanceof ccxt.AuthenticationError) {
                         this.log.error(errorInfo, `Authentication failed. Check API keys.`);
                    } else if (orderError instanceof ccxt.NetworkError || orderError instanceof ccxt.ExchangeNotAvailable) {
                         this.log.error(errorInfo, `Network or Exchange error during closure.`);
                    } else {
                        this.log.error(errorInfo, `Failed to place closing order or update trade record.`);
                    }
                }
            }

        } catch (repoError: any) {
             this.log.error({ symbol, oppositeSide, errorMsg: repoError.message, errorStack: repoError.stack }, `Error fetching open trades.`);
        }
    }
}
