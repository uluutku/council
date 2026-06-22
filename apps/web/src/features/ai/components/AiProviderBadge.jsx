import { useQuery } from '@tanstack/react-query';
import { aiProviderQueryOptions } from '../queries/aiQueries.js';

export function AiProviderBadge() {
  const { data } = useQuery(aiProviderQueryOptions());

  let label = 'AI provider';
  if (!import.meta.env.PROD && data?.provider_mode === 'mock') label = 'Local mock';
  if (!import.meta.env.PROD && data?.provider_mode === 'openrouter' && data.status === 'ok') {
    label = 'Live provider';
  }
  if (
    !import.meta.env.PROD &&
    data?.provider_mode === 'openrouter' &&
    data.status === 'configuration_error'
  ) {
    label = 'Provider not configured';
  }

  return (
    <span className="ai-provider-badge" data-provider-mode={data?.provider_mode}>
      {label}
    </span>
  );
}
