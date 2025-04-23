import "reflect-metadata"
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TradeClosureService } from './trade-closure.service';
import type { ITradeRepository, IUserRepository, IBinanceService } from '@/core/interfaces';
import type { FastifyBaseLogger } from 'fastify';
import type { Trade, User } from '@prisma/client';
import type { Order as CcxtOrder } from 'ccxt';
import * as ccxt from 'ccxt'; // Import ccxt errors

// Mock data types
type MockTradeRepository = Partial<Record<keyof ITradeRepository, ReturnType<typeof vi.fn>>>;
type MockUserRepository = Partial<Record<keyof IUserRepository, ReturnType<typeof vi.fn>>>;
type MockBinanceService = Partial<Record<keyof IBinanceService, ReturnType<typeof vi.fn>>>;
type MockLogger = Partial<Record<keyof FastifyBaseLogger, ReturnType<typeof vi.fn>>> & {
    child: ReturnType<typeof vi.fn>;
};

describe('TradeClosureService', () => {
    let tradeClosureService: TradeClosureService;
    let mockTradeRepository: MockTradeRepository;
    let mockUserRepository: MockUserRepository;
    let mockBinanceService: MockBinanceService;
    let mockLogger: MockLogger;
    let mockChildLogger: MockLogger; // For the child logger

    beforeEach(() => {
        // Create mocks for each dependency
        mockTradeRepository = {
            findOpenTradesBySymbolAndSide: vi.fn(),
            updateTradeClosure: vi.fn(),
        };
        mockUserRepository = {
            findById: vi.fn(),
        };
        mockBinanceService = {
            placeMarketOrder: vi.fn(),
        };

        // Mock the logger and its child method
        mockChildLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            child: vi.fn(), // Child can also have child, though unlikely needed here
        };
        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            child: vi.fn().mockReturnValue(mockChildLogger), // Ensure child() returns the mock child logger
        };

        // Instantiate the service with mocks
        tradeClosureService = new TradeClosureService(
            mockTradeRepository as ITradeRepository,
            mockUserRepository as IUserRepository,
            mockBinanceService as IBinanceService,
            mockLogger as unknown as FastifyBaseLogger // Use unknown type assertion for logger mock
        );
    });

    afterEach(() => {
        vi.restoreAllMocks(); // Reset mocks after each test
    });

    // --- Test Cases Will Go Here ---

    it('should log info and do nothing if no open trades are found', async () => {
        const symbol = 'BTC/USDC';
        const signalSide = 'buy';
        const oppositeSide = 'sell';

        // Arrange: Mock repo returning empty array
        mockTradeRepository.findOpenTradesBySymbolAndSide?.mockResolvedValue([]);

        // Act
        await tradeClosureService.processSignal(signalSide, symbol);

        // Assert
        expect(mockTradeRepository.findOpenTradesBySymbolAndSide).toHaveBeenCalledWith(symbol, oppositeSide);
        expect(mockChildLogger.info).toHaveBeenCalledWith(expect.stringContaining(`Checking for open ${oppositeSide} trades`));
        expect(mockChildLogger.info).toHaveBeenCalledWith(expect.stringContaining(`No open ${oppositeSide} trades found`));
        expect(mockUserRepository.findById).not.toHaveBeenCalled();
        expect(mockBinanceService.placeMarketOrder).not.toHaveBeenCalled();
        expect(mockTradeRepository.updateTradeClosure).not.toHaveBeenCalled();
    });

    it('should close an open SPOT trade successfully when an opposite signal arrives', async () => {
        const symbol = 'ETH/USDC';
        const signalSide = 'sell'; // Signal is sell
        const oppositeSide = 'buy'; // Looking for open buy trades
        // Cast to any to bypass strict type checking for the mock data definition
        const tradeToClose: Trade = {
            tradeId: 1, userId: 'user-123', orderId: 'order-abc', timestamp: new Date(Date.now() - 3600000),
            symbol: symbol, type: 'market', side: 'buy', // Original trade was buy
            price: 2000, amount: 0.5, cost: 1000, filled: 0.5, remaining: 0,
            status: 'closed', feeCost: 1, feeCurrency: 'USDC', marketType: 'spot',
            rawOrder: '{}', tcState: 'OPEN', // Trade is open
            closeOrderId: null, closeTimestamp: null, closePrice: null, closeCost: null, profit: null, durationMs: null,
        } as any; // Cast to any
        const mockUser: User = {
            id: 'user-123', apiKey: 'key', apiSecret: 'secret', passwordHash: 'hash',
            automaticTradingEnabled: true
        };
        const mockClosingOrder: CcxtOrder = {
            id: 'close-order-xyz', timestamp: Date.now(), symbol: symbol, side: 'sell', // Closing order is sell
            type: 'market', price: 2020, average: 2020, amount: 0.5, filled: 0.5,
            cost: 1010, // Proceeds from selling
            status: 'closed', info: {}, datetime: new Date().toISOString(), lastTradeTimestamp: Date.now(),
            fee: { cost: 1.01, currency: 'USDC' },
            // Use undefined for optional fields instead of null if type expects string | undefined
            clientOrderId: undefined,
            remaining: 0,
            trades: [],
            reduceOnly: false,
            postOnly: false,
        };

        // Arrange
        mockTradeRepository.findOpenTradesBySymbolAndSide?.mockResolvedValue([tradeToClose]);
        mockUserRepository.findById?.mockResolvedValue(mockUser);
        mockBinanceService.placeMarketOrder?.mockResolvedValue(mockClosingOrder);
        mockTradeRepository.updateTradeClosure?.mockResolvedValue({ ...tradeToClose, tcState: 'COMPLETED' }); // Mock successful update

        // Act
        await tradeClosureService.processSignal(signalSide, symbol);

        // Assert
        expect(mockTradeRepository.findOpenTradesBySymbolAndSide).toHaveBeenCalledWith(symbol, oppositeSide);
        expect(mockUserRepository.findById).toHaveBeenCalledWith(tradeToClose.userId);
        expect(mockBinanceService.placeMarketOrder).toHaveBeenCalledWith(
            mockUser.apiKey,
            mockUser.apiSecret,
            false, // useTestnet
            tradeToClose.symbol,
            'sell', // Closing side
            tradeToClose.filled, // Closing amount
            'spot', // Market type
            {} // Params (empty for spot)
        );
        expect(mockTradeRepository.updateTradeClosure).toHaveBeenCalledWith(
            tradeToClose.tradeId,
            expect.objectContaining({
                closeOrderId: mockClosingOrder.id,
                closeTimestamp: new Date(mockClosingOrder.timestamp!),
                closePrice: mockClosingOrder.average,
                closeCost: mockClosingOrder.cost,
                profit: 10, // 1010 (close proceeds) - 1000 (original cost)
                durationMs: expect.any(Number), // Check if it's a number
            })
        );
        expect(mockChildLogger.info).toHaveBeenCalledWith(expect.objectContaining({ profit: '10.0000' }), 'Calculated PnL.');
        expect(mockChildLogger.info).toHaveBeenCalledWith(expect.objectContaining({ tradeId: tradeToClose.tradeId }), 'Updated trade record to COMPLETED.');
    });

    it('should close an open FUTURES trade successfully with reduceOnly param', async () => {
        const symbol = 'BTC/USDC:USDC';
        const signalSide = 'buy'; // Signal is buy
        const oppositeSide = 'sell'; // Looking for open sell (short) trades
        // Cast to any to bypass strict type checking for the mock data definition
        const tradeToClose: Trade = {
            tradeId: 2, userId: 'user-456', orderId: 'order-def', timestamp: new Date(Date.now() - 7200000),
            symbol: symbol, type: 'market', side: 'sell', // Original trade was sell (short)
            price: 30000, amount: 0.1, cost: 3000, filled: 0.1, remaining: 0,
            status: 'closed', feeCost: 3, feeCurrency: 'USDC', marketType: 'futures',
            rawOrder: '{}', tcState: 'OPEN',
            closeOrderId: null, closeTimestamp: null, closePrice: null, closeCost: null, profit: null, durationMs: null,
        } as any; // Cast to any
         const mockUser: User = {
            id: 'user-456', apiKey: 'key2', apiSecret: 'secret2', passwordHash: 'hash2',
            automaticTradingEnabled: true
        };
        const mockClosingOrder: CcxtOrder = {
            id: 'close-order-uvw', timestamp: Date.now(), symbol: symbol, side: 'buy', // Closing order is buy
            type: 'market', price: 29800, average: 29800, amount: 0.1, filled: 0.1,
            cost: 2980, // Cost of buying back
            status: 'closed', info: {}, datetime: new Date().toISOString(), lastTradeTimestamp: Date.now(),
            fee: { cost: 2.98, currency: 'USDC' },
             // Use undefined for optional fields instead of null
             clientOrderId: undefined,
             remaining: 0,
             trades: [],
             reduceOnly: false, // Although we requested reduceOnly, the returned order might not reflect it directly
             postOnly: false,
        };

        // Arrange
        mockTradeRepository.findOpenTradesBySymbolAndSide?.mockResolvedValue([tradeToClose]);
        mockUserRepository.findById?.mockResolvedValue(mockUser);
        mockBinanceService.placeMarketOrder?.mockResolvedValue(mockClosingOrder);
        mockTradeRepository.updateTradeClosure?.mockResolvedValue({ ...tradeToClose, tcState: 'COMPLETED' });

        // Act
        await tradeClosureService.processSignal(signalSide, symbol);

        // Assert
        expect(mockTradeRepository.findOpenTradesBySymbolAndSide).toHaveBeenCalledWith(symbol, oppositeSide);
        expect(mockUserRepository.findById).toHaveBeenCalledWith(tradeToClose.userId);
        expect(mockBinanceService.placeMarketOrder).toHaveBeenCalledWith(
            mockUser.apiKey,
            mockUser.apiSecret,
            false,
            tradeToClose.symbol,
            'buy', // Closing side
            tradeToClose.filled,
            'futures',
            { reduceOnly: true } // Params for futures close
        );
         expect(mockTradeRepository.updateTradeClosure).toHaveBeenCalledWith(
            tradeToClose.tradeId,
            expect.objectContaining({
                profit: 20, // 3000 (original cost/proceeds) - 2980 (close cost)
            })
        );
        expect(mockChildLogger.info).toHaveBeenCalledWith(expect.objectContaining({ profit: '20.0000' }), 'Calculated PnL.');
    });

    it('should log error and skip closure if user is not found', async () => {
        const symbol = 'ADA/USDC';
        const signalSide = 'buy';
        // Cast to any
        const tradeToClose: Trade = { 
            tradeId: 3, userId: 'user-789', symbol: symbol, side: 'sell', filled: 100, marketType: 'spot', tcState: 'OPEN',
             timestamp: new Date(), orderId: 'o1', type:'t', price:1, amount:1, cost:1, remaining:0, status:'s', feeCost:0, feeCurrency:'', rawOrder:'', closeOrderId:null, closeTimestamp:null, closePrice:null, closeCost:null, profit:null, durationMs:null
        } as any; // Cast to any

        // Arrange
        mockTradeRepository.findOpenTradesBySymbolAndSide?.mockResolvedValue([tradeToClose]);
        mockUserRepository.findById?.mockResolvedValue(null); // User not found

        // Act
        await tradeClosureService.processSignal(signalSide, symbol);

        // Assert
        expect(mockUserRepository.findById).toHaveBeenCalledWith(tradeToClose.userId);
        expect(mockBinanceService.placeMarketOrder).not.toHaveBeenCalled();
        expect(mockTradeRepository.updateTradeClosure).not.toHaveBeenCalled();
        expect(mockChildLogger.error).toHaveBeenCalledWith(expect.objectContaining({ tradeId: tradeToClose.tradeId }), expect.stringContaining('User not found'));
    });

    it('should log error and skip closure if user is missing credentials', async () => {
        const symbol = 'SOL/USDC';
        const signalSide = 'sell';
         // Cast to any
         const tradeToClose: Trade = { 
            tradeId: 4, userId: 'user-abc', symbol: symbol, side: 'buy', filled: 5, marketType: 'spot', tcState: 'OPEN',
             timestamp: new Date(), orderId: 'o1', type:'t', price:1, amount:1, cost:1, remaining:0, status:'s', feeCost:0, feeCurrency:'', rawOrder:'', closeOrderId:null, closeTimestamp:null, closePrice:null, closeCost:null, profit:null, durationMs:null
        } as any; // Cast to any
        // Use empty strings instead of null to satisfy non-nullable string type
        const mockUser: User = { id: 'user-abc', apiKey: '', apiSecret: '', passwordHash: 'h', automaticTradingEnabled: false }; 

        // Arrange
        mockTradeRepository.findOpenTradesBySymbolAndSide?.mockResolvedValue([tradeToClose]);
        mockUserRepository.findById?.mockResolvedValue(mockUser);

        // Act
        await tradeClosureService.processSignal(signalSide, symbol);

        // Assert
        expect(mockUserRepository.findById).toHaveBeenCalledWith(tradeToClose.userId);
        expect(mockBinanceService.placeMarketOrder).not.toHaveBeenCalled();
        expect(mockTradeRepository.updateTradeClosure).not.toHaveBeenCalled();
        expect(mockChildLogger.error).toHaveBeenCalledWith(expect.objectContaining({ userId: mockUser.id }), expect.stringContaining('Missing API Key/Secret'));
    });

     it('should log error and skip closure if trade filled amount is invalid', async () => {
        const symbol = 'XRP/USDC';
        const signalSide = 'buy';
        // Cast to any
        const tradeToClose: Trade = { 
            tradeId: 5, userId: 'user-def', symbol: symbol, side: 'sell', filled: 0, marketType: 'spot', tcState: 'OPEN',
             timestamp: new Date(), orderId: 'o1', type:'t', price:1, amount:1, cost:1, remaining:0, status:'s', feeCost:0, feeCurrency:'', rawOrder:'', closeOrderId:null, closeTimestamp:null, closePrice:null, closeCost:null, profit:null, durationMs:null
        } as any; // Cast to any
        const mockUser: User = { id: 'user-def', apiKey: 'k', apiSecret: 's', passwordHash: 'h', automaticTradingEnabled: true };

        // Arrange
        mockTradeRepository.findOpenTradesBySymbolAndSide?.mockResolvedValue([tradeToClose]);
        mockUserRepository.findById?.mockResolvedValue(mockUser);

        // Act
        await tradeClosureService.processSignal(signalSide, symbol);

        // Assert
        expect(mockUserRepository.findById).toHaveBeenCalledWith(tradeToClose.userId);
        expect(mockBinanceService.placeMarketOrder).not.toHaveBeenCalled();
        expect(mockTradeRepository.updateTradeClosure).not.toHaveBeenCalled();
        expect(mockChildLogger.error).toHaveBeenCalledWith(expect.objectContaining({ tradeId: tradeToClose.tradeId, closingAmount: 0 }), expect.stringContaining('Invalid or zero filled amount'));
    });

    it('should log error and not update trade if placeMarketOrder fails', async () => {
        const symbol = 'LTC/USDC';
        const signalSide = 'sell';
        // Cast to any
        const tradeToClose: Trade = { 
            tradeId: 6, userId: 'user-ghi', symbol: symbol, side: 'buy', filled: 10, cost: 500, marketType: 'spot', tcState: 'OPEN',
             timestamp: new Date(), orderId: 'o1', type:'t', price:1, amount:1, remaining:0, status:'s', feeCost:0, feeCurrency:'', rawOrder:'', closeOrderId:null, closeTimestamp:null, closePrice:null, closeCost:null, profit:null, durationMs:null
        } as any; // Cast to any
        const mockUser: User = { id: 'user-ghi', apiKey: 'k', apiSecret: 's', passwordHash: 'h', automaticTradingEnabled: true };
        const orderError = new ccxt.InsufficientFunds('Not enough LTC to sell');

        // Arrange
        mockTradeRepository.findOpenTradesBySymbolAndSide?.mockResolvedValue([tradeToClose]);
        mockUserRepository.findById?.mockResolvedValue(mockUser);
        mockBinanceService.placeMarketOrder?.mockRejectedValue(orderError);

        // Act
        await tradeClosureService.processSignal(signalSide, symbol);

        // Assert
        expect(mockBinanceService.placeMarketOrder).toHaveBeenCalled();
        expect(mockTradeRepository.updateTradeClosure).not.toHaveBeenCalled();
        expect(mockChildLogger.error).toHaveBeenCalledWith(expect.objectContaining({ tradeId: tradeToClose.tradeId, errorMsg: orderError.message }), expect.stringContaining('Insufficient funds'));
    });

    it('should log error if findOpenTradesBySymbolAndSide fails', async () => {
        const symbol = 'MATIC/USDC';
        const signalSide = 'buy';
        const repoError = new Error('Database connection failed');

        // Arrange
        mockTradeRepository.findOpenTradesBySymbolAndSide?.mockRejectedValue(repoError);

        // Act
        await tradeClosureService.processSignal(signalSide, symbol);

        // Assert
        expect(mockTradeRepository.findOpenTradesBySymbolAndSide).toHaveBeenCalled();
        expect(mockUserRepository.findById).not.toHaveBeenCalled();
        expect(mockBinanceService.placeMarketOrder).not.toHaveBeenCalled();
        expect(mockChildLogger.error).toHaveBeenCalledWith(expect.objectContaining({ symbol: symbol, errorMsg: repoError.message }), expect.stringContaining('Error fetching open trades'));
    });

}); 