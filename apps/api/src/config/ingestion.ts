import { z } from "zod";
const schema = z.object({
    KNOWLEDGE_STORAGE: z.enum(["filesystem", "s3"]).default("filesystem"),
    KNOWLEDGE_STORAGE_ROOT: z.string().default("./data/knowledge"),
    KNOWLEDGE_MAX_BYTES: z.coerce.number().int().min(1024).max(25 * 1024 * 1024).default(10 * 1024 * 1024),
    S3_BUCKET: z.string().optional(), S3_REGION: z.string().default("us-east-1"), S3_ENDPOINT: z.string().url().optional(),
    S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
    INGESTION_LEASE_MS: z.coerce.number().int().min(30000).max(3600000).default(120000),
    INGESTION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
    INGESTION_EMBEDDING_BATCH: z.coerce.number().int().min(1).max(8).default(4),
    INGESTION_REQUIRE_SEMANTIC: z.enum(["true", "false"]).default("false")
});
export const ingestionConfig = schema.parse(process.env);
if (ingestionConfig.KNOWLEDGE_STORAGE === "s3" && !ingestionConfig.S3_BUCKET)
    throw new Error("S3_BUCKET required");
if (process.env.NODE_ENV === "production" && (ingestionConfig.KNOWLEDGE_STORAGE !== "s3" || (ingestionConfig.S3_ENDPOINT && !ingestionConfig.S3_ENDPOINT.startsWith("https://"))))
    throw new Error("Production requires private S3 storage over TLS");
