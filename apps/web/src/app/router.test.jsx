import { render, screen } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { createAppRouter } from './router.jsx';

describe('application routes', () => {
  it('renders the placeholder login route', async () => {
    const router = createAppRouter({ memory: true, initialEntries: ['/login'] });
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByText(/Authentication is intentionally deferred/)).toBeInTheDocument();
  });

  it('renders the not-found route', async () => {
    const router = createAppRouter({ memory: true, initialEntries: ['/does-not-exist'] });
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
