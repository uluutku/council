import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithAi, makeAccess } from '../../ai/test/renderWithAi.jsx';
import { AccessSettingsPage } from './AccessSettingsPage.jsx';

vi.mock('../../ai/api/aiApi.js', () => ({
  getMyAiAccess: vi.fn(),
}));
vi.mock('../api/accessApi.js', () => ({
  listMyPremiumGrants: vi.fn(),
  redeemPremiumCode: vi.fn(),
}));

import { getMyAiAccess } from '../../ai/api/aiApi.js';
import { listMyPremiumGrants, redeemPremiumCode } from '../api/accessApi.js';

describe('AccessSettingsPage', () => {
  beforeEach(() => {
    getMyAiAccess.mockResolvedValue(makeAccess());
    listMyPremiumGrants.mockResolvedValue([]);
    redeemPremiumCode.mockReset();
  });

  it('redeems a code, clears it, and refreshes access', async () => {
    redeemPremiumCode.mockResolvedValue({
      redeemed: true,
      pro_expires_at: '2026-07-23T10:00:00+00:00',
      pro_credits_remaining: 100,
    });
    renderWithAi(<AccessSettingsPage />);
    const input = await screen.findByLabelText('Premium access code');
    await userEvent.type(input, 'COUNCIL-VALID-CODE-123456');
    await userEvent.click(screen.getByRole('button', { name: 'Redeem code' }));
    await waitFor(() =>
      expect(redeemPremiumCode).toHaveBeenCalledWith('COUNCIL-VALID-CODE-123456'),
    );
    expect(await screen.findByText('Premium access added.')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('keeps redemption failures generic', async () => {
    redeemPremiumCode.mockResolvedValue({
      redeemed: false,
      pro_expires_at: null,
      pro_credits_remaining: null,
    });
    renderWithAi(<AccessSettingsPage />);
    await userEvent.type(
      await screen.findByLabelText('Premium access code'),
      'COUNCIL-INVALID-CODE-1234',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Redeem code' }));
    expect(
      await screen.findByText('This access code is invalid or unavailable.'),
    ).toBeInTheDocument();
  });
});
