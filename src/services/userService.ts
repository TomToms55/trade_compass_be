import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { addOrUpdateUserDb, getUserById, UserDbRecord, deleteUserDb } from './database';

const saltRounds = 10; // Cost factor for bcrypt hashing

// Interface for registration data
export interface UserRegistrationData {
    apiKey: string;
    apiSecret: string;
    password: string;
}

/**
 * Registers a new user.
 * Hashes the password and saves user data to the database.
 */
export async function registerUser(data: UserRegistrationData): Promise<{ success: boolean; userId?: string; error?: string }> {
    try {
        // Basic validation (can be expanded)
        if (!data.apiKey || !data.apiSecret || !data.password) {
            return { success: false, error: 'Missing required fields (apiKey, apiSecret, password).' };
        }

        // Generate a unique user ID
        const userId = uuidv4();

        // Hash the password
        const passwordHash = await bcrypt.hash(data.password, saltRounds);

        // Prepare data for DB
        const userSeedData = {
            id: userId,
            apiKey: data.apiKey,
            apiSecret: data.apiSecret,
            passwordHash: passwordHash,
        };

        // Save to database
        await addOrUpdateUserDb(userSeedData);

        console.log(`User registered successfully with ID: ${userId}`);
        return { success: true, userId: userId };

    } catch (error: any) {
        console.error('Error during user registration:', error);
        return { success: false, error: 'User registration failed due to an internal error.' };
    }
}

/**
 * Finds a user by their ID.
 */
export async function findUserById(userId: string): Promise<UserDbRecord | null> {
    return await getUserById(userId);
}

/**
 * Verifies user credentials for login.
 */
export async function verifyUserCredentials(userId: string, passwordAttempt: string): Promise<boolean> {
    try {
        const user = await findUserById(userId);
        if (!user) {
            console.log(`Login attempt failed: User not found with ID ${userId}`);
            return false; // User not found
        }

        // Compare the provided password with the stored hash
        const match = await bcrypt.compare(passwordAttempt, user.password_hash);

        if (!match) {
             console.log(`Login attempt failed: Incorrect password for user ID ${userId}`);
        }

        return match;
    } catch (error: any) {
        console.error('Error verifying user credentials:', error);
        return false; // Internal error during verification
    }
}

/**
 * Deletes a user by their ID.
 * Primarily intended for cleanup during testing.
 */
export async function deleteUserForTest(userId: string): Promise<void> {
    console.log(`Attempting to delete user ${userId} for testing purposes.`);
    await deleteUserDb(userId);
} 