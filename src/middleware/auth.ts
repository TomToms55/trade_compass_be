import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import jwt from 'jsonwebtoken';

// Export the interface
export interface JwtPayload {
    user_id: string;
    // Add other potential payload fields if necessary
    iat?: number; // Issued at (standard JWT claim)
    exp?: number; // Expiration time (standard JWT claim)
}

// Extend FastifyRequest interface to include the auth property
declare module 'fastify' {
    interface FastifyRequest {
        auth?: JwtPayload;
    }
}

export function authenticate(request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        reply.code(401).send({ error: 'Unauthorized', message: 'Missing or invalid Bearer token' });
        return; // Stop processing
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
        console.error('JWT_SECRET environment variable is not set.');
        reply.code(500).send({ error: 'Internal Server Error', message: 'Server configuration error' });
        return; // Stop processing
    }

    try {
        const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
        
        // Check if user_id exists in the payload
        if (!decoded || !decoded.user_id) {
             reply.code(401).send({ error: 'Unauthorized', message: 'Invalid token payload' });
             return; // Stop processing
        }

        // Attach the decoded payload (including user_id) to the request object as auth
        request.auth = decoded;
        done(); // Proceed to the next handler/route
    } catch (error: any) {
        console.error('JWT verification failed:', error.message);
        if (error.name === 'TokenExpiredError') {
            reply.code(401).send({ error: 'Unauthorized', message: 'Token expired' });
        } else if (error.name === 'JsonWebTokenError') {
            reply.code(401).send({ error: 'Unauthorized', message: 'Invalid token' });
        } else {
            reply.code(401).send({ error: 'Unauthorized', message: 'Authentication failed' });
        }
        // Do not call done() on error
    }
} 