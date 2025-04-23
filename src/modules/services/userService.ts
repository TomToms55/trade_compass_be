import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import type { 
    IUserRepository, 
    UserCredentials, // Needed for verify?
    UserDataInput, 
    UserSettingsUpdateInput 
} from '@/core/interfaces';
import type { User } from '@prisma/client'; // Import User type from Prisma

// Define types based on interfaces, renaming if needed
export type UserRegistrationData = Pick<UserDataInput, 'apiKey' | 'apiSecret' | 'passwordHash'> & { password: string }; // Combine required fields

// --- UserService Class ---
export class UserService {
    private userRepository: IUserRepository;
    private saltRounds = 10; // Cost factor for bcrypt hashing

    constructor(userRepository: IUserRepository) {
        this.userRepository = userRepository;
    }

    /**
     * Registers a new user.
     * Hashes the password and saves user data via the repository.
     */
    async registerUser(data: UserRegistrationData): Promise<{ success: boolean; userId?: string; error?: string }> {
        try {
            if (!data.apiKey || !data.apiSecret || !data.password) {
                return { success: false, error: 'Missing required fields (apiKey, apiSecret, password).' };
            }

            const userId = uuidv4();
            const passwordHash = await bcrypt.hash(data.password, this.saltRounds);

            const userData: UserDataInput = {
                id: userId,
                apiKey: data.apiKey,
                apiSecret: data.apiSecret,
                passwordHash: passwordHash,
                // automaticTradingEnabled defaults to false in DB/Repo
            };

            await this.userRepository.addOrUpdate(userData);

            console.log(`User registered successfully with ID: ${userId}`);
            return { success: true, userId: userId };

        } catch (error: any) {
            console.error('Error during user registration:', error);
            // TODO: More specific error handling based on repo errors?
            return { success: false, error: 'User registration failed due to an internal error.' };
        }
    }

    /**
     * Finds a user by their ID using the repository.
     */
    async findUserById(userId: string): Promise<User | null> {
        return this.userRepository.findById(userId);
    }

    /**
     * Verifies user credentials for login.
     */
    async verifyUserCredentials(userId: string, passwordAttempt: string): Promise<boolean> {
        try {
            // Find user including password hash
            const user = await this.findUserById(userId);
            if (!user || !user.passwordHash) { // Check for passwordHash existence
                console.log(`Login attempt failed: User not found or hash missing for ID ${userId}`);
                return false;
            }

            const match = await bcrypt.compare(passwordAttempt, user.passwordHash);

            if (!match) {
                 console.log(`Login attempt failed: Incorrect password for user ID ${userId}`);
            }
            return match;
        } catch (error: any) {
            console.error('Error verifying user credentials:', error);
            return false;
        }
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
     */
    async updateUserSettings(userId: string, settings: UserSettingsUpdateInput): Promise<{ success: boolean; error?: string }> {
        try {
            // Basic validation (moved from old DB layer)
            if (settings.automaticTradingEnabled !== undefined && typeof settings.automaticTradingEnabled !== 'boolean') {
                 return { success: false, error: 'Invalid setting value for automaticTradingEnabled.' };
            }
            // Add validation for other settings if needed

            const updatedUser = await this.userRepository.updateSettings(userId, settings);

            if (updatedUser) {
                console.log(`User settings updated successfully for ID: ${userId}`);
                return { success: true };
            } else {
                console.log(`Failed to update settings for user ID: ${userId}. User might not exist.`);
                return { success: false, error: 'User not found or no settings changed.' }; // Repo returns null if not found
            }
        } catch (error: any) { 
            console.error(`Error updating user settings for ${userId}:`, error);
            return { success: false, error: 'User settings update failed due to an unexpected internal error.' };
        }
    } 
} 