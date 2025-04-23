import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { TradeSuggestion } from '@/core/domainTypes';
import jwt from 'jsonwebtoken';

// Import the interface for type safety (optional but good practice)
import type { IUserService } from '@/core/interfaces'; 

// We'll need access to storageService, so we'll pass it via options or use decorators later
type StorageService = ReturnType<typeof import('@/modules/services/storage').default>;

export default async function publicRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {

    // Dependency Injection check (or use decorators)
    const storageService = fastify.storageService; // Assuming decorator is used
    // Retrieve the UserService instance decorated onto Fastify
    const userService = fastify.userService as IUserService; // Use the interface type
    
    if (!storageService || !userService) { // Add userService to the check
        throw new Error('Required services not decorated on Fastify instance');
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

    // --- Authentication Routes ---

    // Define schema for /register request body
    const registerSchema = {
        body: {
            type: 'object',
            required: ['apiKey', 'apiSecret', 'password'],
            properties: {
                apiKey: { type: 'string' },
                apiSecret: { type: 'string' },
                password: { type: 'string', minLength: 8 },
            },
        },
    };

    // POST /register
    fastify.post('/register', { schema: registerSchema }, async (request, reply) => {
        try {
            // Type assertion based on schema, not userService module
            const { apiKey, apiSecret, password } = request.body as { apiKey: string, apiSecret: string, password: string }; 
            // Call the method on the userService INSTANCE
            const result = await userService.registerUser({ apiKey, apiSecret, password });

            if (result.success) {
                reply.code(201).send({ message: 'User registered successfully', userId: result.userId });
            } else {
                reply.code(400).send({ error: 'Registration Failed', message: result.error || 'Could not register user.' });
            }
        } catch (error) {
            request.log.error('Registration endpoint error:', error);
            reply.code(500).send({ error: 'Internal Server Error', message: 'An unexpected error occurred during registration.' });
        }
    });

    // Define schema for /login request body
    const loginSchema = {
        body: {
            type: 'object',
            required: ['userId', 'password'],
            properties: {
                userId: { type: 'string' }, 
                password: { type: 'string' },
            },
        },
    };

    // POST /login
    fastify.post('/login', { schema: loginSchema }, async (request, reply) => {
        try {
            const { userId, password } = request.body as { userId: string; password: string };
            // Call the method on the userService INSTANCE
            const isValid = await userService.verifyUserCredentials(userId, password);

            if (!isValid) {
                return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid user ID or password.' });
            }

            const jwtSecret = process.env.JWT_SECRET;
            if (!jwtSecret) {
                request.log.error('JWT_SECRET is not configured.');
                return reply.code(500).send({ error: 'Internal Server Error', message: 'Server configuration error.' });
            }
            
            const payload = { user_id: userId };
            const token = jwt.sign(payload, jwtSecret, { expiresIn: '1h' });

            reply.send({ message: 'Login successful', token: token });

        } catch (error) {
            request.log.error('Login endpoint error:', error);
            reply.code(500).send({ error: 'Internal Server Error', message: 'An unexpected error occurred during login.' });
        }
    });
} 