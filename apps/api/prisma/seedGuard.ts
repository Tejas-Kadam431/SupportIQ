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
