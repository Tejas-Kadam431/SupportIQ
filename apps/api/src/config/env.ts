import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional()
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),

  GEMINI_API_KEY: optionalNonEmptyString,

  GEMINI_MODEL: z.preprocess(
    (value) => (value === "" || value === undefined ? "gemini-2.5-flash" : value),
    z.string()
  ),

  OPENAI_API_KEY: optionalNonEmptyString,

  OPENAI_MODEL: z.preprocess(
    (value) => (value === "" || value === undefined ? "gpt-4o-mini" : value),
    z.string()
  ),

  OPENAI_EMBEDDING_MODEL: z.preprocess(
    (value) =>
      value === "" || value === undefined ? "text-embedding-3-small" : value,
    z.string()
  )
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    "Invalid environment variables:",
    parsedEnv.error.flatten().fieldErrors
  );
  process.exit(1);
}

export const env = parsedEnv.data;