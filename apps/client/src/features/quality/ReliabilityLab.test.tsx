// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('./reliabilityApi', () => ({ useReplayExperimentsQuery: () => ({ data: { data: { experiments: [], hasMore: false } } }), useReplayExperimentQuery: vi.fn(), useReplaySuitesQuery: vi.fn(), useCreateReplaySuiteMutation: vi.fn(), useCreateReplayExperimentMutation: vi.fn(), useReplayActionMutation: vi.fn(), useVerifyReplayMutation: vi.fn() }));
afterEach(cleanup);
import { ReliabilityLab, ReplaySummary } from './ReliabilityLab';
describe('Reliability Lab', () => {
    it('shows counts and denominators including incomplete execution', () => { render(<ReplaySummary summary={{ total: 16, completed: 15, counts: { ERROR: 1, IMPROVED: 5 }, failures: { passed: 5, total: 6 }, guardrails: { preserved: 9, total: 10 } }}/>); expect(screen.getByText('15 / 16 cases completed')).toBeTruthy(); expect(screen.getByText('Failure cases improved: 5 / 6')).toBeTruthy(); expect(screen.getByText('Guardrails preserved: 9 / 10')).toBeTruthy(); expect(screen.getByText(/ERROR: 1/)).toBeTruthy(); });
    it('agents can read but cannot create experiments', () => { render(<ReliabilityLab orgId="org" canManage={false}/>); expect(screen.queryByText('New experiment')).toBeNull(); expect(screen.getByText('No experiments yet.')).toBeTruthy(); expect(screen.getByText(/not proof of correctness/)).toBeTruthy(); });
    it('managers can start a bounded experiment', () => { render(<ReliabilityLab orgId="org" canManage/>); expect(screen.getByText('New experiment')).toBeTruthy(); });
});
