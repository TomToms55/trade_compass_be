import polymarketRoutes from './routes/polymarket.routes';
import { PolymarketService } from './services/polymarket.service';

// Export the routes plugin and potentially the service class for DI
export { polymarketRoutes, PolymarketService };

// Optionally, you could export a configured instance if not using DI yet
// export const polymarketServiceInstance = new PolymarketService(); 