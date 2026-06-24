import { Navigate } from 'react-router-dom';

export function LegacyAiCatalogueRedirect() {
  return <Navigate to="/app/contacts/ai" replace />;
}
