import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { injectable, inject } from 'tsyringe'; // Import injectable and inject
import type { 
    IUserRepository, 
    UserCredentials, // Needed for verify?
    UserDataInput, 
    UserSettingsUpdateInput,
    IUserService // Import IUserService
} from '@/core/interfaces';
import type { User } from '@prisma/client'; // Import User type from Prisma

// Define types based on interfaces, renaming if needed
export type UserRegistrationData = Pick<UserDataInput, 'apiKey' | 'apiSecret' | 'passwordHash'> & { password: string }; // Combine required fields

// --- UserService Class ---
@injectable() // Add injectable decorator
export class UserService implements IUserService { // Implement interface
    private saltRounds = 10; // Cost factor for bcrypt hashing

    // Inject IUserRepository using the token defined in bootstrap.ts
    constructor(
        @inject('IUserRepository') private userRepository: IUserRepository
    ) {}

    /**
     * Finds a user by their ID using the repository.
     * Keeping this internal for now, or expose if needed separately.
     */
    private async findUserById(userId: string): Promise<User | null> {
        return this.userRepository.findById(userId);
    }

    /**
     * Deletes a user by their ID (for testing).
     */
    async deleteUserForTest(userId: string): Promise<void> {
        console.log(`Attempting to delete user ${userId} for testing purposes.`);
        await this.userRepository.deleteById(userId);
    }

    /**
     * Updates specific settings for a user via the repository.
     * Matches IUserService interface.
     */
    async updateUserSettings(userId: string, settings: Partial<{ apiKey: string, apiSecret: string, automaticTradingEnabled: boolean }>): Promise<User | null> {
         // Map Partial settings to UserSettingsUpdateInput for the repository
         const repoSettings: UserSettingsUpdateInput = {};
         if (settings.apiKey !== undefined) repoSettings.apiKey = settings.apiKey;
         if (settings.apiSecret !== undefined) repoSettings.apiSecret = settings.apiSecret;
         if (settings.automaticTradingEnabled !== undefined) repoSettings.automaticTradingEnabled = settings.automaticTradingEnabled;
        
         if (Object.keys(repoSettings).length === 0) {
             console.warn(`UserService: No valid settings provided for update for user ${userId}.`);
             // Return current user data or null if no update occurs
             return this.findUserById(userId); 
         }

        try {
            const updatedUser = await this.userRepository.updateSettings(userId, repoSettings);
            if (updatedUser) {
                console.log(`User settings updated successfully via UserService for ID: ${userId}`);
            }
            return updatedUser; // Returns null if user not found by repo
        } catch (error: any) { 
            console.error(`Error updating user settings via UserService for ${userId}:`, error);
            // Re-throw or return null based on desired error handling
            // Returning null for now, consistent with repo behavior on error/not found
            return null;
        }
    } 

    /**
     * Retrieves specific user settings (API key and secret).
     * Implements IUserService method.
     */
    async getUserSettings(userId: string): Promise<{ apiKey: string; apiSecret: string } | null> {
        try {
            const credentials = await this.userRepository.findCredentialsById(userId);
            // findCredentialsById returns null if not found or on error
            return credentials;
        } catch (error) {
            console.error(`Error fetching user settings via UserService for ${userId}:`, error);
            return null;
        }
    }
} 