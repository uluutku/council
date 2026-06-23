import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiKeys } from '../../../lib/query-keys/ai.js';
import { aiAccessQueryOptions } from '../../ai/queries/aiQueries.js';
import { AiAccessSummary } from '../../ai/components/AiAccessSummary.jsx';
import { listMyPremiumGrants, redeemPremiumCode } from '../api/accessApi.js';
import { usePageTitle } from '../../../hooks/usePageTitle.js';

const grantsKey = ['access', 'premium-grants'];

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function AccessSettingsPage() {
  usePageTitle('Access');
  const queryClient = useQueryClient();
  const { data: access } = useQuery(aiAccessQueryOptions());
  const grants = useQuery({ queryKey: grantsKey, queryFn: () => listMyPremiumGrants() });
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('');
  const redeem = useMutation({
    mutationFn: () => redeemPremiumCode(code),
    onSuccess: async (result) => {
      if (!result.redeemed) {
        setStatus('This access code is invalid or unavailable.');
        return;
      }
      setCode('');
      setStatus('Premium access added.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: aiKeys.access() }),
        queryClient.invalidateQueries({ queryKey: aiKeys.agents() }),
        queryClient.invalidateQueries({ queryKey: grantsKey }),
      ]);
    },
    onError: () => setStatus('This access code is invalid or unavailable.'),
  });

  return (
    <section className="settings-section access-settings">
      <header className="settings-head">
        <p className="eyebrow">AI access</p>
        <h1>Access</h1>
        <p>
          Premium access codes are issued manually. There is no automatic renewal or payment in this
          build.
        </p>
      </header>
      <div className="panel access-status-card">
        <h2>Current access</h2>
        <AiAccessSummary access={access} />
        {access?.pro_expires_at ? (
          <dl>
            <div>
              <dt>Premium expiration</dt>
              <dd>{formatDate(access.pro_expires_at)}</dd>
            </div>
            <div>
              <dt>Premium credits</dt>
              <dd>{access.pro_credits_remaining}</dd>
            </div>
          </dl>
        ) : null}
      </div>
      <form
        className="panel stacked-form settings-card"
        onSubmit={(event) => {
          event.preventDefault();
          setStatus('');
          redeem.mutate();
        }}
      >
        <h2 className="settings-card-title">Redeem a code</h2>
        <label className="form-field">
          <span>Premium access code</span>
          <input
            value={code}
            maxLength={128}
            autoComplete="off"
            spellCheck="false"
            placeholder="COUNCIL-XXXX-XXXX-XXXX"
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        <div className="form-actions">
          <button
            type="submit"
            className="button"
            disabled={code.trim().length < 16 || redeem.isPending}
          >
            {redeem.isPending ? 'Redeeming…' : 'Redeem code'}
          </button>
          {status ? (
            <p
              className="access-redeem-status"
              role="status"
              data-tone={status === 'Premium access added.' ? 'success' : 'error'}
            >
              {status}
            </p>
          ) : null}
        </div>
      </form>
      <section className="panel">
        <h2 className="settings-card-title">Grant history</h2>
        {grants.data?.length ? (
          <ul className="premium-grant-list">
            {grants.data.map((grant) => (
              <li key={grant.id}>
                <strong>{grant.credits_granted} AI credits</strong>
                <span>
                  {formatDate(grant.starts_at)} to {formatDate(grant.ends_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="access-empty">No Premium grants yet.</p>
        )}
      </section>
    </section>
  );
}
