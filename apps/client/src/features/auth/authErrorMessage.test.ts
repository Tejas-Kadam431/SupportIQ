import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './authErrorMessage';
import { registerFormSchema } from './schemas';

describe('authentication recovery messages', () => {
  it('distinguishes bad credentials from a server outage', () => {
    expect(authErrorMessage({ status: 401 }, 'login')).toContain('do not match');
    expect(authErrorMessage({ status: 500, data: { message: 'secret database details' } }, 'login')).toContain('temporarily unavailable');
    expect(authErrorMessage({ status: 503 }, 'login')).not.toContain('password');
  });
  it('handles cold starts, network failure and throttling without raw errors', () => {
    expect(authErrorMessage({ status: 'TIMEOUT_ERROR' }, 'login')).toContain('taking longer');
    expect(authErrorMessage({ status: 'FETCH_ERROR' }, 'login')).toContain('connection');
    expect(authErrorMessage({ status: 429 }, 'login')).toContain('wait');
    expect(authErrorMessage(new Error('sensitive details'), 'register')).not.toContain('sensitive');
  });
  it('provides a recovery route for duplicate registration', () => {
    expect(authErrorMessage({ status: 409 }, 'register')).toContain('Sign in instead');
  });
  it('trims identity fields without changing the password', () => {
    const parsed = registerFormSchema.parse({ name: '  Alex  ', email: ' alex@example.com ', password: ' password123 ' });
    expect(parsed).toEqual({ name: 'Alex', email: 'alex@example.com', password: ' password123 ' });
  });
});
