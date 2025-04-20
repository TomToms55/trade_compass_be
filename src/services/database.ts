import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt'; // Import bcrypt for hashing here
import { registerUser } from './userService'; // Import registerUser

// Define the structure for user data (used for seeding/adding)
export interface UserSeedData {
    id: string;
    apiKey: string;
    apiSecret: string;
    passwordHash: string; // Add password hash for seeding
}

// Define the structure for user data retrieved from DB
export interface UserDbRecord {
    id: string;
    api_key: string;
    api_secret: string;
    password_hash: string;
}

// Define the path for the SQLite database file
// Use absolute path within the container, consistent with the volume mount
const dbPath = process.env.NODE_ENV === 'production' 
    ? '/app/data/database.db' 
    : path.resolve(__dirname, '../../data/database.db'); 
// Ensure the data directory exists or handle creation appropriately if needed.

let db: Database | null = null;

// Function to initialize the database connection and create tables
export async function initializeDatabase() {
    try {
        // Ensure the data directory exists
        const dir = path.dirname(dbPath);
        try {
            await fs.promises.mkdir(dir, { recursive: true });
        } catch (mkdirError: any) {
            // Ignore error if directory already exists
            if (mkdirError.code !== 'EEXIST') {
                throw mkdirError; // Re-throw other errors
            }
        }

        db = await open<sqlite3.Database, sqlite3.Statement>({
            filename: dbPath,
            driver: sqlite3.Database
        });

        console.log('Connected to the SQLite database.');

        // Create the users table if it doesn't exist
        await db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                api_key TEXT NOT NULL,
                api_secret TEXT NOT NULL,
                password_hash TEXT NOT NULL
            );
        `);

        console.log('Users table verified/created.');

        // Seed initial user if needed
        await seedInitialUser(); 

    } catch (err: unknown) {
        console.error('Error initializing database:', (err as Error).message);
        process.exit(1); // Exit if DB connection fails
    }
}

// Function to seed the initial user from environment variables
async function seedInitialUser() {
    const useTestnet = process.env.USE_BINANCE_TESTNET === 'true';
    const envSuffix = useTestnet ? '_TESTNET' : '_REAL';
    const userId = process.env[`SEED_USER_ID${envSuffix}`];
    const apiKey = process.env[`SEED_USER_API_KEY${envSuffix}`];
    const apiSecret = process.env[`SEED_USER_API_SECRET${envSuffix}`];
    const password = process.env.SEED_USER_PASSWORD;
    const saltRounds = 10; 

    if (userId && apiKey && apiSecret && password) {
        const envType = useTestnet ? 'Testnet' : 'Realnet';
        console.log(`Checking seed status for ${envType} user ID: ${userId}`);
        const existingUser = await getUserById(userId);
        
        if (!existingUser) {
            console.log(`${envType} User ID ${userId} not found. Seeding...`);
            try {
                const passwordHash = await bcrypt.hash(password, saltRounds);
                const userSeedData: UserSeedData = {
                    id: userId, 
                    apiKey: apiKey,
                    apiSecret: apiSecret,
                    passwordHash: passwordHash,
                };
                await addOrUpdateUserDb(userSeedData);
                console.log(`Successfully seeded ${envType} user with ID: ${userId}`);
            } catch (hashError: any) {
                 console.error(`Error hashing password during seeding for ${envType} user ${userId}:`, hashError);
            }
        } else {
            console.log(`${envType} User with ID ${userId} already exists, skipping seed.`);
        }
    } else {
        console.log(`Seed user environment variables (ID/Key/Secret/Password) for ${useTestnet ? 'Testnet' : 'Realnet'} not fully set, skipping seed user creation.`);
    }
}

// Function to get user data (including hashes and keys) by user ID
export async function getUserById(userId: string): Promise<UserDbRecord | null> {
    if (!db) {
        console.error('Database not initialized.');
        return null;
    }
    try {
        // Fetch the full user record
        const user = await db.get<UserDbRecord>(
            'SELECT id, api_key, api_secret, password_hash FROM users WHERE id = ?',
             userId
        );
        return user || null;
    } catch (err: unknown) {
        console.error(`Error fetching user data for ${userId}:`, (err as Error).message);
        return null;
    }
}

// Function to get user API credentials by user ID
export async function getUserApiCredentials(userId: string): Promise<{ apiKey: string; apiSecret: string } | null> {
    if (!db) {
        console.error('Database not initialized.');
        return null;
    }
    try {
        const user = await db.get<{ apiKey: string; apiSecret: string }>(
            'SELECT api_key AS apiKey, api_secret AS apiSecret FROM users WHERE id = ?',
             userId
        );
        return user || null;
    } catch (err: unknown) {
        console.error(`Error fetching user credentials for ${userId}:`, (err as Error).message);
        return null;
    }
}

// Function to add or update a user (used internally or for seeding)
export async function addOrUpdateUserDb(userData: UserSeedData): Promise<void> {
     if (!db) {
        console.error('Database not initialized.');
        return;
    }
    try {
        await db.run(
            'INSERT OR REPLACE INTO users (id, api_key, api_secret, password_hash) VALUES (?, ?, ?, ?)', 
            userData.id, 
            userData.apiKey, 
            userData.apiSecret,
            userData.passwordHash // Include password hash
        );
        console.log(`User ${userData.id} added/updated in DB.`);
    } catch (err: unknown) {
        console.error(`Error adding/updating user ${userData.id} in DB:`, (err as Error).message);
    }
}

// Function to delete a user by ID
export async function deleteUserDb(userId: string): Promise<void> {
    if (!db) {
        console.error('Database not initialized. Cannot delete user.');
        return;
    }
    try {
        const result = await db.run('DELETE FROM users WHERE id = ?', userId);
        // Check if result and changes property exist
        if (result && result.changes !== undefined && result.changes > 0) {
            console.log(`User ${userId} deleted successfully from DB.`);
        } else {
            console.log(`User ${userId} not found in DB for deletion.`);
        }
    } catch (err: unknown) {
        console.error(`Error deleting user ${userId} from DB:`, (err as Error).message);
    }
}

// Function to close the database connection (useful for graceful shutdown)
export async function closeDatabase() {
    if (db) {
        await db.close();
        console.log('Database connection closed.');
    }
} 