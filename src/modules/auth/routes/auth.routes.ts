import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { container } from 'tsyringe';
import { z } from 'zod';
import { IAuthService } from '@/core/interfaces';
import { AuthService } from '../services/auth.service'; // Import concrete type for token

// Define the schema for the registration request body using Zod
const RegisterUserSchema = z.object({
  apiKey: z.string().min(1, "API Key is required").describe('Your Binance API Key'),
  apiSecret: z.string().min(1, "API Secret is required").describe('Your Binance API Secret'),
  password: z.string().min(8, "Password must be at least 8 characters long").describe('Your desired account password'),
}).describe('Payload for registering a new user');

// Infer the TypeScript type from the Zod schema
type RegisterUserBody = z.infer<typeof RegisterUserSchema>;

// Define the schema for the login request body using Zod
const LoginUserSchema = z.object({
  // Consider using email or username instead of userId for login flexibility
  userId: z.string().min(1, "User ID is required").describe('The unique ID of the user'),
  password: z.string().min(1, "Password is required").describe('The user\'s account password'),
}).describe('Payload for user login');

// Define response schemas using Zod
const RegisterSuccessResponseSchema = z.object({ 
  success: z.literal(true), 
  userId: z.string().describe('The ID of the newly registered user') 
}).describe('Successful registration response');

const AuthErrorResponseSchema = z.object({ 
  success: z.literal(false), 
  message: z.string().describe('Description of the error') 
}).describe('Generic authentication error response');

const LoginSuccessResponseSchema = z.object({ 
  success: z.literal(true), 
  token: z.string().describe('JWT token for subsequent requests') 
}).describe('Successful login response');

type LoginUserBody = z.infer<typeof LoginUserSchema>;

export default async function authRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {

  // Resolve the AuthService from the container using the Interface Token
  // Note: Ensure AuthService and its dependencies (like IUserRepository) are registered in the composition root
  const authService = container.resolve<IAuthService>('IAuthService'); // Changed from 'AuthService'

  // Define the POST /register route
  // The RequestGenericInterface defines the types for Body, Querystring, Params, Headers
  fastify.post<{ Body: RegisterUserBody }>('/register', {
    schema: {
      description: 'Register a new user account with Binance API credentials.',
      tags: ['auth'], // Add tag for Swagger grouping
      summary: 'Register New User', // Add summary for Swagger
      body: RegisterUserSchema,
      response: {
        201: RegisterSuccessResponseSchema,
        400: AuthErrorResponseSchema, // Use common error schema
        500: AuthErrorResponseSchema  // Use common error schema
      }
    },
    // The request parameter is now correctly typed by Fastify based on the generic and schema
    handler: async (request, reply: FastifyReply) => {
      try {
        // request.body is now correctly typed as RegisterUserBody
        const result = await authService.registerUser(request.body);

        if (result.success && result.userId) {
          // Use 201 Created status code for successful resource creation
          reply.code(201).send({ success: true, userId: result.userId });
        } else {
          // Use 400 Bad Request for registration failure (e.g., user exists, validation)
          // Improve error message based on actual failure reason if possible
          reply.code(400).send({ success: false, message: 'Registration failed.' });
        }
      } catch (error) {
         // Log the detailed error using Fastify's logger
         request.log.error(error, 'Error during user registration route');
        // Use 500 Internal Server Error for unexpected issues
        reply.code(500).send({ success: false, message: 'Internal server error during registration.' });
      }
    }
  });

  // --- Login Route --- 
  fastify.post<{ Body: LoginUserBody }>('/login', {
    schema: {
      description: 'Authenticate a user and receive a JWT token.',
      tags: ['auth'], // Add tag for Swagger grouping
      summary: 'User Login', // Add summary for Swagger
      body: LoginUserSchema,
      response: {
        200: LoginSuccessResponseSchema,
        401: AuthErrorResponseSchema, // Use common error schema
        500: AuthErrorResponseSchema  // Use common error schema
      }
    },
    handler: async (request, reply: FastifyReply) => {
      try {
        const { userId, password } = request.body;
        const isValid = await authService.verifyUserCredentials(userId, password);

        if (isValid) {
          // IMPORTANT: The fastify instance needs the @fastify/jwt plugin registered
          // and configured with a secret for this to work. This should be done
          // in the main application setup (e.g., src/app.ts or src/server.ts).
          // Using 'as any' temporarily to bypass TS error until JWT plugin is registered.
          const jwt = (fastify as any).jwt;
          if (!jwt) {
            throw new Error('JWT plugin is not registered or configured.');
          }
          // Sign token with user_id (snake_case) to match middleware expectation
          const token = await jwt.sign({ user_id: userId }); 
          reply.code(200).send({ success: true, token });
        } else {
          reply.code(401).send({ success: false, message: 'Invalid credentials.' });
        }
      } catch (error: any) {
        request.log.error(error, 'Error during user login route');
        // Check if it's the JWT configuration error
        if (error.message?.includes('JWT plugin')) {
           reply.code(500).send({ success: false, message: 'Internal server error: JWT not configured.' });
        } else {
           reply.code(500).send({ success: false, message: 'Internal server error during login.' });
        }
      }
    }
  });
}