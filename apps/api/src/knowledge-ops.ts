import { prisma } from "./config/prisma.js";
import { importLegacySource } from "./modules/knowledge-base/kb.source-import.js";
import { reconcileKnowledge, inspectOrphanObjects, auditSourceObjects } from "./modules/knowledge-base/kb.reconcile.js";
import { log } from "./common/operations.js";
const [operation, argument, root] = process.argv.slice(2);
try {
    if (operation === "import-source" && argument && root)
        console.log(JSON.stringify(await importLegacySource(argument, root)));
    else if (operation === "reconcile")
        console.log(JSON.stringify(await reconcileKnowledge(argument)));
    else if (operation === "audit-sources")
        console.log(JSON.stringify(await auditSourceObjects(argument)));
    else if (operation === "inspect-orphans")
        console.log(JSON.stringify(await inspectOrphanObjects(argument)));
    else
        throw new Error("Usage: knowledge-ops import-source VERSION_ID LEGACY_ROOT | reconcile [CURSOR] | inspect-orphans [CURSOR]");
}
catch {
    log("operations.failed");
    process.exitCode = 1;
}
finally {
    await prisma.$disconnect();
}
