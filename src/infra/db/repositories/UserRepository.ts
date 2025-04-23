import { PrismaClient, User, Prisma } from '@prisma/client';
import {
  IUserRepository,
  UserDataInput,
  UserSettingsUpdateInput,
  UserCredentials,
} from '@/core/interfaces'; // Adjust path if necessary
import prisma from '@/infra/db/prisma.client'; // Import the singleton instance

export class UserRepository implements IUserRepository {
  private readonly client: PrismaClient;

  constructor() {
    this.client = prisma; // Use the singleton instance
  }

  /**
   * Finds a user by their unique ID.
   */
  async findById(userId: string): Promise<User | null> {
    try {
      const user = await this.client.user.findUnique({
        where: { id: userId },
      });
      return user;
    } catch (error) {
      // Log the error appropriately
      console.error(`Error finding user by ID ${userId}:`, error);
      // Depending on requirements, could throw a custom error or return null
      return null;
    }
  }

  /**
   * Finds a user's API credentials by their unique ID.
   * Only selects the necessary fields.
   */
  async findCredentialsById(userId: string): Promise<UserCredentials | null> {
    try {
      const userCredentials = await this.client.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          apiKey: true,
          apiSecret: true,
        },
      });

      if (userCredentials) {
        return {
          apiKey: userCredentials.apiKey ?? '',
          apiSecret: userCredentials.apiSecret ?? '',
        };
      }
      return null;
    } catch (error) {
      console.error(`Error finding credentials for user ID ${userId}:`, error);
      return null;
    }
  }

  /**
   * Creates a new user or updates an existing one based on ID.
   */
  async addOrUpdate(userData: UserDataInput): Promise<User> {
    try {
      const updatePayload: Prisma.UserUpdateInput = {};
      if (userData.apiKey !== undefined) updatePayload.apiKey = userData.apiKey;
      if (userData.apiSecret !== undefined) updatePayload.apiSecret = userData.apiSecret;
      if (userData.passwordHash !== undefined) updatePayload.passwordHash = userData.passwordHash;

      if (!userData.apiKey || !userData.apiSecret || !userData.passwordHash) {
        console.warn(`Attempting to create user ${userData.id} without required apiKey, apiSecret, or passwordHash. Ensure these are provided.`);
      }

      const createPayload: Prisma.UserCreateInput = {
        id: userData.id,
        apiKey: userData.apiKey!,
        apiSecret: userData.apiSecret!,
        passwordHash: userData.passwordHash!,
      };

      const user = await this.client.user.upsert({
        where: { id: userData.id },
        update: updatePayload,
        create: createPayload,
      });
      return user;
    } catch (error) {
      console.error(`Error adding or updating user ${userData.id}:`, error);
      // Re-throw or handle as appropriate for the application
      throw new Error(`Failed to add or update user ${userData.id}`);
    }
  }

  /**
   * Updates specific settings for a user.
   * Returns the updated user or null if not found.
   */
  async updateSettings(userId: string, settings: UserSettingsUpdateInput): Promise<User | null> {
    // Ensure we don't pass undefined fields to Prisma's update
    const updateData: Prisma.UserUpdateInput = {};

    // Use only fields defined in UserSettingsUpdateInput
    if (settings.automaticTradingEnabled !== undefined) {
        updateData.automaticTradingEnabled = settings.automaticTradingEnabled;
    }
    if (settings.apiKey !== undefined) {
        updateData.apiKey = settings.apiKey;
    }
     if (settings.apiSecret !== undefined) {
        updateData.apiSecret = settings.apiSecret;
    }

    if (Object.keys(updateData).length === 0) {
      // No valid settings provided to update, maybe return current user or throw error
       console.warn(`No valid settings provided for user ${userId}.`);
       // Optionally, fetch and return the current user data
       return this.findById(userId);
      // Or throw an error if an update was expected:
      // throw new Error("No valid settings provided for update.");
    }

    try {
      const updatedUser = await this.client.user.update({
        where: { id: userId },
        data: updateData,
      });
      return updatedUser;
    } catch (error) {
       // Prisma throws P2025 if the record to update is not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        console.warn(`User with ID ${userId} not found for settings update.`);
        return null;
      }
      console.error(`Error updating settings for user ID ${userId}:`, error);
       // Re-throw or handle as appropriate
      throw new Error(`Failed to update settings for user ${userId}`);
    }
  }

  /**
   * Deletes a user by their ID.
   * Returns the deleted user or null if not found.
   */
  async deleteById(userId: string): Promise<User | null> {
    try {
      const deletedUser = await this.client.user.delete({
        where: { id: userId },
      });
      return deletedUser;
    } catch (error) {
        // Prisma throws P2025 if the record to delete is not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        console.warn(`User with ID ${userId} not found for deletion.`);
        return null; // Return null if user didn't exist
      }
      console.error(`Error deleting user ID ${userId}:`, error);
       // Re-throw or handle as appropriate
      throw new Error(`Failed to delete user ${userId}`);
    }
  }
}