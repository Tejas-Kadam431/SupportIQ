type AuthAction = 'login' | 'register';
/** Never show raw server errors or mistake an outage for an invalid password. */
export function authErrorMessage(error: unknown, action: AuthAction): string {
  const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
  if (status === 'TIMEOUT_ERROR') return 'The server is taking longer than expected. Please try again in a moment.';
  if (status === 'FETCH_ERROR' || status === 'PARSING_ERROR') return 'We could not reach the sign-in service. Check your connection and try again.';
  if (status === 429) return 'Too many attempts. Please wait a few minutes before trying again.';
  if (typeof status === 'number' && status >= 500) return 'The sign-in service is temporarily unavailable. Please try again shortly.';
  if (action === 'login' && status === 401) return 'That email and password do not match. Please try again.';
  if (action === 'register' && status === 409) return 'An account already uses this email. Sign in instead.';
  if (status === 400) return 'Please check your details and try again.';
  return action === 'login' ? 'We could not sign you in. Please try again.' : 'We could not create your account. Please try again.';
}
