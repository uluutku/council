import { Navigate } from 'react-router-dom';

export function LegacyContactsRedirect() {
  return <Navigate to="/app/contacts" replace />;
}
