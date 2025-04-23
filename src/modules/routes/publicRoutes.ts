import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { TradeSuggestion } from '@/core/domainTypes';
import { container } from 'tsyringe'; // Import container
import { IStorageService } from '@/core/interfaces'; // Import needed interfaces

export default async function publicRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {

    // Resolve dependencies from the container
    const storageService = container.resolve<IStorageService>('IStorageService');

    // Dependency check (optional)
    if (!storageService) { 
        throw new Error('Storage service not resolved from container');
    }

    // Default route
    fastify.get("/", async (_request, reply) => {
        return reply.send({
            status: "ok",
            message: "CryptoCompass API is running",
        });
    });

    // GET /suggestions
    fastify.get("/suggestions", async (request, reply) => {
        try {
            const query = request.query as { limit?: string; offset?: string; confidence?: string };
            const limit = query.limit ? parseInt(query.limit, 10) : 9;
            const offset = query.offset ? parseInt(query.offset, 10) : 0;
            const minConfidence = query.confidence ? parseFloat(query.confidence) : 0.5;
            
            let suggestions = await storageService.getSuggestions();
                
            if (suggestions.length === 0) {
                return reply.send({ items: [], totalItems: 0, totalPages: 0, currentPage: 1, itemsPerPage: limit });
            }
            
            suggestions = suggestions.filter((s: TradeSuggestion) => (s.action === "BUY" || s.action === "SELL") && s.confidence > minConfidence);
            const totalFilteredItems = suggestions.length;
            const totalPages = Math.ceil(totalFilteredItems / limit);
            const paginatedSuggestions = suggestions.slice(offset, offset + limit);
            const currentPage = Math.floor(offset / limit) + 1;

            const response = {
                items: paginatedSuggestions,
                totalItems: totalFilteredItems,
                totalPages: totalPages,
                currentPage: currentPage,
                itemsPerPage: limit,
            };
            return reply.send(response);
        } catch (error) {
            request.log.error(error);
            return reply.status(500).send({ 
                error: "Internal Server Error",
                message: "Failed to fetch suggestions"
            });
        }
    });

    // --- Authentication Routes REMOVED --- 
    // (These are now handled in src/modules/auth/routes/auth.routes.ts)
    
    // Removed /register route
    // Removed /login route
} 