/** Destructive seed/reset is opt-in and limited to disposable local databases. */
export function assertDemoResetAllowed(input: NodeJS.ProcessEnv) {
  if (!['development', 'test'].includes(input.NODE_ENV ?? '') || input.SUPPORTIQ_DEMO_RESET !== 'ERASE_LOCAL_DEMO') {
    throw new Error('Demo reset requires NODE_ENV=development/test and SUPPORTIQ_DEMO_RESET=ERASE_LOCAL_DEMO');
  }
  const url = new URL(input.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1', '[::1]', 'postgres'].includes(url.hostname) || !/^supportiq_(demo|test|e2e)$/.test(url.pathname.slice(1))) {
    throw new Error('Demo reset requires a local supportiq_demo, supportiq_test or supportiq_e2e database');
  }
}

/** Explicit first-time provisioning never permits erasing existing data. */
export function assertEmptyDemoProvisionAllowed(input: NodeJS.ProcessEnv, rowCounts: number[]) {
  const url = new URL(input.DATABASE_URL ?? '');
  if (!input.SUPPORTIQ_PROVISION_EMPTY_DEMO || url.pathname.slice(1) !== input.SUPPORTIQ_PROVISION_EMPTY_DEMO) {
    throw new Error('Empty demo provisioning requires the exact database name as explicit opt-in');
  }
  if (!rowCounts.length || rowCounts.some(count => count !== 0)) {
    throw new Error('Empty demo provisioning refuses a database containing application data');
  }
}
