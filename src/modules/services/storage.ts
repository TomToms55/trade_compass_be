import { TradeSuggestion, InfiniteGamesEvent } from '@/core/domainTypes';
import { EventDetails } from '@/infra/external/infiniteGames';
import type { PredictedFullEvent } from '@/modules/infinite_games/services/infiniteGames.service';
import fs from 'fs/promises';
import path from 'path';
import { IStorageService } from '@/core/interfaces';

class MemoryStorageService implements IStorageService {
  private suggestions: TradeSuggestion[] = [];
  private infiniteGamesCombinedData: PredictedFullEvent[] = [];

  async getSuggestions(): Promise<TradeSuggestion[]> {
    return this.suggestions;
  }

  async saveSuggestions(suggestions: TradeSuggestion[]): Promise<void> {
    this.suggestions = suggestions;
  }

  async saveInfiniteGamesData(data: PredictedFullEvent[]): Promise<void> {
    console.log(`[MemoryStorage] Saving ${data.length} combined Infinite Games event entries.`);
    this.infiniteGamesCombinedData = data;
  }

  async getInfiniteGamesData(): Promise<PredictedFullEvent[]> {
    console.log(`[MemoryStorage] Retrieving ${this.infiniteGamesCombinedData.length} combined Infinite Games event entries.`);
    return this.infiniteGamesCombinedData;
  }
}

class FileStorageService implements IStorageService {
  private suggestionsFilePath: string;
  private infiniteGamesDataPath: string;

  constructor(suggestionsFilePath: string, infiniteGamesDataPath: string = './data/infinite_games.json') {
    this.suggestionsFilePath = suggestionsFilePath;
    this.infiniteGamesDataPath = infiniteGamesDataPath;
  }

  async getSuggestions(): Promise<TradeSuggestion[]> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.suggestionsFilePath);
      await fs.mkdir(dir, { recursive: true });

      const data = await fs.readFile(this.suggestionsFilePath, 'utf-8');
      return JSON.parse(data) as TradeSuggestion[];
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
         console.error('Error reading suggestions file:', error);
      }
      // If file doesn't exist or is invalid, return empty array
      return [];
    }
  }

  async saveSuggestions(suggestions: TradeSuggestion[]): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.suggestionsFilePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(this.suggestionsFilePath, JSON.stringify(suggestions, null, 2), 'utf-8');
  }

  async saveInfiniteGamesData(data: PredictedFullEvent[]): Promise<void> {
     console.log(`[FileStorage] Saving ${data.length} combined Infinite Games event entries to ${this.infiniteGamesDataPath}.`);
     const dataToStore = {
         data: data,
         lastUpdated: new Date().toISOString()
     };
     // Ensure directory exists
     const dir = path.dirname(this.infiniteGamesDataPath);
     await fs.mkdir(dir, { recursive: true });

     try {
        await fs.writeFile(this.infiniteGamesDataPath, JSON.stringify(dataToStore, null, 2), 'utf-8');
     } catch (error) {
        console.error('Error writing Infinite Games data file:', error);
        // Decide if you want to re-throw or handle differently
        throw error; 
     }
  }

  async getInfiniteGamesData(): Promise<PredictedFullEvent[]> {
    console.log(`[FileStorage] Attempting to retrieve Infinite Games data from ${this.infiniteGamesDataPath}.`);
    try {
      // Ensure directory exists (though likely not needed for read, good practice)
      const dir = path.dirname(this.infiniteGamesDataPath);
      await fs.mkdir(dir, { recursive: true });

      const fileData = await fs.readFile(this.infiniteGamesDataPath, 'utf-8');
      // Parse the structure { data: PredictedFullEvent[], lastUpdated: string }
      const parsedData = JSON.parse(fileData);
      if (parsedData && Array.isArray(parsedData.data)) {
        console.log(`[FileStorage] Successfully retrieved ${parsedData.data.length} entries.`);
        return parsedData.data as PredictedFullEvent[];
      } else {
        console.warn(`[FileStorage] Data file ${this.infiniteGamesDataPath} has unexpected structure.`);
        return [];
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') { // Log error only if it's not 'file not found'
         console.error('Error reading Infinite Games data file:', error);
      } else {
        console.log(`[FileStorage] Data file ${this.infiniteGamesDataPath} not found.`);
      }
      // If file doesn't exist or is invalid, return empty array
      return [];
    }
  }
}

// Factory function to create the appropriate storage service
export function createStorageService(): IStorageService {
  const storageType = process.env.STORAGE_TYPE || 'memory';
  
  if (storageType === 'file') {
    const suggestionsFilePath = process.env.STORAGE_FILE_PATH || './data/suggestions.json';
    const infiniteGamesDataPath = process.env.INFINITE_GAMES_DATA_PATH || './data/infinite_games.json';
    return new FileStorageService(suggestionsFilePath, infiniteGamesDataPath);
  }
  
  return new MemoryStorageService();
}

export default createStorageService; 