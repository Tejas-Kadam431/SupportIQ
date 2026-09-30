import { defineConfig, devices } from '@playwright/test';
const api = 'http://127.0.0.1:55443';
const client = 'http://127.0.0.1:55444';
Object.assign(process.env, {
 NODE_ENV:'test', PORT:'55443', CLIENT_URL:client,
 DATABASE_URL:process.env.E2E_DATABASE_URL ?? 'postgresql://supportiq:isolated-test-only@127.0.0.1:55441/supportiq_e2e?schema=public',
 REDIS_URL:process.env.E2E_REDIS_URL ?? 'redis://127.0.0.1:55440/1',
 JWT_ACCESS_SECRET:'local-e2e-only-not-a-deployment-secret', OPENAI_API_KEY:'', GEMINI_API_KEY:'',
 KNOWLEDGE_STORAGE:'filesystem', KNOWLEDGE_STORAGE_ROOT:'./data/e2e',
 VITE_API_BASE_URL:api+'/api/v1', VITE_SOCKET_URL:api
});
export default defineConfig({
 testDir:'./e2e', fullyParallel:false, workers:1, retries:0, timeout:90000,
 expect:{timeout:15000}, globalSetup:'./e2e/setup.ts',
 use:{...devices['Desktop Chrome'],baseURL:client,trace:'retain-on-failure',screenshot:'only-on-failure'},
 reporter:[['list'],['html',{open:'never'}]],
 webServer:[
  {command:'node dist/src/server.js',cwd:'apps/api',url:api+'/health/live',reuseExistingServer:false,timeout:60000},
  {command:'node dist/src/worker.js',cwd:'apps/api',wait:{stdout:/worker.started/},reuseExistingServer:false,timeout:60000},
  {command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 55444 --strictPort',cwd:'apps/client',url:client,reuseExistingServer:false,timeout:60000}
 ]
});
