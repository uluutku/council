import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormStatus } from '../../../components/FormStatus.jsx';
import { useAuth } from '../../../app/providers/AuthContext.js';
import { beginPasswordChange } from '../../auth/utils/passwordIntent.js';
import { mapSupabaseError } from '../../auth/utils/authErrors.js';
import { usePageTitle } from '../../../hooks/usePageTitle.js';

export function SecuritySettingsPage() {
  usePageTitle('Security');
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [status, setStatus] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);

  function handlePasswordChange() {
    beginPasswordChange();
    navigate('/reset-password');
  }

  async function handleSignOut(scope) {
    setStatus('');
    setIsSigningOut(true);

    try {
      await signOut(scope);
      navigate('/login', { replace: true });
    } catch (error) {
      setStatus(mapSupabaseError(error).message);
      setIsSigningOut(false);
    }
  }

  return (
    <section className="settings-section">
      <div>
        <p className="eyebrow">Account access</p>
        <h1>Security</h1>
        <p>Council relies on Supabase Auth for password and session security.</p>
      </div>

      <section className="panel security-card">
        <h2>Email</h2>
        <dl className="detail-list">
          <div>
            <dt>Address</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Verification</dt>
            <dd>{user.email_confirmed_at ? 'Verified' : 'Not verified'}</dd>
          </div>
        </dl>
      </section>

      <section className="panel security-card">
        <h2>Password</h2>
        <p>Changing your password requires an explicit action from this screen.</p>
        <button className="button button--secondary" type="button" onClick={handlePasswordChange}>
          Change password
        </button>
      </section>

      <section className="panel security-card">
        <h2>Sessions</h2>
        <p>
          Council does not yet show individual devices. Global logout revokes refresh sessions;
          already-issued access tokens may remain valid until they expire.
        </p>
        <div className="form-actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={() => handleSignOut('local')}
            disabled={isSigningOut}
          >
            Log out this session
          </button>
          <button
            className="button button--danger"
            type="button"
            onClick={() => handleSignOut('global')}
            disabled={isSigningOut}
          >
            Log out all sessions
          </button>
        </div>
        <FormStatus message={status} tone="error" />
      </section>
    </section>
  );
}
