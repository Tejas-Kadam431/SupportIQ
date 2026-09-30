import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { ingestionConfig as config } from "../config/ingestion.js";
import { IngestionFailure, metric } from "./operations.js";
export interface ObjectStorage {
    put(key: string, bytes: Buffer, mime: string): Promise<void>;
    get(key: string): Promise<Buffer>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    list(cursor?: string): Promise<{
        objects: {
            key: string;
            modified: Date;
        }[];
        cursor?: string;
    }>;
}
export function objectKey() { return "knowledge/" + randomUUID(); }
export function validateKey(key: string) { if (!/^knowledge\/[a-zA-Z0-9-]{1,80}$/.test(key))
    throw new IngestionFailure("INVALID_FILE", false); return key; }
export class FileObjectStorage implements ObjectStorage {
    constructor(private root: string) { }
    private file(key: string) { return path.join(path.resolve(this.root), validateKey(key)); }
    async put(key: string, bytes: Buffer) { const file = this.file(key); try {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, bytes, { flag: "wx" });
    }
    catch {
        metric("storage_upload_failure");
        throw new IngestionFailure("STORAGE_UNAVAILABLE", true);
    } }
    async get(key: string) { const file = this.file(key); try {
        const handle = await fs.open(file, "r");
        try {
            if ((await handle.stat()).size > config.KNOWLEDGE_MAX_BYTES)
                throw new IngestionFailure("INVALID_FILE", false);
            return await handle.readFile();
        }
        finally {
            await handle.close();
        }
    }
    catch (error) {
        metric("storage_read_failure");
        if (error instanceof IngestionFailure)
            throw error;
        throw new IngestionFailure((error as NodeJS.ErrnoException).code === "ENOENT" ? "SOURCE_MISSING" : "STORAGE_UNAVAILABLE", (error as NodeJS.ErrnoException).code !== "ENOENT");
    } }
    async delete(key: string) { await fs.rm(this.file(key), { force: true }); }
    async exists(key: string) { try {
        await fs.access(this.file(key));
        return true;
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return false;
        throw new IngestionFailure("STORAGE_UNAVAILABLE", true);
    } }
    async list(cursor?: string) { const dir = path.join(path.resolve(this.root), "knowledge"); let names: string[]; try {
        names = (await fs.readdir(dir)).sort();
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return { objects: [] };
        throw error;
    } const page = names.filter(n => !cursor || n > cursor).slice(0, 100); const objects = []; for (const name of page) {
        if (/^[a-zA-Z0-9-]{1,80}$/.test(name))
            objects.push({ key: "knowledge/" + name, modified: (await fs.stat(path.join(dir, name))).mtime });
    } return { objects, ...(page.length === 100 ? { cursor: page.at(-1)! } : {}) }; }
}
export class S3ObjectStorage implements ObjectStorage {
    constructor(private client: S3Client, private bucket: string) { }
    private input(key: string) { return { Bucket: this.bucket, Key: validateKey(key) }; }
    async put(key: string, bytes: Buffer, mime: string) { try {
        await this.client.send(new PutObjectCommand({ ...this.input(key), Body: bytes, ContentType: mime, IfNoneMatch: "*" }), { abortSignal: AbortSignal.timeout(10000) });
    }
    catch {
        metric("storage_upload_failure");
        throw new IngestionFailure("STORAGE_UNAVAILABLE", true);
    } }
    async get(key: string) { try {
        const result = await this.client.send(new GetObjectCommand(this.input(key)), { abortSignal: AbortSignal.timeout(10000) });
        if (!result.Body)
            throw new IngestionFailure("SOURCE_MISSING", false);
        const stream = result.Body.transformToWebStream();
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                const part = await reader.read();
                if (part.done)
                    break;
                size += part.value.length;
                if (size > config.KNOWLEDGE_MAX_BYTES)
                    throw new IngestionFailure("INVALID_FILE", false);
                chunks.push(part.value);
            }
        }
        finally {
            await reader.cancel();
        }
        return Buffer.concat(chunks);
    }
    catch (error) {
        metric("storage_read_failure");
        if (error instanceof IngestionFailure)
            throw error;
        const missing = (error as {
            $metadata?: {
                httpStatusCode?: number;
            };
        }).$metadata?.httpStatusCode === 404;
        throw new IngestionFailure(missing ? "SOURCE_MISSING" : "STORAGE_UNAVAILABLE", !missing);
    } }
    async delete(key: string) { await this.client.send(new DeleteObjectCommand(this.input(key)), { abortSignal: AbortSignal.timeout(10000) }); }
    async exists(key: string) { try {
        await this.client.send(new HeadObjectCommand(this.input(key)), { abortSignal: AbortSignal.timeout(5000) });
        return true;
    }
    catch (error) {
        if ((error as {
            $metadata?: {
                httpStatusCode?: number;
            };
        }).$metadata?.httpStatusCode === 404)
            return false;
        throw new IngestionFailure("STORAGE_UNAVAILABLE", true);
    } }
    async list(cursor?: string) { const result = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: "knowledge/", MaxKeys: 100, ContinuationToken: cursor }), { abortSignal: AbortSignal.timeout(5000) }); return { objects: (result.Contents ?? []).filter(o => o.Key && o.LastModified).map(o => ({ key: o.Key!, modified: o.LastModified! })), ...(result.NextContinuationToken ? { cursor: result.NextContinuationToken } : {}) }; }
}
let storage: ObjectStorage | undefined;
export function getObjectStorage() { return storage ??= config.KNOWLEDGE_STORAGE === "filesystem" ? new FileObjectStorage(config.KNOWLEDGE_STORAGE_ROOT) : new S3ObjectStorage(new S3Client({ region: config.S3_REGION, ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT } : {}), forcePathStyle: config.S3_FORCE_PATH_STYLE === "true", maxAttempts: 2 }), config.S3_BUCKET!); }
