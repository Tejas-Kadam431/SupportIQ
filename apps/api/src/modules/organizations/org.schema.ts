import { z } from "zod";

export const roleSchema = z.enum(["OWNER", "ADMIN", "AGENT", "CUSTOMER"]);

export const createOrganizationSchema = z.object({
  body: z.object({
    name: z.string().min(2, "Organization name must be at least 2 characters")
  })
});

export const orgIdParamSchema = z.object({
  params: z.object({
    orgId: z.string().min(1)
  })
});

export const updateOrganizationSchema = z.object({
  params: z.object({
    orgId: z.string().min(1)
  }),
  body: z.object({
    name: z.string().min(2).optional()
  })
});

export const addMemberSchema = z.object({
  params: z.object({
    orgId: z.string().min(1)
  }),
  body: z.object({
    email: z.string().email(),
    role: roleSchema.exclude(["OWNER"])
  })
});

export const updateMemberRoleSchema = z.object({
  params: z.object({
    orgId: z.string().min(1),
    memberId: z.string().min(1)
  }),
  body: z.object({
    role: roleSchema.exclude(["OWNER"])
  })
});

export const memberParamSchema = z.object({
  params: z.object({
    orgId: z.string().min(1),
    memberId: z.string().min(1)
  })
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>["body"];
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>["body"];
export type AddMemberInput = z.infer<typeof addMemberSchema>["body"];
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>["body"];