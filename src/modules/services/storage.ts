import { TradeSuggestion } from '@/core/domainTypes';
import fs from 'fs/promises';
import path from 'path';
import { IStorageService } from '@/core/interfaces';

class MemoryStorageService implements IStorageService {
  private suggestions: TradeSuggestion[] = [];

  async getSuggestions(): Promise<TradeSuggestion[]> {
    return this.suggestions;
  }

  async saveSuggestions(suggestions: TradeSuggestion[]): Promise<void> {
    this.suggestions = suggestions;
  }
}

class FileStorageService implements IStorageService {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async getSuggestions(): Promise<TradeSuggestion[]> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      const data = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(data) as TradeSuggestion[];
    } catch (error) {
      console.error('Error reading suggestions file:');
      // If file doesn't exist or is invalid, return empty array
      return [];
    }
  }

  async saveSuggestions(suggestions: TradeSuggestion[]): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.writeFile(this.filePath, JSON.stringify(suggestions, null, 2), 'utf-8');
  }
}

// Factory function to create the appropriate storage service
export function createStorageService(): IStorageService {
  const storageType = process.env.STORAGE_TYPE || 'memory';
  
  if (storageType === 'file') {
    const filePath = process.env.STORAGE_FILE_PATH || './data/suggestions.json';
    return new FileStorageService(filePath);
  }
  
  return new MemoryStorageService();
}

export default createStorageService; 