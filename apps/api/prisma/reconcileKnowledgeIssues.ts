import { prisma } from "../src/config/prisma.js";
import { reconcileKnowledgeSignals } from "../src/modules/knowledge-issues/issue.service.js";
// One bounded batch per invocation. Restart from the beginning to discover late
// terminal evaluations on previously scanned runs; uniqueness makes this safe.
const [organizationId, afterId, rawLimit = "100"] = process.argv.slice(2);
try {
    if (!organizationId)
        throw new Error("Usage: reconcileKnowledgeIssues.ts <organizationId> [afterId] [limit<=500]");
    console.log(JSON.stringify(await reconcileKnowledgeSignals(organizationId, afterId || undefined, Number(rawLimit))));
}
finally {
    await prisma.$disconnect();
}
