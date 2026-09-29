import { captureContext, classifyReply, contextFingerprint, contextSelection, inputSnapshotSchema } from "../modules/ai/ai.provenance.js";
import { sendCopilotBody, rejectCopilotBody } from "../modules/ai/ai.schema.js";

test.each([
  ["Hello", "Hello", "ACCEPTED"], [" Hello\n", "\tHello ", "ACCEPTED"],
  ["Hello world", "Hello  world", "EDITED"], ["Hello\nworld", "Hello\r\nworld", "EDITED"],
  ["Hello", "New answer", "EDITED"]
])("classifies %j -> %j with explicit outer-whitespace policy", (original, final, disposition) => {
  expect(classifyReply(original, final)).toEqual({ body: final.trim(), disposition,
    originalCharCount: original.trim().length, finalCharCount: final.trim().length });
});

test("client cannot submit its own disposition or use standalone ACCEPTED feedback", () => {
  expect(sendCopilotBody.safeParse({ finalMessage: "Reply", disposition: "ACCEPTED" }).success).toBe(false);
  expect(rejectCopilotBody.safeParse({ disposition: "ACCEPTED" }).success).toBe(false);
  expect(sendCopilotBody.safeParse({ finalMessage: "   " }).success).toBe(false);
  expect(rejectCopilotBody.safeParse({ disposition: "REJECTED", reason: "OTHER", finalMessage: "reply" }).success).toBe(false);
});

test("selection uses newest ten with stable id tie-break and bounded chronological snapshot", () => {
  expect(contextSelection.messages).toMatchObject({ take: 10, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  const context = captureContext({ title: "a".repeat(1100), description: "b".repeat(13000), status: "OPEN", priority: "HIGH",
    customer: { name: "Customer" }, messages: [2, 1].map(i => ({ id: `m${i}`, body: `Message ${i}`, createdAt: new Date(i), sender: { name: "Agent" } })) });
  expect(context.conversation.map(m => m.messageId)).toEqual(["m1", "m2"]);
  expect(context.ticket.title).toHaveLength(1000); expect(context.ticket.description).toHaveLength(12000);
  expect(inputSnapshotSchema.safeParse({ ...context, tone: "PROFESSIONAL", retrievalQuery: "query" }).success).toBe(true);
  expect(contextFingerprint(context)).not.toBe(contextFingerprint({ ...context, conversation: [] }));
});

test("Stage D pending-run fingerprint remains compatible with historical context shape", () => {
 const context=captureContext({title:"t",description:"d",status:"OPEN",priority:"LOW",customer:{name:"C"},messages:[]});
 expect(contextFingerprint(context,"legacy-v1")).toBe(contextFingerprint(context));
 const messageContext={...context,conversation:[{isCustomer:true,messageId:"m",senderName:"C",content:"body",createdAt:new Date(0).toISOString()}]};
 expect(contextFingerprint(messageContext,"legacy-v1")).not.toBe(contextFingerprint(messageContext));
});
