# 🧠 Compass Backend

A minimalist backend for the Compass app — a sleek trading assistant powered by AI predictions.

## 🚀 Purpose

- Fetch data from:
  - 🔮 Infinite Games API (event predictions)
  - 📊 Token Metrics API (crypto analytics) 
- Generate daily trade suggestions
- Serve them to the frontend via one simple endpoint

## ⚙️ Stack

- Node.js + TypeScript
- Fastify (minimal web framework)
- Axios (API requests)
- Dotenv (env vars)
- Simple local fast database

## 📡 Endpoint

### `GET /suggestions`

Returns 9 pre-generated suggestions:
```ts
[
  {
    symbol: "ETH",
    action: "BUY",
    confidence: 0.91,
    details: {
        ta_grade: 80.5,
        quant_grade: 75.2,
        tm_grade: 55.0
     }
  },
  ...
]
```

## ⏰ Daily Process
Fetch and store new data
Generate suggestion pool
Serve suggestions instantly with pagination and randomly

## 🧪 Frontend
Mobile/web app fetches /suggestions on load
Displays 3 at a time (client-side pagination)

## Token Metrics API 
https://github.com/token-metrics/tmai-api/tree/master/js
We use the traderGrades endpoint using the official JavaScript SDK 

## Infinite Games API
We will implement this later. They don't have an sdk. Will be axios that will return array of many events with their probability of occurring.  