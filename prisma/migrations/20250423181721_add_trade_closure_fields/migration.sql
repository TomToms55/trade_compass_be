-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Trade" (
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
    "tc_state" TEXT NOT NULL DEFAULT 'OPEN',
    "close_order_id" TEXT,
    "close_timestamp" DATETIME,
    "close_price" REAL,
    "close_cost" REAL,
    "profit" REAL,
    "duration_ms" INTEGER,
    CONSTRAINT "Trade_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Trade" ("amount", "cost", "fee_cost", "fee_currency", "filled", "market_type", "order_id", "price", "raw_order", "remaining", "side", "status", "symbol", "timestamp", "trade_id", "type", "user_id") SELECT "amount", "cost", "fee_cost", "fee_currency", "filled", "market_type", "order_id", "price", "raw_order", "remaining", "side", "status", "symbol", "timestamp", "trade_id", "type", "user_id" FROM "Trade";
DROP TABLE "Trade";
ALTER TABLE "new_Trade" RENAME TO "Trade";
CREATE UNIQUE INDEX "Trade_order_id_key" ON "Trade"("order_id");
CREATE UNIQUE INDEX "Trade_close_order_id_key" ON "Trade"("close_order_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
