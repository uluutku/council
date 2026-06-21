import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../lib/queryClient.js';

export function QueryProvider({ children, client = queryClient }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
