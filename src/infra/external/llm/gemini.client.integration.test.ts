import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { GeminiClient } from './gemini.client';
import type { FastifyBaseLogger } from 'fastify';
import { container } from 'tsyringe';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Basic mock logger for integration tests
const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => mockLogger),
} as unknown as FastifyBaseLogger;

// Skip the entire suite if the API key is not set
describe.skipIf(!process.env.GEMINI_API_KEY)('GeminiClient Integration Tests', () => {
    let geminiClient: GeminiClient;

    beforeAll(() => {
        // Ensure mocks from other files don't interfere if run together (though unlikely with separate files)
        vi.resetModules(); 
        
        // Clear container instances to avoid conflicts if necessary
        container.clearInstances();
        
        // Register the mock logger
        container.register<FastifyBaseLogger>("Logger", { useValue: mockLogger });

        // Resolve the real GeminiClient using the container
        // This relies on the API key being present in process.env
        try {
            geminiClient = container.resolve(GeminiClient);
        } catch (error) {
            console.error("Failed to initialize GeminiClient for integration tests. Ensure GEMINI_API_KEY is set.", error);
            // Force skip if initialization fails (e.g., key missing despite check)
            // This prevents test failures due to setup issues rather than logic errors.
             throw new Error("Skipping integration tests due to GeminiClient initialization failure.");
        }
    });

    it('should generate content successfully using the real API', async () => {
        const prompt = 'Make this question in 3-6 words: Will Buffett say \"A.I\" or \"Artificial Intelligence\" during May 3 Shareholders Meeting?';
        
        try {
            const result = await geminiClient.generateContent(prompt);

            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0); // Check that the response is not empty
            
            console.log(`
Integration Test Response (GeminiClient): ${result.substring(0,100)}...
`); // Log snippet for verification

            expect(mockLogger.error).not.toHaveBeenCalled(); // Ensure no errors were logged during generation

        } catch (error) {
            console.error("Integration test failed:", error);
            // Fail the test explicitly if the API call throws an unexpected error
            throw error; 
        }
    // Increase timeout as real API calls can take longer
    }, 15000); // 15 seconds timeout 
});

// Add a placeholder test that runs when skipped, explaining why
describe.skipIf(!!process.env.GEMINI_API_KEY)('GeminiClient Integration Tests [SKIPPED]', () => {
    it('tests are skipped because GEMINI_API_KEY environment variable is not set', () => {
        expect(true).toBe(true); // Dummy assertion
    });
}); 