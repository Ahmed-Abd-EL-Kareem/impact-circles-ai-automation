import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Global declaration for singleton in development to prevent exhausting pool connections
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};

const connectionString =
  process.env.DATABASE_URL ||
  (process.env.NODE_ENV === "test" || !process.env.DATABASE_URL
    ? "postgresql://placeholder:placeholder@localhost:5432/placeholder"
    : undefined);

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured in environment variables.");
}

const pool =
  globalForPrisma.pgPool ??
  new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
  });

const adapter = new PrismaPg(pool);

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// In development, invalidate cached PrismaClient if schema was updated with new models
const cachedPrisma = globalForPrisma.prisma;
const isCachedClientStale =
  !cachedPrisma ||
  !("contentPost" in cachedPrisma) ||
  !("publishingLog" in cachedPrisma) ||
  !("expense" in cachedPrisma);

export const prisma = isCachedClientStale ? createPrismaClient() : cachedPrisma;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
}

export default prisma;
