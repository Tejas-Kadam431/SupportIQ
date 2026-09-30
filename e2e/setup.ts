import { assertDemoResetAllowed } from "../apps/api/prisma/seedGuard.js";
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
export default async function setup() {
 const api=path.resolve('apps/api');
 const env={...process.env,SUPPORTIQ_DEMO_RESET:'ERASE_LOCAL_DEMO'};
 const req=createRequire(path.join(api,'package.json'));
 assertDemoResetAllowed(env);
 const databaseUrl=new URL(env.DATABASE_URL!);const name=databaseUrl.pathname.slice(1);databaseUrl.pathname='/postgres';
 const {Client}=req('pg');const admin=new Client({connectionString:databaseUrl.toString()});await admin.connect();
 try {if(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount)await admin.query('CREATE DATABASE "'+name+'"');}finally{await admin.end();}
 // Test reset is protected by the same production guard as the demo seed.
 execFileSync(process.execPath,[req.resolve('prisma/build/index.js'),'migrate','deploy'],{cwd:api,env,stdio:'inherit'});
 execFileSync(process.execPath,[req.resolve('tsx/cli'),'prisma/seed.ts'],{cwd:api,env,stdio:'inherit'});
 const {PrismaClient}=req('@prisma/client');const db=new PrismaClient();
 try {
  const admin=await db.user.findUniqueOrThrow({where:{email:'priya.admin@supportiq.app'}});
  const customer=await db.user.findUniqueOrThrow({where:{email:'aarav.customer@example.com'}});
  const org=await db.organization.findUniqueOrThrow({where:{slug:'acmecloud-support'}});
  const ticket=await db.ticket.create({data:{organizationId:org.id,customerId:customer.id,title:'Password reset email',description:'Password reset email troubleshooting',assigneeId:admin.id}});
  await db.ticket.update({where:{id:ticket.id},data:{status:'OPEN',assigneeId:admin.id}});
  const abstention=await db.ticket.create({data:{organizationId:org.id,customerId:customer.id,title:'Quantum satellite customs authorization',description:'Can you authorize orbital xenon customs clearance for a private satellite?'}});
  const foreign=await db.ticket.findFirstOrThrow({where:{organizationId:org.id,customerId:{not:customer.id}}});
  writeFileSync('e2e/.state.json',JSON.stringify({orgId:org.id,ticketId:ticket.id,abstentionId:abstention.id,foreignTicketId:foreign.id}));
 } finally {await db.$disconnect();}
}
