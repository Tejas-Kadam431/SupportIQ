import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../config/prisma.js";
import { contentHash } from "../../common/utils/contentHash.js";
import { getObjectStorage, objectKey } from "../../common/storage.js";
import { ingestionConfig } from "../../config/ingestion.js";
import { log, IngestionFailure } from "../../common/operations.js";
// Offline operator migration: never accepts a source path from HTTP. Published version rows remain untouched.
export async function importLegacySource(versionId: string, legacyRoot: string) {
    const version = await prisma.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: versionId }, include: { sourceObject: true } });
    if (version.sourceObject)
        return { status: "ALREADY_MAPPED" };
    const root = await fs.realpath(legacyRoot), file = await fs.realpath(version.storageRef), relative = path.relative(root, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !relative)
        throw new IngestionFailure("INVALID_FILE", false);
    if ((await fs.stat(file)).size > ingestionConfig.KNOWLEDGE_MAX_BYTES)
        throw new IngestionFailure("INVALID_FILE", false);
    const bytes = await fs.readFile(file);
    if (!version.sourceHash || contentHash(bytes) !== version.sourceHash)
        throw new IngestionFailure("SOURCE_CHANGED", false);
    const key = objectKey(), storage = getObjectStorage();
    await storage.put(key, bytes, version.mimeType);
    try {
        await prisma.knowledgeSourceObject.create({ data: { versionId, objectKey: key, backend: ingestionConfig.KNOWLEDGE_STORAGE } });
        await prisma.knowledgeIngestion.updateMany({where:{versionId,stage:"FAILED",errorCategory:"SOURCE_MISSING"},data:{retryable:true}});
        return { status: "IMPORTED" };
    }
    catch (error) {
        try {
            if (!await prisma.knowledgeSourceObject.findUnique({ where: { objectKey: key } }))
                await storage.delete(key);
        }
        catch {
            log("storage.compensation_deferred", { knowledgeVersionId: versionId });
        }
        throw error;
    }
}
