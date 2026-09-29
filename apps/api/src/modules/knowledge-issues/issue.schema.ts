import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
export const rangeInput = z.object({ days: z.coerce.number().int().refine(n => [7, 30, 90].includes(n)).optional(), from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional() });
export type DateRange = {
    from: Date;
    to: Date;
};
export function dateRange(input: unknown = {}, now = new Date()): DateRange {
    const parsed = rangeInput.safeParse(input);
    if (!parsed.success)
        throw new AppError("Invalid analytics date range", 400);
    const { days = 30, from, to } = parsed.data;
    if (!!from !== !!to || (from && parsed.data.days))
        throw new AppError("Supply either days or both from/to", 400);
    const end = to ? new Date(to) : now, start = from ? new Date(from) : new Date(end.getTime() - days * 86400000);
    if (start >= end || end.getTime() - start.getTime() > 90 * 86400000 || end.getTime() > now.getTime() + 60000)
        throw new AppError("Date range must be ordered, at most 90 days, and not in the future", 400);
    return { from: start, to: end };
}
export const issueCommand = z.object({ expectedRevision: z.number().int().nonnegative(), status: z.enum(["DETECTED", "REVIEWING", "FIX_PROPOSED", "PUBLISHED", "VERIFIED", "DISMISSED"]).optional(), assignedToUserId: z.string().min(1).nullable().optional(), candidateVersionId: z.string().min(1).optional(), note: z.string().trim().min(1).max(2000).optional(), dismissalReason: z.enum(["NOT_A_KNOWLEDGE_PROBLEM", "DUPLICATE", "EXPECTED_BEHAVIOR", "OTHER"]).optional() }).strict();
export const listInput = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), status: z.enum(["DETECTED", "REVIEWING", "FIX_PROPOSED", "PUBLISHED", "VERIFIED", "DISMISSED"]).optional(), severity: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(), assignee: z.string().min(1).optional(), versionId: z.string().min(1).optional() });
