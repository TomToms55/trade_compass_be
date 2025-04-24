import { GoogleGenAI } from '@google/genai';
import { injectable, inject } from 'tsyringe';
import type { FastifyBaseLogger } from 'fastify';
import { ILLMClient } from '@/core/interfaces';

@injectable()
export class GeminiClient implements ILLMClient {
    private genAI: GoogleGenAI;
    private readonly modelName = 'gemini-2.0-flash-001'; // Use a recent model

    constructor(@inject("Logger") private logger: FastifyBaseLogger) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            this.logger.error('GEMINI_API_KEY environment variable is not set.');
            throw new Error('Gemini API key is missing. Cannot initialize GeminiClient.');
        }
        this.genAI = new GoogleGenAI({ apiKey });
        this.logger.info(`GeminiClient initialized with model: ${this.modelName} using @google/genai SDK`);
    }

    async generateContent(prompt: string): Promise<string> {
        try {
            this.logger.trace(`Generating content with prompt starting with: "${prompt.substring(0, 50)}..."`);
            
            const result = await this.genAI.models.generateContent({
                model: this.modelName,
                contents: [{ role: "user", parts: [{ text: prompt }] }],
            });

            // Extract the response text from candidates structure
            const candidate = result?.candidates?.[0];
            const part = candidate?.content?.parts?.[0];
            const text = part?.text;

            if (!text) {
                 this.logger.error({ result }, 'Unexpected response structure or empty text from @google/genai candidates');
                 throw new Error('Failed to parse response text from Gemini (@google/genai)');
            }
            
            this.logger.trace(`Successfully generated content ending with: "...${text.substring(text.length - 50)}"`);
            return text;
        } catch (error: any) {
            this.logger.error({ err: error, prompt }, `Failed to generate content using @google/genai model ${this.modelName}.`);
            throw new Error(`Gemini content generation failed (@google/genai): ${error.message || 'Unknown error'}`);
        }
    }
} 