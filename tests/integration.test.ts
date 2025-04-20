import 'dotenv/config'; // Load .env variables
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import supertest from 'supertest';
import { FastifyInstance } from 'fastify';
import { build } from '../src/index';
import { deleteUserForTest } from '../src/services/userService'; // Import delete function

// Use credentials of the seeded user from .env
const seededUserId = process.env.SEED_USER_ID;
const seededPassword = process.env.SEED_USER_PASSWORD;
// const seededApiKey = process.env.SEED_USER_API_KEY; // We don't need these directly in the test
// const seededApiSecret = process.env.SEED_USER_API_SECRET;

describe('User Registration', () => {
    let app: FastifyInstance;
    const usersToDelete: string[] = []; // Keep track of users created in this block

    beforeAll(async () => {
        app = await build();
        await app.ready();
    });

    afterAll(async () => {
        // Cleanup any users created specifically in this block, 
        // even if tests failed midway
        console.log(`Cleaning up ${usersToDelete.length} test user(s)...`);
        for (const userId of usersToDelete) {
            await deleteUserForTest(userId);
        }
        await app.close();
    });

    it('should register a new user successfully', async () => {
        const uniqueApiKey = `test-register-key-${Date.now()}`;
        const uniqueApiSecret = `test-register-secret-${Date.now()}`;
        const testPassword = 'RegisterTestPass123!';

        const response = await supertest(app.server)
            .post('/register')
            .send({
                apiKey: uniqueApiKey,
                apiSecret: uniqueApiSecret,
                password: testPassword,
            })
            .expect(201);

        expect(response.body).toHaveProperty('message', 'User registered successfully');
        expect(response.body).toHaveProperty('userId');
        const registeredUserId = response.body.userId;
        expect(registeredUserId).toBeDefined();

        // Add user ID to the list for cleanup
        usersToDelete.push(registeredUserId);
        
        // Optional: Verify user exists in DB (requires DB access from test or another endpoint)
    });
    
    it('should fail to register a user with missing fields', async () => {
         const response = await supertest(app.server)
            .post('/register')
            .send({
                apiKey: `test-missing-pw-${Date.now()}`,
                apiSecret: 'test-secret',
                // password missing
            })
            .expect(400); // Or the specific status code your validation returns
        
        expect(response.body).toHaveProperty('error');
        // Add more specific checks based on your error response format
    });
    
    // Add more registration failure cases (e.g., short password) if desired

});

describe('API Integration Tests (using seeded user)', () => {
  let app: FastifyInstance;
  let authToken: string;
  const useTestnet = process.env.USE_BINANCE_TESTNET === 'true';
  const envSuffix = useTestnet ? '_TESTNET' : '_REAL';
  const seededUserId = process.env[`SEED_USER_ID${envSuffix}`];
  const seededPassword = process.env.SEED_USER_PASSWORD;
  const seededApiKey = process.env[`SEED_USER_API_KEY${envSuffix}`];
  const seededApiSecret = process.env[`SEED_USER_API_SECRET${envSuffix}`];

  beforeAll(async () => {
    // Basic check for required env variables for the test
    if (!seededUserId || !seededPassword) {
        throw new Error(`Missing SEED_USER_ID${envSuffix} or SEED_USER_PASSWORD in .env for testing`);
    }
    // Ensure API keys are set if real API calls are intended
    if (!seededApiKey || !seededApiSecret) {
         console.warn(`SEED_USER_API_KEY${envSuffix} or SEED_USER_API_SECRET${envSuffix} not set in .env. Authenticated Binance calls might fail.`);
    }

    app = await build();
    await app.ready(); 
  });

  afterAll(async () => {
    await app.close();
  });

  // Optional: Test registration separately if needed, but not part of the main seeded user flow.
  // it('should register a NEW user', async () => { ... });

  it('should fail to login the seeded user with incorrect password', async () => {
    await supertest(app.server)
      .post('/login')
      .send({
        userId: seededUserId, // Use known seeded user ID
        password: 'wrongPassword' + Date.now(), // Ensure it's wrong
      })
      .expect(401);
  });

   it('should login the seeded user successfully', async () => {
    const loginResponse = await supertest(app.server)
      .post('/login')
      .send({
        userId: seededUserId, // Use known seeded user ID
        password: seededPassword, // Use known seeded user password
      })
      .expect(200);

    expect(loginResponse.body).toHaveProperty('message', 'Login successful');
    expect(loginResponse.body).toHaveProperty('token');
    authToken = loginResponse.body.token; // Save token for subsequent tests
    expect(authToken).toBeDefined();
    expect(typeof authToken).toBe('string');
    expect(authToken.length).toBeGreaterThan(10); // Basic check for a token-like string
  });

  // Test public endpoints (don't require auth token)
  it('should fetch suggestions publicly', async () => {
    const response = await supertest(app.server)
      .get('/suggestions')
      .expect(200);

    expect(response.body).toHaveProperty('items');
    expect(response.body).toHaveProperty('totalItems');
    expect(Array.isArray(response.body.items)).toBe(true);
  });

  // Test authenticated endpoints using the authToken from the seeded user login
  it('should fetch OHLCV data with authentication', async () => {
    expect(authToken).toBeDefined(); // Make sure login test ran successfully

    const response = await supertest(app.server)
        .post('/fetchOHLCV')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ symbol: 'BTC/USDC' }) // Use a common USDC pair
        .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    if (response.body.length > 0) {
        expect(response.body[0]).toHaveLength(6); 
        expect(typeof response.body[0][0]).toBe('number');
    }
    // Note: This might fail if Binance API is down or rate-limited during the test.
  });

  it('should fetch user balance with authentication', async () => {
    expect(authToken).toBeDefined(); 

    const response = await supertest(app.server)
        .post('/fetchBalance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

    expect(response.body).toHaveProperty('message', 'Balance fetched successfully');
    expect(response.body).toHaveProperty('usdcBalance');
    // Expect an object with spot and futures keys
    expect(response.body.usdcBalance).toBeTypeOf('object');
    expect(response.body.usdcBalance).toHaveProperty('spot');
    expect(response.body.usdcBalance).toHaveProperty('futures');
    expect(typeof response.body.usdcBalance.spot).toBe('number');
    expect(typeof response.body.usdcBalance.futures).toBe('number');
    
    console.log(`Fetched USDC Balance for ${seededUserId}: Spot=${response.body.usdcBalance.spot}, Futures=${response.body.usdcBalance.futures}`); 
  });

  // --- Place Trade Tests ---

  describe('Place Trade Endpoint', () => {
    // Note: These tests place REAL orders on Testnet/Realnet.
    // Ensure API keys have trade permissions and sufficient balance/position.
    // Use small amounts suitable for testing.
    
    const baseSymbolFutures = 'BTC'; // Assumed to have BTC/USDC:USDC
    const baseSymbolSpotOnly = 'REZ'; // Assumed to only have LTC/USDC (VERIFY THIS)
    const baseSymbolInvalid = 'NOSYMBOL'; // Assumed to have no USDC markets
    
    const futuresMarketSymbol = `${baseSymbolFutures}/USDC:USDC`;
    const spotMarketSymbolFutures = `${baseSymbolFutures}/USDC`;
    const spotMarketSymbolSpotOnly = `${baseSymbolSpotOnly}/USDC`;
    
    const testFuturesBuyAmount = 0.02; // Quantity in BTC for futures buy
    const testFuturesSellAmount = 0.02; // Quantity in BTC for futures sell
    const testSpotBuyCost = 5.5; // Cost in USDC for spot buy (e.g., for LTC)

    // Timeout might be needed for trade execution tests
    // beforeAll(() => { vitest.setTimeout(15000); });
    // afterAll(() => { vitest.setTimeout(5000); }); // Reset timeout

    it('should place a market BUY order on FUTURES market (when available)', async () => {
        expect(authToken).toBeDefined();
        console.log(`Testing FUTURES BUY for ${baseSymbolFutures}...`);

        const response = await supertest(app.server)
            .post('/placeTrade')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ symbol: baseSymbolFutures, side: 'buy', amount: testFuturesBuyAmount })
            .expect(200);

        expect(response.body.message).toEqual('Trade placed successfully');
        expect(response.body.order).toBeDefined();
        expect(response.body.order.symbol).toEqual(futuresMarketSymbol); // Verify futures market used
        expect(response.body.order.side).toEqual('buy');
        console.log(`Futures Buy Order ID: ${response.body.order.id}, Status: ${response.body.order.status}`);
    });

    it('should place a market SELL order on FUTURES market (when available)', async () => {
        expect(authToken).toBeDefined();
        console.log(`Testing FUTURES SELL for ${baseSymbolFutures}...`);

        const response = await supertest(app.server)
            .post('/placeTrade')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ symbol: baseSymbolFutures, side: 'sell', amount: testFuturesSellAmount })
            .expect(200);
        
        expect(response.body.message).toEqual('Trade placed successfully');
        expect(response.body.order).toBeDefined();
        expect(response.body.order.symbol).toEqual(futuresMarketSymbol); // Verify futures market used
        expect(response.body.order.side).toEqual('sell');
         console.log(`Futures Sell Order ID: ${response.body.order.id}, Status: ${response.body.order.status}`);
        // Note: Order might be rejected by exchange if no position exists, but API call should succeed.
    });
    
    it('should place a market BUY order on SPOT market (when only spot available)', async () => {
        expect(authToken).toBeDefined();
        console.log(`Testing SPOT BUY for ${baseSymbolSpotOnly}...`);
        
        const response = await supertest(app.server)
            .post('/placeTrade')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ symbol: baseSymbolSpotOnly, side: 'buy', amount: testSpotBuyCost })
            .expect(200);

        expect(response.body.message).toEqual('Trade placed successfully');
        expect(response.body.order).toBeDefined();
        expect(response.body.order.symbol).toEqual(spotMarketSymbolSpotOnly); // Verify spot market used
        expect(response.body.order.side).toEqual('buy');
         console.log(`Spot Buy Order ID: ${response.body.order.id}, Status: ${response.body.order.status}`);
    });

    it('should REJECT a market SELL order on SPOT market', async () => {
        expect(authToken).toBeDefined();
        console.log(`Testing SPOT SELL rejection for ${baseSymbolSpotOnly}...`);

        const response = await supertest(app.server)
            .post('/placeTrade')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ symbol: baseSymbolSpotOnly, side: 'sell', amount: 0.01 }) // Amount is base quantity for spot sell
            .expect(400);
        
        expect(response.body.error).toEqual('Trade Not Allowed');
        expect(response.body.message).toContain('Selling on the spot market'); // Check error message
    });
    
    it('should REJECT a trade for a symbol with NO valid market', async () => {
        expect(authToken).toBeDefined();
         console.log(`Testing trade rejection for invalid symbol ${baseSymbolInvalid}...`);

        const response = await supertest(app.server)
            .post('/placeTrade')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ symbol: baseSymbolInvalid, side: 'buy', amount: 10 })
            .expect(400);
        
        expect(response.body.error).toEqual('Trade Not Allowed');
        expect(response.body.message).toContain('No supported market found'); // Check error message
    });

  }); // End of Place Trade describe block

}); // End of main describe block 