import { useQuery } from '@tanstack/react-query';
import { aiAccessQueryOptions } from '../queries/aiQueries.js';

export function useAiAccess() {
  return useQuery(aiAccessQueryOptions());
}
