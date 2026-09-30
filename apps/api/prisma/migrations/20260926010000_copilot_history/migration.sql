-- Legacy runs/decisions remain version 0: never invent historical inputs/message links.
ALTER TABLE "CopilotRun"
 ADD COLUMN "provenanceVersion" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "triggeredByIdentity" TEXT,
 ADD COLUMN "status" TEXT NOT NULL DEFAULT 'LEGACY',
 ADD COLUMN "model" TEXT,
 ADD COLUMN "promptVersion" TEXT,
 ADD COLUMN "retrievalVersion" TEXT,
 ADD COLUMN "evidencePolicyVersion" TEXT,
 ADD COLUMN "generationPath" TEXT,
 ADD COLUMN "generationDurationMs" INTEGER,
 ADD COLUMN "startedAt" TIMESTAMP(3),
 ADD COLUMN "completedAt" TIMESTAMP(3),
 ADD COLUMN "contextFingerprint" TEXT,
 ADD COLUMN "inputSnapshot" JSONB,
 ADD COLUMN "promptSnapshot" JSONB,
 ADD COLUMN "outputSnapshot" JSONB,
 ADD COLUMN "generationConfig" JSONB,
 ADD COLUMN "providerMetadata" JSONB;

ALTER TABLE "CopilotEvaluation"
 ADD COLUMN "integrityVersion" INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN "messageId" TEXT,
 ADD COLUMN "originalReply" TEXT,
 ADD COLUMN "evaluatorIdentity" TEXT,
 ADD COLUMN "originalCharCount" INTEGER,
 ADD COLUMN "finalCharCount" INTEGER;
CREATE UNIQUE INDEX "CopilotEvaluation_messageId_key" ON "CopilotEvaluation"("messageId");
ALTER TABLE "CopilotEvaluation" ADD CONSTRAINT "CopilotEvaluation_messageId_fkey"
 FOREIGN KEY ("messageId") REFERENCES "TicketMessage"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "CopilotEvaluation" ADD CONSTRAINT "CopilotEvaluation_terminal_shape"
 CHECK ("integrityVersion" = 0 OR (
   "integrityVersion" = 1 AND "evaluatorIdentity" IS NOT NULL AND
   (("disposition" = 'REJECTED' AND "messageId" IS NULL AND "finalMessage" IS NULL AND "reason" IS NOT NULL)
    OR ("disposition" IN ('ACCEPTED', 'EDITED') AND "messageId" IS NOT NULL AND "finalMessage" IS NOT NULL AND "originalReply" IS NOT NULL))
 ));

-- Preserve snapshot history while allowing existing User SET NULL retention behavior.
CREATE FUNCTION supportiq_immutable_copilot_run() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW) - 'triggeredById') IS DISTINCT FROM (to_jsonb(OLD) - 'triggeredById')
    OR (NEW."triggeredById" IS DISTINCT FROM OLD."triggeredById" AND NEW."triggeredById" IS NOT NULL) THEN
   RAISE EXCEPTION 'Copilot run history is immutable' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER copilot_run_immutable BEFORE UPDATE ON "CopilotRun"
 FOR EACH ROW EXECUTE FUNCTION supportiq_immutable_copilot_run();

CREATE FUNCTION supportiq_immutable_copilot_decision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW) - 'evaluatorId') IS DISTINCT FROM (to_jsonb(OLD) - 'evaluatorId')
    OR (NEW."evaluatorId" IS DISTINCT FROM OLD."evaluatorId" AND NEW."evaluatorId" IS NOT NULL) THEN
   RAISE EXCEPTION 'Copilot decision history is immutable' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER copilot_decision_immutable BEFORE UPDATE ON "CopilotEvaluation"
 FOR EACH ROW EXECUTE FUNCTION supportiq_immutable_copilot_decision();

CREATE FUNCTION supportiq_check_copilot_message() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE run "CopilotRun"%ROWTYPE; sent "TicketMessage"%ROWTYPE;
BEGIN
 IF NEW."integrityVersion" = 1 THEN
   SELECT * INTO STRICT run FROM "CopilotRun" WHERE id = NEW."copilotRunId";
   IF NEW."originalReply" IS DISTINCT FROM run."suggestedReply" THEN
     RAISE EXCEPTION 'Original suggestion mismatch' USING ERRCODE = '23514';
   END IF;
   IF NEW."messageId" IS NOT NULL THEN
     SELECT * INTO STRICT sent FROM "TicketMessage" WHERE id = NEW."messageId";
     IF run.abstained OR run."provenanceVersion" <> 1 OR sent."ticketId" <> run."ticketId"
       OR sent.body IS DISTINCT FROM NEW."finalMessage" OR sent."senderId" IS DISTINCT FROM NEW."evaluatorIdentity"
       OR NEW."evaluatorId" IS DISTINCT FROM NEW."evaluatorIdentity" THEN
       RAISE EXCEPTION 'Copilot message linkage mismatch' USING ERRCODE = '23514';
     END IF;
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER copilot_message_link BEFORE INSERT ON "CopilotEvaluation"
 FOR EACH ROW EXECUTE FUNCTION supportiq_check_copilot_message();

CREATE FUNCTION supportiq_protect_copilot_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.body, NEW."ticketId", NEW."senderId") IS DISTINCT FROM (OLD.body, OLD."ticketId", OLD."senderId")
    AND EXISTS (SELECT 1 FROM "CopilotEvaluation" WHERE "messageId" = OLD.id) THEN
   RAISE EXCEPTION 'Sent Copilot message history is immutable' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER copilot_sent_message_immutable BEFORE UPDATE ON "TicketMessage"
 FOR EACH ROW EXECUTE FUNCTION supportiq_protect_copilot_message();
