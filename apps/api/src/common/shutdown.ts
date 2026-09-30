import { log } from "./operations.js";
export async function boundedShutdown(close: () => Promise<unknown>, force: () => void, timeoutMs = 30000) {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([close().then(() => "closed" as const), new Promise<"forced">((resolve) => { timer = setTimeout(() => { log("shutdown.timeout"); force(); resolve("forced"); }, timeoutMs); })]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
export function installShutdown(close: () => Promise<unknown>) { let stopping = false; const handle = () => { if (stopping)
    return; stopping = true; void boundedShutdown(close, () => process.exit(1)).then(() => process.exit(0)).catch(() => process.exit(1)); }; process.once("SIGTERM", handle); process.once("SIGINT", handle); }
