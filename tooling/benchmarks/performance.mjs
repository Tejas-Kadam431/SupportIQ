import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
const require=createRequire(process.cwd()+'/package.json'),{Client}=require('pg');
const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();
const dbTarget=new URL(process.env.DATABASE_URL ?? '');
if(process.env.SUPPORTIQ_BENCHMARK !== 'LOCAL_SYNTHETIC' || !['localhost','127.0.0.1'].includes(dbTarget.hostname) || !['supportiq_test','supportiq_e2e','supportiq_demo'].includes(dbTarget.pathname.slice(1))) throw Error('Benchmark requires explicit LOCAL_SYNTHETIC opt-in and a local disposable database');
const prefix='stage-j-bench-'+Date.now(),u=prefix+'-u',o=prefix+'-o';
try{
 await c.query('BEGIN');
 await c.query(`INSERT INTO "User"(id,email,name,"passwordHash","updatedAt") VALUES($1,$2,'Benchmark','fixture',now())`,[u,u+'@test.invalid']);
 await c.query(`INSERT INTO "Organization"(id,name,slug,"ownerId","updatedAt") VALUES($1,'Stage G benchmark',$1,$2,now());`,[o,u]);
 await c.query(`INSERT INTO "OrganizationMember"(id,"organizationId","userId",role,"updatedAt") VALUES($1,$2,$3,'OWNER',now())`,[prefix+'-m',o,u]);
 await c.query(`INSERT INTO "Ticket"(id,"organizationId","customerId",title,description,"updatedAt") SELECT $1||'-t-'||i,$2,$3,'Benchmark','Fixture',now() FROM generate_series(0,999) i`,[prefix,o,u]);
 await c.query(`INSERT INTO "KnowledgeDocument"(id,"organizationId","uploadedById","fileName","originalName","mimeType","sizeBytes","storagePath","updatedAt") SELECT $1||'-d-'||i,$2,$3,'fixture','Policy '||i,'text/plain',1000,'fixture',now() FROM generate_series(0,49) i`,[prefix,o,u]);
 await c.query(`INSERT INTO "KnowledgeDocumentVersion"(id,"documentId","versionNumber",status,"originalName","mimeType","sizeBytes","storageRef","createdByIdentity","contentHash","semanticIndexedChunks") SELECT $1||'-v-'||i,$1||'-d-'||i,1,'READY','Policy '||i,'text/plain',1000,'fixture',$2,'fixture',0 FROM generate_series(0,49) i`,[prefix,u]);
 await c.query(`INSERT INTO "KnowledgeChunk"(id,"documentId","documentVersionId","organizationId",content,"contentHash","chunkIndex","tokenCount","updatedAt") SELECT $1||'-c-'||i||'-'||j,$1||'-d-'||i,$1||'-v-'||i,$2,'Annual refunds',encode(sha256(convert_to('Annual refunds','UTF8')),'hex'),j,2,now() FROM generate_series(0,49) i CROSS JOIN generate_series(0,1) j`,[prefix,o]);
 await c.query(`UPDATE "KnowledgeDocumentVersion" SET status='PUBLISHED',"publishedAt"=now() WHERE "createdByIdentity"=$1`,[u]);
 await c.query(`UPDATE "KnowledgeDocument" SET "currentPublishedVersionId"=$1||'-v-'||split_part(id,'-d-',2) WHERE "organizationId"=$2`,[prefix,o]);
 await c.query(`INSERT INTO "CopilotRun"(id,"organizationId","ticketId",provider,confidence,tone,topic,"issueSummary","missingInformation","recommendedAction","searchQuery","searchMode","sourceCount",sources,warnings,"evidencePolicyVersion","outputSnapshot","generationDurationMs","providerMetadata")
 SELECT $1||'-r-'||i,$2,$1||'-t-'||(i%1000),'fallback','LOW','PROFESSIONAL','Refund topic '||(i%300),'Fixture','[]','Review','refund','keyword',2,
 (SELECT jsonb_agg(jsonb_build_object('documentId',$1||'-d-'||(i%50),'documentVersionId',$1||'-v-'||(i%50),'versionNumber',1,'documentName','Refund Policy','chunkId',$1||'-c-'||(i%50)||'-'||j,'evidenceEligible',true,'content',repeat('Annual refund eligibility policy ',35))) FROM generate_series(0,1) j),
 '[]','evidence-v2','{"evidenceDecision":"ANSWER_SUPPORTED"}',1200,'{"retrieval":{"semanticStatus":"OK","lexicalStatus":"OK"},"attempts":[]}' FROM generate_series(1,20000) i`,[prefix,o]);
 await c.query(`INSERT INTO "CopilotKnowledgeSource"("copilotRunId","documentVersionId","chunkId") SELECT $1||'-r-'||i,$1||'-v-'||(i%50),$1||'-c-'||(i%50)||'-'||j FROM generate_series(1,20000) i CROSS JOIN generate_series(0,1) j`,[prefix]);
 await c.query(`INSERT INTO "CopilotEvaluation"(id,"copilotRunId",disposition,reason,"updatedAt") SELECT $1||'-e-'||i,$1||'-r-'||i,CASE WHEN i%6=0 THEN 'REJECTED'::"CopilotDisposition" WHEN i%6=2 THEN 'EDITED'::"CopilotDisposition" ELSE 'ACCEPTED'::"CopilotDisposition" END,CASE WHEN i%6=0 THEN 'WRONG_KNOWLEDGE'::"CopilotFailureReason" WHEN i%6=2 THEN 'BAD_TONE'::"CopilotFailureReason" ELSE NULL END,now() FROM generate_series(2,20000,2) i`,[prefix]);
 await c.query(`INSERT INTO "KnowledgeIssue"(id,"organizationId","groupingKey","normalizedTopic",title,reason,"updatedAt") SELECT $1||'-i-'||i,$2,'benchmark-'||i,'Refund '||i,'Refund '||i,'WRONG_KNOWLEDGE',now() FROM generate_series(0,299) i`,[prefix,o]);
 await c.query(`INSERT INTO "KnowledgeIssueSignal"(id,"issueId","copilotRunId",reason,"classifierVersion","occurredAt") SELECT $1||'-s-'||i,$1||'-i-'||((i/6)%300),$1||'-r-'||i,'WRONG_KNOWLEDGE','knowledge-signal-v1',now() FROM generate_series(6,12000,6) i`,[prefix]);
 await c.query(`INSERT INTO "KnowledgeIssueSource"("signalId","documentVersionId",attributed) SELECT $1||'-s-'||i,$1||'-v-'||(i%50),true FROM generate_series(6,12000,6) i`,[prefix]);
 await c.query('COMMIT');
 for(const table of ['CopilotRun','CopilotEvaluation','CopilotKnowledgeSource','KnowledgeIssue','KnowledgeIssueSignal','KnowledgeIssueSource'])await c.query('ANALYZE "'+table+'"');
 const {prisma}=await import(pathToFileURL(process.cwd()+'/dist/src/config/prisma.js'));
 const {qualityOverview,listIssues,sourceHealth}=await import(pathToFileURL(process.cwd()+'/dist/src/modules/knowledge-issues/quality.service.js'));

 const {listTickets,getTicketDetails}=await import(pathToFileURL(process.cwd()+'/dist/src/modules/tickets/ticket.service.js'));
 const {getOrganizationDashboard}=await import(pathToFileURL(process.cwd()+'/dist/src/modules/dashboard/dashboard.service.js'));
 const {listQualityRuns}=await import(pathToFileURL(process.cwd()+'/dist/src/modules/knowledge-issues/quality.service.js'));
 const {retrieveHybrid}=await import(pathToFileURL(process.cwd()+'/dist/src/modules/knowledge-base/kb.hybrid.js'));
 const {getVersionHistory}=await import(pathToFileURL(process.cwd()+'/dist/src/modules/knowledge-base/kb.version.service.js'));
 const {dispatchKnowledgeOutbox}=await import(pathToFileURL(process.cwd()+'/dist/src/modules/knowledge-base/kb.outbox.js'));
 const {reconcileKnowledge}=await import(pathToFileURL(process.cwd()+'/dist/src/modules/knowledge-base/kb.reconcile.js'));
 const {createExperiment}=await import(pathToFileURL(process.cwd()+'/dist/src/modules/reliability/replay.service.js'));
 const {executeExperiment}=await import(pathToFileURL(process.cwd()+'/dist/src/modules/reliability/replay.execution.js'));
 const input={ticket:{title:'Annual refunds',description:'Annual refunds',status:'OPEN',priority:'MEDIUM',customerName:'Synthetic'},conversation:[],tone:'PROFESSIONAL',retrievalQuery:'Annual refunds'};
 const baseline={decision:'INSUFFICIENT_KNOWLEDGE',evidenceLevel:'WEAK',sources:[],suggestedReply:null,disposition:null,reason:null,finalMessage:null};
 const suite=await prisma.evaluationSuite.create({data:{organizationId:o,name:'50-case local synthetic benchmark',actorIdentity:u,sampling:{source:'SYNTHETIC_BENCHMARK'},cases:{create:Array.from({length:50},(_,i)=>({historicalCopilotRunId:prefix+'-r-'+(i+1),kind:'HISTORICAL',input,baseline}))}}});
 const times={};try{for(const [name,fn] of [
 ['ticketList',()=>listTickets(u,o,{})],['ticketDetail',()=>getTicketDetails(u,prefix+'-t-0')],
 ['dashboard',()=>getOrganizationDashboard(u,o)],['overview',()=>qualityOverview(u,o)],['issues',()=>listIssues(u,o)],['sources',()=>sourceHealth(u,o)],
 ['runs',()=>listQualityRuns(u,o)],['hybridProviderFree',()=>retrieveHybrid(o,'Annual refunds')],['versionHistory',()=>getVersionHistory(u,o,prefix+'-d-0')],
 ['outboxEmptyScan',()=>dispatchKnowledgeOutbox(async()=>{},1)],['reconcilePage',()=>reconcileKnowledge()],
 ['replay50',async()=>{const e=await createExperiment(u,o,{name:'Benchmark',suiteId:suite.id,purpose:'GENERAL_COMPARISON',generation:false,hybrid:false});const result=await executeExperiment(u,o,e.id);if(result.results.length!==50||result.status!=='COMPLETED'||result.results.some(r=>r.classification==='ERROR'))throw Error('Replay benchmark did not successfully complete all 50 cases');return result;}]
 ]){times[name]=[];for(let i=0;i<3;i++){const start=performance.now();const result=await fn();times[name].push(Math.round((performance.now()-start)*10)/10);if(name==='overview'&&result.totalRuns!==20000)throw Error('Incorrect benchmark count');}}}finally{await prisma.$disconnect();}
 const plan=await c.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT count(*) FROM "CopilotRun" WHERE "organizationId"=$1 AND "createdAt">=now()-interval '30 days' AND "createdAt"<now()`,[o]);
 fs.writeFileSync(process.env.SUPPORTIQ_BENCHMARK_OUTPUT ?? 'stage-j-performance.json',JSON.stringify({fixture:{runs:20000,evaluations:10000,signals:2000,issues:300,tickets:1000,versions:50},milliseconds:times,rangePlan:plan.rows[0]['QUERY PLAN']},null,2));console.log(JSON.stringify(times));
}finally{await c.query('ROLLBACK');await c.query('DELETE FROM "Organization" WHERE id=$1',[o]);await c.query('DELETE FROM "User" WHERE id=$1',[u]);await c.end();}
