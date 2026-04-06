import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/schema.pg.ts",
  out: "./migrations/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
