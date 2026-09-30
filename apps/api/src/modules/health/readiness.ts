import { Redis } from "ioredis";
import { prisma } from "../../config/prisma.js";
import { redisConnection } from "../../config/redis.js";
import { getObjectStorage } from "../../common/storage.js";
export async function componentState(check: () => Promise<unknown>, timeoutMs = 3000) { let timer: NodeJS.Timeout | undefined; try {
    await Promise.race([check(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), timeoutMs); })]);
    return "ready";
}
catch {
    return "unavailable";
}
finally {
    if (timer)
        clearTimeout(timer);
} }
export async function readiness() {
    const client = new Redis({ ...redisConnection, lazyConnect: true, maxRetriesPerRequest: 0, enableOfflineQueue: false, retryStrategy: () => null, commandTimeout: 2000 });
    client.on("error", () => { });
    const [database, redis, storage] = await Promise.all([componentState(() => prisma.$queryRaw `SELECT 1`), componentState(async () => { try {
            await client.connect();
            await client.ping();
        }
        finally {
            client.disconnect();
        } }), componentState(() => getObjectStorage().list())]);
    client.disconnect();
    return { ready: [database, redis, storage].every(s => s === "ready"), components: { database, redis, storage } };
}
