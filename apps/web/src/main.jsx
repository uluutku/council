import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { ErrorBoundary } from './app/ErrorBoundary.jsx';
import { EnvironmentGuard } from './app/EnvironmentGuard.jsx';
import { queryClient } from './lib/queryClient.js';
import './styles/global.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <EnvironmentGuard>
          <App />
        </EnvironmentGuard>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
