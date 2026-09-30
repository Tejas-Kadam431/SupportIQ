import { assertDemoResetAllowed } from '../../prisma/seedGuard.js';
const safe = { NODE_ENV: 'test', SUPPORTIQ_DEMO_RESET: 'ERASE_LOCAL_DEMO', DATABASE_URL: 'postgresql://fixture@127.0.0.1:55441/supportiq_e2e' };
test('demo reset requires explicit opt-in, nonproduction mode and disposable local database', () => {
  expect(() => assertDemoResetAllowed(safe)).not.toThrow();
  for (const patch of [{NODE_ENV:'production'}, {NODE_ENV:undefined}, {SUPPORTIQ_DEMO_RESET:undefined}, {DATABASE_URL:'postgresql://fixture@db.example.com/supportiq_e2e'}, {DATABASE_URL:'postgresql://fixture@localhost/customer_data'}]) {
    expect(() => assertDemoResetAllowed({...safe,...patch})).toThrow();
  }
});
