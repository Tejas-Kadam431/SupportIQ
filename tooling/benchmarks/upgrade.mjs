import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
const root=process.cwd(), require=createRequire(root+'/package.json'), {Client}=require('pg');
const url=new URL(process.env.DATABASE_URL??'');
if(process.env.SUPPORTIQ_MIGRATION_CHECK!=='LOCAL_SYNTHETIC'||!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/supportiq_test')throw Error('Only explicitly opted-in local supportiq_test is allowed');
const database='supportiq_j_upgrade_'+randomUUID().replaceAll('-','');url.pathname='/'+database;url.searchParams.set('schema','public');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'supportiq-migration-')), dir=path.join(temp,'prisma');fs.mkdirSync(path.join(dir,'migrations'),{recursive:true});
fs.copyFileSync(path.join(root,'prisma/schema.prisma'),path.join(dir,'schema.prisma'));
fs.copyFileSync(path.join(root,'prisma/migrations/migration_lock.toml'),path.join(dir,'migrations/migration_lock.toml'));
const names=fs.readdirSync(path.join(root,'prisma/migrations')).filter(n=>/^20/.test(n)).sort();
function copy(list){for(const name of list)fs.cpSync(path.join(root,'prisma/migrations',name),path.join(dir,'migrations',name),{recursive:true});}
function deploy(){execFileSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--schema',path.join(dir,'schema.prisma')],{cwd:temp,env:{...process.env,DATABASE_URL:url.toString()},stdio:'inherit'});}
const admin=new Client({connectionString:process.env.DATABASE_URL});await admin.connect();await admin.query('CREATE DATABASE "'+database+'"');
const c=new Client({connectionString:url.toString()});await c.connect();
try{
 copy(names.slice(0,5));deploy();
 await c.query(`INSERT INTO "User"(id,email,name,"passwordHash","updatedAt") VALUES('u','upgrade@test.invalid','Fixture','fixture',now()); INSERT INTO "Organization"(id,name,slug,"ownerId","updatedAt") VALUES('o','Fixture','fixture','u',now()); INSERT INTO "Ticket"(id,"organizationId","customerId",title,description,"updatedAt") VALUES('t','o','u','Retained ticket','Retained description',now());`);
 await c.query(`INSERT INTO "CopilotRun"(id,"organizationId","ticketId",provider,confidence,tone,topic,"issueSummary","missingInformation","recommendedAction","searchQuery","searchMode","sourceCount",sources,warnings) VALUES('r','o','t','fallback','LOW','PROFESSIONAL','Fixture','Retained summary','[]','Review','refund','keyword',0,'[]','[]'); INSERT INTO "CopilotEvaluation"(id,"copilotRunId",disposition,reason,"updatedAt") VALUES('e','r','REJECTED','INSUFFICIENT_KB',now());`);
 const tables=['User','Organization','Ticket','CopilotRun','CopilotEvaluation'], before={};
 for(const table of tables)before[table]=(await c.query('SELECT * FROM "'+table+'" ORDER BY id')).rows;
 copy(names.slice(5));deploy();
 for(const table of tables){const after=(await c.query('SELECT * FROM "'+table+'" ORDER BY id')).rows;if(after.length!==before[table].length)throw Error('Row count changed: '+table);for(let i=0;i<after.length;i++)for(const key of Object.keys(before[table][i]))if(JSON.stringify(before[table][i][key])!==JSON.stringify(after[i][key]))throw Error('Retained value changed: '+table+'.'+key);}
 const legacy=(await c.query('SELECT "provenanceVersion",status FROM "CopilotRun" WHERE id=\'r\'')).rows[0];if(legacy.provenanceVersion!==0||legacy.status!=='LEGACY')throw Error('Legacy provenance invented');
 const result={baselineMigrations:5,finalMigrations:names.length,retainedTables:tables,originalColumnsPreserved:true,legacy};fs.writeFileSync(process.env.SUPPORTIQ_MIGRATION_OUTPUT??path.join(temp,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await c.end();await admin.query('DROP DATABASE "'+database+'"');await admin.end();}
