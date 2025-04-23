import prisma from '../prisma.client';
import { Prisma, Trade } from '@prisma/client';
import { injectable } from 'tsyringe';
import { ITradeRepository, TradeDataInput } from '@/core/interfaces';

@injectable()
export class TradeRepository implements ITradeRepository {

    /**
     * Adds a new trade record to the database.
     * Handles potential duplicate order IDs gracefully.
     */
    async add(tradeData: TradeDataInput): Promise<Trade> {
        const { userId, order, marketType } = tradeData;

        // Basic validation (could be expanded)
        if (!order || !order.id || !order.timestamp || !order.symbol || !order.type || !order.side || !order.amount) {
            console.error(`TradeRepository Error: Invalid or incomplete order object received for user ${userId}. Order ID: ${order?.id}`);
            // Decide how to handle - throwing an error might be better
            throw new Error('Invalid or incomplete order data provided to TradeRepository.');
        }
        
        try {
            // Use prisma.trade.create to add the record
            const newTrade = await prisma.trade.create({
                data: {
                    userId: userId,
                    orderId: order.id,
                    // Prisma expects Date object for DateTime fields
                    timestamp: new Date(order.timestamp), 
                    symbol: order.symbol,
                    type: order.type,
                    side: order.side,
                    price: order.price, // Prisma handles null
                    amount: order.amount,
                    cost: order.cost,
                    filled: order.filled,
                    remaining: order.remaining,
                    status: order.status,
                    feeCost: order.fee?.cost,
                    feeCurrency: order.fee?.currency,
                    marketType: marketType,
                    // Store the raw order object as a JSON string
                    rawOrder: JSON.stringify(order), 
                },
            });
            console.log(`Trade ${order.id} for user ${userId} added via repository.`);
            return newTrade;
        } catch (error) {
            // Handle potential UNIQUE constraint violation for orderId (P2002)
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                // Fields that caused the violation are in error.meta.target
                console.warn(`Attempted to insert duplicate trade order ID: ${order.id} for user ${userId}. Skipping insertion.`);
                // Decide what to return - returning existing might be useful, but requires another query.
                // For now, rethrow a specific error or handle as needed by the caller.
                // Let's find the existing one and return it.
                const existingTrade = await prisma.trade.findUnique({ where: { orderId: order.id } });
                if (existingTrade) return existingTrade;
                // If somehow it's null after a P2002, something is wrong
                throw new Error(`Duplicate order ID ${order.id} detected, but could not retrieve existing trade.`);
            } else {
                console.error(`Error adding trade ${order.id} for user ${userId} via repository:`, error);
                // Re-throw other errors
                throw error; 
            }
        }
    }

    // Potential future methods:
    // async findByOrderId(orderId: string): Promise<Trade | null> { ... }
    // async findByUserId(userId: string, limit: number = 50): Promise<Trade[]> { ... }
    
    /**
     * Finds open trades for a specific symbol and original side.
     */
    async findOpenTradesBySymbolAndSide(symbol: string, side: 'buy' | 'sell'): Promise<Trade[]> {
        try {
            const openTrades = await prisma.trade.findMany({
                where: {
                    symbol: symbol,
                    side: side,
                    tcState: 'OPEN',
                    // Add any other necessary conditions, e.g., ensure `filled` > 0
                    filled: {
                        gt: 0 // Only consider trades that were actually filled
                    }
                },
            });
            return openTrades;
        } catch (error) {
            console.error(`Error finding open ${side} trades for symbol ${symbol}:`, error);
            throw error; // Re-throw the error for handling upstream
        }
    }

    /**
     * Updates a trade record with closure details.
     */
    async updateTradeClosure(tradeId: number, closureData: { 
        closeOrderId: string; 
        closeTimestamp: Date; 
        closePrice?: number | null; 
        closeCost?: number | null; 
        profit?: number | null; 
        durationMs?: number | null; 
    }): Promise<Trade> {
        try {
            const updatedTrade = await prisma.trade.update({
                where: { tradeId: tradeId },
                data: {
                    tcState: 'COMPLETED',
                    closeOrderId: closureData.closeOrderId,
                    closeTimestamp: closureData.closeTimestamp,
                    closePrice: closureData.closePrice, 
                    closeCost: closureData.closeCost,
                    profit: closureData.profit,
                    durationMs: closureData.durationMs,
                },
            });
            console.log(`Trade ${tradeId} marked as COMPLETED via repository.`);
            return updatedTrade;
        } catch (error) {
             console.error(`Error updating trade ${tradeId} for closure:`, error);
            // Consider specific error handling, e.g., if trade not found (P2025)
             if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
                throw new Error(`Trade with ID ${tradeId} not found for closure update.`);
             } 
            throw error; // Re-throw other errors
        }
    }
} 