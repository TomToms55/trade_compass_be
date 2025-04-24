import { ClobClient, ApiKeyCreds, Chain, Side, OrderType, BookParams } from "@polymarket/clob-client";
import { ethers, Contract, Wallet, BigNumber } from "ethers";

// --- CONFIG (Define constants first) ---
const RPC = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
const PK = process.env.POLYMARKET_PRIVATE_KEY || "0xYOUR_PRIVATE_KEY_HERE"; // MUST SET IN ENV
const CHAIN_ID: Chain = parseInt(process.env.POLYMARKET_CHAIN_ID || "137") as Chain;
const POLYMARKET_CLOB_API_URL = process.env.POLYMARKET_CLOB_API_URL || "https://clob.polymarket.com";
const USDC_ADDRESS = process.env.USDC_ADDRESS || (CHAIN_ID === Chain.POLYGON ? "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" : "0x..."); // Add Mumbai USDC address if needed

// Polymarket Conditional Token Framework (CTF) address (needed for ERC1155 approval)
// Mainnet: 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045 (from docs)
// Mumbai: 0x7D8610E9567d2a6C9FBf66a5A13E9Ba8bb120d43 (from docs)
const CTF_ADDRESS = CHAIN_ID === Chain.POLYGON ? "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045" : "0x7D8610E9567d2a6C9FBf66a5A13E9Ba8bb120d43";

// Polymarket Exchange contract address (USDC spender and ERC1155 operator)
// Mainnet: 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E (from docs)
// Mumbai: 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E (from docs - seems same?)
const POLYMARKET_EXCHANGE_ADDRESS = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";

// Define interfaces based on Polymarket documentation/types & examples
interface Token {
  token_id: string;
  outcome: string;
}
interface Market {
  condition_id: string;
  question_id: string;
  tokens: Token[];
  active: boolean;
  closed: boolean;
  question?: string;
  outcomes?: OutcomeData[]; // Use refined OutcomeData below
  // Add other relevant fields from official Market type if needed
  description?: string;
  category?: string;
  end_date_iso?: string;
  minimum_tick_size?: string;
  minimum_order_size?: string;
}
// Interface based on combining getMarket and getOrderBook details
interface OutcomeData {
  id: string; // Typically the tokenId
  name: string; // 'YES' or 'NO'
  tokenId: string;
  price: string; // Mid-price as string
  bestBid: number;
  bestAsk: number;
}

// Interface for the object returned by createOrder/createMarketOrder
// Based on observation, actual type might be complex/internal
interface SignedOrder {
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  feeRateBps: string;
  side: number; // Enum index likely
  signatureType: number; // Enum index likely
  signature: string;
}

// Args for client.createOrder based on examples/docs
interface CreateOrderArgs {
  tokenID: string;
  price: number;
  side: Side;
  size: number;
  feeRateBps?: string | number; // Often "0" or 0
  nonce?: number;
  expiration?: number; // Unix timestamp in seconds for GTD orders
}

// Args for client.createMarketOrder based on examples/docs
interface CreateMarketOrderArgs {
  side: Side;
  tokenID: string;
  amount: number; // $$$ for BUY, shares for SELL
  feeRateBps?: number; // Changed to number | undefined
  nonce?: number;
  // Price might be needed internally by createMarketOrder to calculate amounts,
  // but docs example shows it sometimes. Setting high/low ensures marketability.
  price?: number;
}

// Minimal ERC20 ABI
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

// Minimal ERC1155 ABI for isApprovedForAll (needed for selling conditional tokens)
const ERC1155_ABI = [
  "function isApprovedForAll(address account, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved) returns (bool)",
];
// Polymarket Conditional Token Framework (CTF) address (needed for ERC1155 approval)
// Mainnet: 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045 (from docs)
// Mumbai: 0x7D8610E9567d2a6C9FBf66a5A13E9Ba8bb120d43 (from docs)
// Moved definition up
// const CTF_ADDRESS = CHAIN_ID === Chain.POLYGON
//     ? "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045"
//     : "0x7D8610E9567d2a6C9FBf66a5A13E9Ba8bb120d43";

// Polymarket Exchange contract address (USDC spender and ERC1155 operator)
// Mainnet: 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E (from docs)
// Mumbai: 0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E (from docs - seems same?)
// Moved definition up
// const POLYMARKET_EXCHANGE_ADDRESS = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";

// --- CONFIG ---
// Moved definitions up
// const RPC = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
// const PK = process.env.POLYMARKET_PRIVATE_KEY || "0xYOUR_PRIVATE_KEY_HERE"; // MUST SET IN ENV
// const CHAIN_ID: Chain = parseInt(process.env.POLYMARKET_CHAIN_ID || "137") as Chain;
// const POLYMARKET_CLOB_API_URL = process.env.POLYMARKET_CLOB_API_URL || "https://clob.polymarket.com";
// Moved definition up
// const USDC_ADDRESS = process.env.USDC_ADDRESS || (CHAIN_ID === Chain.POLYGON ? "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" : "0x..."); // Add Mumbai USDC address if needed

export class PolymarketService {
  private client: ClobClient | null = null;
  private signer: Wallet | null = null; // ethers.Wallet is fine for v5
  private provider: ethers.providers.JsonRpcProvider | null = null; // Use v5 provider type
  private apiKeyCreds: ApiKeyCreds | null = null;
  private isInitialized = false;

  constructor() {} // Keep constructor simple

  private async initializeClient(): Promise<void> {
    if (this.isInitialized) return;

    if (!PK || PK === "0xYOUR_PRIVATE_KEY_HERE") {
      console.error("POLYMARKET_PRIVATE_KEY environment variable is not set.");
      throw new Error("Polymarket service requires POLYMARKET_PRIVATE_KEY.");
    }

    try {
      console.log("Initializing Polymarket client...");
      this.provider = new ethers.providers.JsonRpcProvider(RPC);
      this.signer = new Wallet(PK, this.provider);

      // Instantiate ClobClient correctly
      this.client = new ClobClient(
        POLYMARKET_CLOB_API_URL,
        CHAIN_ID,
        this.signer
      );

      // Handle API Key Auth (L2)
      try {
        console.log("Deriving existing API key (nonce 0)...");
        this.apiKeyCreds = await this.client.deriveApiKey(); // Default nonce is 0
        console.log("API key derived successfully.");
      } catch (deriveError: any) {
        console.warn("Failed to derive API key (may not exist), attempting to create one...");
        try {
          this.apiKeyCreds = await this.client.createApiKey(); // Default nonce is 0
          console.log("New API key created successfully.");
        } catch (createError) {
          console.error("Failed to create API key:", createError);
          throw new Error("Polymarket client failed to obtain API credentials.");
        }
      }
      // DO NOT assign client.creds - it's read-only. Methods use derived/created keys internally.

      this.isInitialized = true;
      console.log(`Polymarket client initialized for ${this.signer.address} on chain ${CHAIN_ID}.`);

      // Optional: Pre-approve spenders during init for simplicity (as per new_impl.md)
      // await this.approveUsdcSpenderIfNeeded(POLYMARKET_EXCHANGE_ADDRESS);
      // await this.approveConditionalTokenIfNeeded(POLYMARKET_EXCHANGE_ADDRESS);
    } catch (error) {
      console.error("Failed to initialize Polymarket client:", error);
      this.isInitialized = false;
      throw new Error("Polymarket client initialization failed.");
    }
  }

  private async ensureClientInitialized(): Promise<ClobClient> {
    if (!this.isInitialized || !this.client || !this.signer || !this.provider || !this.apiKeyCreds) {
      await this.initializeClient();
    }
    if (!this.client || !this.signer || !this.provider || !this.apiKeyCreds) {
      throw new Error("Client components are not available after initialization attempt.");
    }
    // DO NOT assign client.creds
    return this.client;
  }

  // --- Approval Helpers ---

  async approveUsdcSpenderIfNeeded(spenderAddress: string, amount: BigNumber = ethers.constants.MaxUint256): Promise<void> {
    await this.ensureClientInitialized();
    const usdcContract = new Contract(USDC_ADDRESS, ERC20_ABI, this.signer!);
    try {
      console.log(`Checking USDC allowance for spender ${spenderAddress}...`);
      const currentAllowance: BigNumber = await usdcContract.allowance(this.signer!.address, spenderAddress);

      if (currentAllowance.lt(amount)) {
        console.log(`Allowance (${ethers.utils.formatUnits(currentAllowance, 6)} USDC) is less than required. Approving...`);
        const approveTx = await usdcContract.approve(spenderAddress, amount);
        console.log(`Approval transaction sent: ${approveTx.hash}. Waiting for confirmation...`);
        await approveTx.wait(1);
        console.log(`Spender ${spenderAddress} approved successfully.`);
      } else {
        console.log(`Spender ${spenderAddress} already has sufficient USDC allowance.`);
      }
    } catch (error) {
      console.error(`Error approving USDC spender ${spenderAddress}:`, error);
      throw new Error("Failed to approve USDC spender.");
    }
  }

  // Approve the Exchange contract for spending conditional tokens (ERC1155)
  async approveConditionalTokenIfNeeded(operatorAddress: string): Promise<void> {
    await this.ensureClientInitialized();
    // Need the CTF contract address which holds the ERC1155 tokens
    const ctfContract = new Contract(CTF_ADDRESS, ERC1155_ABI, this.signer!);

    try {
      console.log(`Checking ERC1155 approval for operator ${operatorAddress} on CTF ${CTF_ADDRESS}...`);
      const isApproved = await ctfContract.isApprovedForAll(this.signer!.address, operatorAddress);

      if (!isApproved) {
        console.log(`Operator ${operatorAddress} is not approved. Approving...`);
        const approveTx = await ctfContract.setApprovalForAll(operatorAddress, true);
        console.log(`Approval transaction sent: ${approveTx.hash}. Waiting for confirmation...`);
        await approveTx.wait(1);
        console.log(`Operator ${operatorAddress} approved successfully for all tokens.`);
      } else {
        console.log(`Operator ${operatorAddress} already approved for all tokens.`);
      }
    } catch (error) {
      console.error(`Error approving ERC1155 operator ${operatorAddress}:`, error);
      throw new Error("Failed to approve ERC1155 operator.");
    }
  }

  // --- Public Service Methods ---

  async listOpenMarkets(limit: number = 10): Promise<{ id: string; title: string | undefined }[]> {
    const client = await this.ensureClientInitialized();
    console.log(`Fetching up to ${limit} open markets...`);
    const marketsResponse = await client.getMarkets(); // Use getMarkets
    const openMarkets = marketsResponse.data
      .filter((m: Market) => m.active && !m.closed) // Filter for active and open
      .slice(0, limit); // Apply limit
    console.log(`Fetched ${openMarkets.length} open markets.`);
    return openMarkets.map((m: Market) => ({ id: m.condition_id, title: m.question }));
  }

  async getMarketDetails(conditionId: string): Promise<(Market & { yesMidPrice: number | null }) | null> {
    const client = await this.ensureClientInitialized();
    console.log(`Fetching details for market condition ID: ${conditionId}`);
    try {
      const market: Market = await client.getMarket(conditionId); // Use getMarket
      const yesToken = market.tokens.find((t) => t.outcome === "YES");
      const noToken = market.tokens.find((t) => t.outcome === "NO");

      if (!yesToken) {
        console.warn(`Could not find 'YES' token for condition ${conditionId}`);
        // Still return market data but indicate missing price info
        return { ...market, yesMidPrice: null };
      }

      // Fetch order books for both outcomes to calculate mid-price and provide details
      const yesBook = await client.getOrderBook(yesToken.token_id); // Use getOrderBook
      // Handle case where NO token might not exist (shouldn't happen in binary market)
      const noBook = noToken ? await client.getOrderBook(noToken.token_id) : { bids: [], asks: [] };

      // Calculate prices safely, defaulting to 0/1 if book side is empty
      const yesBestBid = yesBook.bids.length > 0 ? parseFloat(yesBook.bids[0].price) : 0;
      const yesBestAsk = yesBook.asks.length > 0 ? parseFloat(yesBook.asks[0].price) : 1;
      const yesMidPrice = (yesBestBid + yesBestAsk) / 2;

      const noBestBid = noBook.bids.length > 0 ? parseFloat(noBook.bids[0].price) : 0;
      const noBestAsk = noBook.asks.length > 0 ? parseFloat(noBook.asks[0].price) : 1;
      const noMidPrice = (noBestBid + noBestAsk) / 2;

      console.log(`Calculated YES mid-price for ${conditionId}: ${yesMidPrice}`);

      // Augment market data with structured outcome details using our defined interface
      market.outcomes = [
        { name: "YES", tokenId: yesToken.token_id, bestBid: yesBestBid, bestAsk: yesBestAsk, price: yesMidPrice.toFixed(4), id: yesToken.token_id }, // Format price
        { name: "NO", tokenId: noToken?.token_id || "", bestBid: noBestBid, bestAsk: noBestAsk, price: noMidPrice.toFixed(4), id: noToken?.token_id || "" },
      ];

      return { ...market, yesMidPrice: yesMidPrice };
    } catch (error: any) {
      // Improve error handling for 404s
      if (error.response?.status === 404 || error.message?.includes("404")) {
        console.warn(`Market with condition ID ${conditionId} not found.`);
        return null;
      }
      console.error(`Error fetching market details for ${conditionId}:`, error);
      throw error; // Re-throw other errors
    }
  }

  // Use CreateMarketOrderArgs and SignedOrder interfaces
  async placeMarketOrder(conditionId: string, outcomeName: "YES" | "NO", side: Side.BUY | Side.SELL, amount: number): Promise<any> {
    // Return type might be complex, using any for now
    const client = await this.ensureClientInitialized();
    console.log(`Placing MARKET ${side} order, amount ${amount} ${side === Side.BUY ? "USDC" : "shares"} for ${outcomeName} on ${conditionId}`);

    const market = await this.getMarketDetails(conditionId);
    if (!market) throw new Error(`Market ${conditionId} not found.`);
    const targetToken = market.tokens.find((t) => t.outcome === outcomeName);
    if (!targetToken) throw new Error(`Outcome '${outcomeName}' not found in market ${conditionId}`);
    const tokenId = targetToken.token_id;

    // Ensure necessary approvals BEFORE creating/posting order
    try {
      if (side === Side.BUY) {
        // Amount is in USDC, parse with 6 decimals (assuming standard USDC)
        const usdcAmountWei = ethers.utils.parseUnits(amount.toFixed(6), 6);
        console.log(`Ensuring USDC allowance for exchange ${POLYMARKET_EXCHANGE_ADDRESS}...`);
        await this.approveUsdcSpenderIfNeeded(POLYMARKET_EXCHANGE_ADDRESS, usdcAmountWei);
      } else {
        // Side.SELL
        // Amount is in shares (conditional tokens - ERC1155)
        console.log(`Ensuring conditional token approval for exchange ${POLYMARKET_EXCHANGE_ADDRESS}...`);
        // Approve the exchange to manage tokens held by the CTF contract
        await this.approveConditionalTokenIfNeeded(POLYMARKET_EXCHANGE_ADDRESS);
      }
    } catch (approvalError) {
      console.error("Approval failed, cannot place order:", approvalError);
      throw approvalError; // Re-throw approval error
    }

    // Create and post the Market Order (FOK) using our defined interface
    const marketOrderParams: CreateMarketOrderArgs = {
      side: side,
      tokenID: tokenId,
      amount: amount,
      // Let client calculate necessary price for FOK market order implicitly
      // price: side === Side.BUY ? 1 : 0 // Setting price to max/min might be needed
    };

    try {
      console.log("Creating signed market order...", marketOrderParams);
      // Use the interface we defined for args
      // Use 'any' type for signedOrder to bypass strict type checking against internal library type
      const signedOrder: any = await client.createMarketOrder(marketOrderParams); // Use createMarketOrder

      console.log("Posting market order (FOK)...", signedOrder);
      // postOrder takes the signed order and the type
      const orderResult = await client.postOrder(signedOrder, OrderType.FOK);

      console.log("Market order post response:", orderResult);
      if (!orderResult.success && orderResult.errorMsg) {
        throw new Error(`Order placement failed: ${orderResult.errorMsg}`);
      }
      // Check for other potential statuses
      if (orderResult.status === "unmatched" || orderResult.status === "delayed") {
        console.warn(`FOK order status: ${orderResult.status}. May not have filled immediately.`);
        // Depending on requirements, might want to throw an error here or handle differently
      }

      return orderResult; // Return the full response object
    } catch (error: any) {
      console.error("Error placing market order:", error.message || error);
      // Improve API error message extraction
      if (error.response?.data) {
        console.error("API Error Data:", error.response.data);
        const apiErrorMessage =
          typeof error.response.data === "string" ? error.response.data : error.response.data.error || error.response.data.message || error.message;
        throw new Error(`Failed to place trade: ${apiErrorMessage}`);
      }
      throw new Error(`Failed to place trade: ${error.message}`);
    }
  }

  async getUsdcBalance(): Promise<string> {
    await this.ensureClientInitialized();
    if (!this.provider || !this.signer) throw new Error("Provider/Signer not initialized");

    const usdcContract = new Contract(USDC_ADDRESS, ERC20_ABI, this.provider);
    const address = this.signer.address;

    try {
      console.log(`Fetching USDC balance for address: ${address}`);
      const balanceRaw: BigNumber = await usdcContract.balanceOf(address); // Expect BigNumber
      const decimals: number = await usdcContract.decimals(); // Expect number for decimals usually
      // Use ethers v5 utils.formatUnits
      const balanceFormatted = ethers.utils.formatUnits(balanceRaw, decimals);
      console.log(`USDC balance fetched: ${balanceFormatted}`);
      return balanceFormatted;
    } catch (error) {
      console.error("Error fetching USDC balance:", error);
      throw new Error("Failed to fetch USDC balance.");
    }
  }
}

// Export a singleton instance or provide via DI container
// Exporting the class for instantiation in composition root / routes for now
