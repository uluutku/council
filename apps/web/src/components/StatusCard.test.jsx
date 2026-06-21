import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusCard } from './StatusCard.jsx';

describe('StatusCard', () => {
  it('renders a status without exposing hidden values', () => {
    render(
      <StatusCard label="Supabase" value="Configured" detail="Public client settings loaded" />,
    );

    expect(screen.getByText('Supabase')).toBeInTheDocument();
    expect(screen.getByText('Configured')).toBeInTheDocument();
    expect(screen.getByText('Public client settings loaded')).toBeInTheDocument();
  });
});
