import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AiAccessSummary } from './AiAccessSummary.jsx';
import { makeAccess } from '../test/renderWithAi.jsx';

describe('AiAccessSummary', () => {
  it('shows remaining trial credits', () => {
    render(<AiAccessSummary access={makeAccess({ trial_credits_remaining: 7 })} />);
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('AI trial balance')).toBeInTheDocument();
    expect(screen.getByText(/trial credits/i)).toBeInTheDocument();
  });

  it('explains an exhausted trial without offering a fake upgrade', () => {
    render(
      <AiAccessSummary
        access={makeAccess({ access_state: 'credits_exhausted', trial_credits_remaining: 0 })}
      />,
    );
    expect(screen.getByText('Trial credits used')).toBeInTheDocument();
    expect(screen.getByText(/trial credits are used up/i)).toBeInTheDocument();
    expect(screen.getByText(/Pro billing is not available/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upgrade/i })).not.toBeInTheDocument();
  });

  it('explains an expired trial', () => {
    render(<AiAccessSummary access={makeAccess({ access_state: 'trial_expired' })} />);
    expect(screen.getByText('Trial ended')).toBeInTheDocument();
    expect(screen.getByText(/Your AI trial has ended/i)).toBeInTheDocument();
  });

  it('shows Pro access when enabled', () => {
    render(
      <AiAccessSummary
        access={makeAccess({
          access_state: 'pro',
          is_pro: true,
          pro_credits_remaining: 42,
          pro_expires_at: '2026-07-23T10:00:00+00:00',
          active_credit_source: 'premium',
        })}
      />,
    );
    expect(screen.getByText('Premium balance')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Premium credits')).toBeInTheDocument();
  });
});
