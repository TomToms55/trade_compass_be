# Making a trade using ccxt example
async function example () {
    const exchange = new ccxt.binance ({
        'apiKey': 'MY_API_KEY',
        'secret': 'MY_SECRET',
    });
    exchange.setSandboxMode (true);
    await exchange.loadMarkets ();
    exchange.verbose = true; // uncomment for debugging purposes if necessary
    const orders = await exchange.createOrders (
        [
            { 'symbol': 'LTC/USDT:USDT', 'type': 'limit', 'side': 'buy', 'amount': 10, 'price': 55 },
            { 'symbol': 'ETH/USDT:USDT', 'type': 'market', 'side': 'buy', 'amount': 0.5 },
        ]
    );
    console.log (orders);
}

# Notes
 We want to support an array of exchanges (key:exchangeString, keys:theApiKeysSecret object:ccxtExchange). The goal is to be abstracted. Eg: const ex = new ccxt[exchangeName] ({});
 We have to loadMarkets beforehand to make the exchange functions work (populate symbols).
 We have to match those symbols with our own symbol_id from the backend
 When the user clicks on the actionButton on the suggestionCard it should open a modal with a minimalist price chart, current price, slider for amount, place order button.
 Minimalist, intuitive, fast UI/UX.

# Flow
We only need 4 requests from ccxt:

At start:
loadMarkets() to start ccxt
fetchBalance({"currency": "usdt"}) later will be able to use different quote asset, now it's usdt (asset that will be used to buy)

At click of suggestionCard actionButton (buy/sell)
searchTradingPair() local search method in ccxtLoadedMarketsList for the market that has base=symbol_id and quote=usdt (eg: id: "btcusdt")
fetchOHLCV (foundMarketId, timeframe = '1h', since = undefined, limit = undefined, params = {}) to populate the chart

createOrder (foundMarketId, type='market', side='buy'|'sell', amountInBasecurrency)










