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

    async registerUser(userData: UserRegistrationData): Promise<{ success: boolean, userId?: string, message?: string }> {
        try {
            // 1. Check if user with the same email already exists (More common check than API key)
            const existingUserByEmail = await this.userRepository.findByEmail(userData.email);
            if (existingUserByEmail) {
                console.warn(`Registration attempt for existing email: ${userData.email}`);
                // Consider throwing a specific "Conflict" error or returning a more informative failure
                return { success: false, message: 'Email already registered.' }; // Add message
            }

            // 2. Hash the password
            const passwordHash = await bcrypt.hash(userData.password, AuthService.SALT_ROUNDS);

            // 3. Generate a unique ID for the new user
            const userId = uuidv4();

            // 4. Prepare user data for creation (Ensure this matches UserCreateInput)
            const newUserInput = {
                id: userId,
                email: userData.email, // Include email
                apiKey: userData.apiKey,
                apiSecret: userData.apiSecret, // Consider hashing/encrypting API secrets
                passwordHash: passwordHash,
                automaticTradingEnabled: false, // Default value
            };

            // 5. Create the user using the repository's 'create' method
            const newUser = await this.userRepository.create(newUserInput);

            // 6. Return success with the new user ID
            return { success: true, userId: newUser.id };
        } catch (error) {
            console.error("Error during user registration:", error);
            // Improve error handling: check for specific repository errors (like constraint violations)
            // Log the error properly (e.g., using injected logger)
            // Return a generic failure or throw an appropriate HTTP error
            let message = 'Registration failed due to an unexpected error.';
            if (error instanceof Error && error.message.includes('Email already exists')) {
                 message = 'Email already registered.'; // More specific based on repo error
            }
            return { success: false, message: message }; // Include error message
        }
    }

    // Renamed and updated method
    async verifyUserCredentialsWithIdentifier(
        userId: string | undefined,
        email: string | undefined,
        passwordAttempt: string
    ): Promise<{ isValid: boolean, userId?: string }> { // Return userId on success
        try {
            let user: User | null = null;

            // 1. Find user by email if provided, otherwise by userId
            if (email) {
                user = await this.userRepository.findByEmail(email);
            } else if (userId) {
                user = await this.userRepository.findById(userId);
            } else {
                // Should not happen if route validation works, but handle defensively
                console.warn('verifyUserCredentialsWithIdentifier called without userId or email.');
                return { isValid: false };
            }

            // 2. Check if user exists and has a password hash
            if (!user || !user.passwordHash) {
                return { isValid: false };
            }

            // 3. Compare the provided password with the stored hash
            const isMatch = await bcrypt.compare(passwordAttempt, user.passwordHash);

            // 4. Return validation result and userId if match
            return {
                isValid: isMatch,
                userId: isMatch ? user.id : undefined // Only return userId if valid
            };
        } catch (error) {
            console.error("Error during credential verification:", error);
            // TODO: Implement proper logging and error handling
            return { isValid: false }; // Fail verification on error
        }
    }
} 