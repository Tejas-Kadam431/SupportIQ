import type { KnowledgeIssueStatus } from "@prisma/client";
import { AppError } from "../../common/errors/AppError.js";
const transitions: Record<KnowledgeIssueStatus, KnowledgeIssueStatus[]> = {
    DETECTED: ["REVIEWING", "DISMISSED"], REVIEWING: ["FIX_PROPOSED", "DISMISSED"],
    FIX_PROPOSED: ["REVIEWING", "PUBLISHED", "DISMISSED"], PUBLISHED: ["REVIEWING", "DISMISSED"],
    DISMISSED: ["REVIEWING"], VERIFIED: []
};
export function assertIssueTransition(from: KnowledgeIssueStatus, to: KnowledgeIssueStatus) {
    if (!transitions[from].includes(to))
        throw new AppError("Invalid knowledge issue transition; verification is reserved for Reliability Lab", 409);
}
