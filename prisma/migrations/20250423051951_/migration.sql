-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "api_key" TEXT NOT NULL,
    "api_secret" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "automatic_trading_enabled" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Trade" (
    "trade_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "price" REAL,
    "amount" REAL NOT NULL,
    "cost" REAL,
    "filled" REAL,
    "remaining" REAL,
    "status" TEXT,
    "fee_cost" REAL,
    "fee_currency" TEXT,
    "market_type" TEXT NOT NULL,
    "raw_order" TEXT,
    CONSTRAINT "Trade_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Trade_order_id_key" ON "Trade"("order_id");
