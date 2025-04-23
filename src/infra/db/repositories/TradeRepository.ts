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
} 