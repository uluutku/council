import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SafeMarkdown } from './SafeMarkdown.jsx';

describe('SafeMarkdown', () => {
  it('renders GFM structure and copies fenced code accessibly', async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(
      <SafeMarkdown
        content={`# Heading

- [x] Done
- Item

| A | B |
| - | - |
| 1 | 2 |

\`\`\`javascript
const safe = true;
\`\`\``}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Heading' })).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('javascript')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledWith('const safe = true;');
    expect(screen.getByRole('status')).toHaveTextContent('Code copied.');
  });

  it('rejects unsafe links, suppresses remote images, and does not execute HTML', () => {
    const { container } = render(
      <SafeMarkdown
        content={`[unsafe](javascript:alert(1))

![tracker](https://tracker.example/pixel.png)

<script>window.bad = true</script>`}
      />,
    );
    expect(screen.queryByRole('link', { name: 'unsafe' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'tracker' })).toHaveAttribute(
      'href',
      'https://tracker.example/pixel.png',
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('renders incomplete streaming Markdown without throwing', () => {
    render(<SafeMarkdown content={'## Partial\n\n```js\nconst value ='} streaming />);
    expect(screen.getByRole('heading', { name: 'Partial' })).toBeInTheDocument();
    expect(screen.getByText(/const value/)).toBeInTheDocument();
  });
});
