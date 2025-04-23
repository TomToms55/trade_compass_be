import { PrismaClient } from '@prisma/client';

// Create a single instance of the Prisma Client
// This instance can be reused throughout the application.
const prisma = new PrismaClient();

// Optional: Add logging or connection lifecycle hooks if needed
// prisma.$connect().catch(e => console.error('Failed to connect to database', e));

// Optional: Graceful shutdown
// async function shutdown() {
//   await prisma.$disconnect();
// }
// process.on('SIGINT', shutdown);
// process.on('SIGTERM', shutdown);

export default prisma; 