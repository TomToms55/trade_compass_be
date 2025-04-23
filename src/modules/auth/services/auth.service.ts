import { inject, injectable } from 'tsyringe';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid'; // Import UUID generator
import { IAuthService, IUserRepository, UserRegistrationData } from '@/core/interfaces';
import { User } from '@prisma/client'; // Assuming User type includes passwordHash

@injectable()
export class AuthService implements IAuthService {
    // Define salt rounds for bcrypt hashing
    private static readonly SALT_ROUNDS = 10;

    constructor(
        @inject('IUserRepository') private userRepository: IUserRepository
    ) {}

    async registerUser(userData: UserRegistrationData): Promise<{ success: boolean, userId?: string }> {
        try {
            // 1. Check if user with the same API key already exists (optional but recommended)
            // const existingUser = await this.userRepository.findByApiKey(userData.apiKey);
            // if (existingUser) {
            //     console.warn(`Registration attempt for existing API key: ${userData.apiKey}`);
            //     return { success: false }; // Or throw a specific error
            // }

            // 2. Hash the password
            const passwordHash = await bcrypt.hash(userData.password, AuthService.SALT_ROUNDS);

            // 3. Generate a unique ID for the new user
            const userId = uuidv4();

            // 4. Prepare user data for creation
            const newUserInput = {
                id: userId, // Use the generated UUID
                apiKey: userData.apiKey,
                apiSecret: userData.apiSecret, // Consider hashing or encrypting API secrets
                passwordHash: passwordHash,
                automaticTradingEnabled: false, // Default value
                // Ensure all required fields by Prisma User model are present
            };

            // 5. Create the user using the 'create' method (assuming it exists)
            // Ensure IUserRepository interface and its implementation have a 'create' method
            // accepting an object like newUserInput and returning the created User.
            const newUser = await this.userRepository.create(newUserInput); 

            // 6. Return success with the new user ID
            return { success: true, userId: newUser.id };
        } catch (error) {
            console.error("Error during user registration:", error);
            // Log the error properly (e.g., using fastify.log)
            // Consider throwing specific errors for different failure types
            return { success: false };
        }
    }

    async verifyUserCredentials(userId: string, passwordAttempt: string): Promise<boolean> {
        try {
            // Retrieve the user, which should include the password hash
            const user = await this.userRepository.findById(userId);

            if (!user || !user.passwordHash) {
                // User not found or has no password hash set
                return false;
            }

            // Compare the provided password with the stored hash
            const isMatch = await bcrypt.compare(passwordAttempt, user.passwordHash);
            return isMatch;
        } catch (error) {
            console.error("Error during credential verification:", error);
            // TODO: Implement proper logging and error handling
            return false; // Fail verification on error
        }
    }
} 