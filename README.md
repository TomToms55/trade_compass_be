# 🧠 CryptoCompass Backend

A minimalist backend for the CryptoCompass app — a sleek trading assistant powered by AI predictions and market sentiment.

## Overview

This backend serves as a simple API for the CryptoCompass application. It fetches data from external sources, generates trade suggestions, and serves them via a RESTful API.

## Features

- Fetches data from:
  - 🔮 Infinite Games API (event predictions) - _Placeholder implementation for now_
  - 📊 Token Metrics API (crypto analytics)
- Generates daily trade suggestions
- Serves suggestions via a simple REST API

## 🛠️ Tech Stack

- Node.js + TypeScript
- Fastify (web framework)
- Axios (API requests)
- Dotenv (environment variables)
- File-based storage (no database required)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment variables example file and update it with your API keys:
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` with your own API keys.

### Development

Run the development server:
```bash
npm run dev
```

### Production

1. Build the TypeScript code:
   ```bash
   npm run build
   ```

2. Start the production server:
   ```bash
   npm start
   ```

## ⚙️ Daily Process

To generate new trade suggestions, run:
```bash
npm run generate
```

This will:
1. Fetch the latest data from Token Metrics and Infinite Games APIs
2. Generate a new set of trade suggestions
3. Store them for quick retrieval by the API

This script can be scheduled to run daily using a cron job or similar tool.

## 📡 API Endpoints

### `GET /`

Returns a simple status message to check if the API is running.

### `GET /suggestions`

Returns a list of trade suggestions.

#### Query Parameters

- `limit` (optional): Number of suggestions to return (default: 9)
- `offset` (optional): Number of suggestions to skip (default: 0)

#### Response Format

```json
[
  {
    "symbol": "ETH",
    "action": "BUY",
    "confidence": 0.91,
    "details": {
      "ta_grade": 80.5,
      "quant_grade": 75.2,
      "tm_grade": 55.0
    }
  },
  ...
]
```

## 📝 License

ISC 