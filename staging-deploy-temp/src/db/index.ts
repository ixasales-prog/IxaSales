import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Connection pool
const connectionString = process.env.DATABASE_URL!;

// For migrations and one-off queries
export const migrationClient = postgres(connectionString, { max: 1 });

// For application queries (pooled)
const queryClient = postgres(connectionString);

// Drizzle instance with schema
export const db = drizzle(queryClient, { schema });

// Export schema for use in queries
export { schema };
