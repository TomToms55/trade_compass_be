# Polymarket Event Trading Implementation #

Seamlessly trade prediction‐market events on Polymarket directly from your app.
| # | Use-Case                   | Description                                             | Key Snippet (hard-coded)                                                      |
|---|----------------------------|---------------------------------------------------------|-------------------------------------------------------------------------------|
| **1** | **Init client & signer**    | Bootstrap `@polymarket/clob-client` with a hard-coded RPC & private key. | ```ts<br>import { ClobClient } from "@polymarket/clob-client";<br>import { ethers } from "ethers";<br>const RPC = "https://polygon-rpc.com";<br>const PK  = "0xYOUR_PRIVATE_KEY_HERE";<br>const provider = new ethers.providers.JsonRpcProvider(RPC);<br>const signer   = new ethers.Wallet(PK, provider);<br>const client   = new ClobClient("https://clob.polymarket.com", signer, 137);<br>await client.setApiCreds(await client.createOrDeriveApiCreds());<br>``` |
| **2** | **List markets**            | Fetch & render first 10 open markets (show IDs + titles). | ```ts<br>const { markets } = await client.fetchMarkets({ status: "OPEN", limit: 10 });<br>markets.forEach(m=> console.log(m.id, m.title));<br>``` |
| **3** | **Show specific event**      | Load outcomes & mid-price for a hard-coded eventId.      | ```ts<br>const EVENT_ID = "0xAbC123…";<br>const m = await client.fetchMarketById(EVENT_ID);<br>const yes = m.outcomes.find(o=>o.name==="YES")!;<br>const mid = (yes.bestBid + yes.bestAsk)/2;<br>console.log("YES mid-price:", mid);<br>``` |
| **4** | **Buy YES (market order)**   | One-tap buy of 1 USDC “YES” on that event.               | ```ts<br>await client.approveSpender("0x2791…4174", true);<br>await client.postMarketOrder({ tokenId: yes.tokenId, side:"BUY", size:1, type:"MARKET" });<br>console.log("Order sent");<br>``` |
| **5** | **Show USDC balance**        | Read on-chain USDC balance to confirm remaining funds.    | ```ts<br>const bal = await client.getErc20Balance("0x2791…4174", signer.address);<br>console.log("USDC balance:", bal.toString());<br>``` |

---

### 1-2 h build plan

1. **0–10 min**  
   - `npm install @polymarket/clob-client ethers`  
   - Paste snippet #1 into your app’s init.  

2. **10–30 min**  
   - In console or a simple screen, run snippet #2 to list markets (you’ll see IDs).  

3. **30–50 min**  
   - Pick one ID, set it as `EVENT_ID` in snippet #3.  
   - Log outcomes & mid-price.  

4. **50–80 min**  
   - Add snippet #4 to buy YES.  
   - Test in Polygon testnet first (use test USDC).  

5. **80–100 min**  
   - Run snippet #5 to display USDC balance.  

6. **100–120 min**  
   - Wrap each in simple buttons or CLI commands; verify full end-to-end.  

---

**Simplification tips**  
- Hard-code RPC, private key, chainId (137), USDC address, EVENT_ID.  
- Only market orders; skip approvals UI (do it once in code).  
- Use console.log for feedback; defer UI polish.

**Endpoints**
/getEvents
/placeEventTrade