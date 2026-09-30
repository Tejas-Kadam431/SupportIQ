import type { RedisOptions } from "ioredis";
const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
if (!["redis:", "rediss:"].includes(url.protocol))
    throw new Error("Invalid Redis protocol");
export const redisConnection: RedisOptions = { host: url.hostname, port: Number(url.port || 6379), username: decodeURIComponent(url.username) || undefined, password: decodeURIComponent(url.password) || undefined, db: Number(url.pathname.slice(1) || 0), ...(url.protocol === "rediss:" ? { tls: {} } : {}), maxRetriesPerRequest: null, connectTimeout: 3000 };
