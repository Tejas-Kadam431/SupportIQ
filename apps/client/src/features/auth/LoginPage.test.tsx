// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { LoginPage } from './LoginPage';

const { login, navigate, dispatch } = vi.hoisted(() => ({ login: vi.fn(), navigate: vi.fn(), dispatch: vi.fn() }));
vi.mock('../../app/hooks', () => ({ useAppDispatch: () => dispatch }));
vi.mock('./authApi', () => ({ useLoginMutation: () => [login, { isLoading: false }] }));
// Demo submission bypasses manual form validation; schema behavior is tested separately.
vi.mock('@hookform/resolvers/zod', () => ({ zodResolver: () => () => ({ values: {}, errors: {} }) }));
vi.mock('react-router-dom', async importOriginal => ({ ...await importOriginal<typeof import('react-router-dom')>(), useNavigate: () => navigate }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('demo login explains an outage and permits a successful retry', async () => {
  login.mockReturnValueOnce({ unwrap: () => Promise.reject({ status: 500, data: { message: 'private details' } }) });
  login.mockReturnValueOnce({ unwrap: () => Promise.resolve({ data: { user: { id: 'demo' }, accessToken: 'fixture' } }) });
  render(<MemoryRouter><LoginPage/></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Try Demo Account' }));
  expect((await screen.findByRole('alert')).textContent).toContain('temporarily unavailable');
  expect(screen.getByRole('alert').textContent).not.toContain('private details');
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Try Demo Account' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/dashboard'));
  expect(login).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});
