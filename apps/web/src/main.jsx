import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ErrorBoundary } from './app/ErrorBoundary.jsx';
import { EnvironmentGuard } from './app/EnvironmentGuard.jsx';
import { AuthProvider } from './app/providers/AuthProvider.jsx';
import { QueryProvider } from './app/providers/QueryProvider.jsx';
import { ThemeController } from './app/providers/ThemeController.jsx';
import './styles/global.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryProvider>
        <EnvironmentGuard>
          <AuthProvider>
            <ThemeController />
            <App />
          </AuthProvider>
        </EnvironmentGuard>
      </QueryProvider>
    </ErrorBoundary>
  </StrictMode>,
);
