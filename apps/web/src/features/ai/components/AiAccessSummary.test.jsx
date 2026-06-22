import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AiAccessSummary } from './AiAccessSummary.jsx';
import { makeAccess } from '../test/renderWithAi.jsx';

describe('AiAccessSummary', () => {
  it('shows remaining trial credits', () => {
    render(<AiAccessSummary access={makeAccess({ trial_credits_remaining: 7 })} />);
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText(/trial credits remaining/i)).toBeInTheDocument();
  });

  it('explains an exhausted trial without offering a fake upgrade', () => {
    render(
      <AiAccessSummary
        access={makeAccess({ access_state: 'credits_exhausted', trial_credits_remaining: 0 })}
      />,
    );
    expect(screen.getByText(/trial credits are used up/i)).toBeInTheDocument();
    expect(screen.getByText(/Pro billing is not available/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /upgrade/i })).not.toBeInTheDocument();
  });

  it('explains an expired trial', () => {
    render(<AiAccessSummary access={makeAccess({ access_state: 'trial_expired' })} />);
    expect(screen.getByText(/Your AI trial has ended/i)).toBeInTheDocument();
  });

  it('shows Pro access when enabled', () => {
    render(<AiAccessSummary access={makeAccess({ access_state: 'pro', pro_enabled: true })} />);
    expect(screen.getByText(/Pro access is enabled/i)).toBeInTheDocument();
  });
});
