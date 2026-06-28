import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware.js";
import { validate } from "../../common/middleware/validate.middleware.js";
import { asyncHandler } from "../../common/utils/asyncHandler.js";
import { createMessageHandler, listMessagesHandler } from "./message.controller.js";
import { createMessageSchema, ticketIdParamSchema } from "./message.schema.js";
import { blockDemoWrites } from "../../common/middleware/demoReadOnly.middleware.js";

export const messageRoutes = Router({
  mergeParams: true
});

messageRoutes.use(authenticate);

messageRoutes.get(
  "/",
  validate(ticketIdParamSchema),
  asyncHandler(listMessagesHandler)
);

messageRoutes.post(
  "/",
  blockDemoWrites(),
  validate(createMessageSchema),
  asyncHandler(createMessageHandler)
);