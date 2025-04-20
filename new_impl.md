# Core NEw Features

✅ User authentication via JWT  
✅ User-specific Binance API keys stored securely  
✅ Market buy/sell trades via Binance (using ccxt package)
✅ Automatic trading pair resolution (only USDC quote supported for now)  
✅ OHLCV data fetching  
✅ Minimalist DB setup with SQLite3

# Flow
On Server Startup
ccxt.loadMarkets() is called with Binance

We define a list of suggested symbols (e.g., BTC, ETH, LUNA, etc.)

Each suggestion is mapped to a valid market pair with USDC as quote

e.g. BTC/USDC, LUNA/USDC, ADA/USDC

If no valid pair exists for a suggestion, it is removed from the list

The final list of tradable suggestions is stored in memory

On Frontend Request
Chart Data:

FE calls /fetchOHLCV

BE fetches OHLCV from ccxt (no caching, no WebSocket for now)

Trade Execution:

FE calls /placeTrade with symbol + side + amount

BE:

Uses the user’s stored API key + secret

Finds the matching symbol/USDC pair

Places a market order with ccxt.createOrder()

---

## API Endpoints

### 🔐 Authenticated (JWT in `Authorization: Bearer <token>`)

#### `POST /fetchBalance`

- Returns user's total USDC balance from Binance using ccxt

#### `POST /placeTrade`

- Place a market order
- Params:
  - `symbol` (e.g. "LUNA")
  - `side` ("BUY" or "SELL")
  - `amount` (in USDC)
- Logic:
  - Finds matching market like `LUNA/USDC` (appends USDC, they were already filtered)
  - Creates market buy/sell order via ccxt
  - Returns order info

#### `POST /fetchOHLCV`

- Params:
  - `symbol` (e.g. "LUNA/USDC")
- Returns latest OHLCV data

---

## DB (sqlite3)

Only one table:

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  api_key TEXT NOT NULL,
  api_secret TEXT NOT NULL
);
```

## JWT Payload
{
  "user_id": "user-123"
}
Must be verified and decoded on every request to match with user in DB.

## Use Cases
✅ Show user’s current USDC balance
✅ Show chart (OHLCV) data on demand
✅ Let user click "Buy LUNA" with fixed amount (e.g. 10 USDC)
✅ Handle multiple users (API keys per user)
✅ Hide all trading pair logic from frontend

## Checklist
 Set up Fastify server
 Add JWT middleware
 Create SQLite DB with users table
 On server startup: load markets and compile valid suggestions
 Implement /fetchBalance
 Implement /placeTrade (market only, USDC as quote)
 Implement /fetchOHLCV
 Add input validation + basic error handling
 Log trades and errors (console or file)



## Notes
Only Binance is supported now (ccxt instance uses Binance)
Only USDC quote is supported (e.g., "LUNA/USDC", not "LUNA/BTC")
No WebSockets or caching for now
No UI – backend only