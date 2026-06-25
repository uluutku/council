import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MessageComposer } from './MessageComposer.jsx';

function setup(props) {
  const onSend = vi.fn().mockReturnValue('client-message-id');
  const utils = render(<MessageComposer onSend={onSend} {...props} />);
  const textarea = screen.getByLabelText('Message');
  return { onSend, textarea, ...utils };
}

describe('MessageComposer', () => {
  it('disables Send until there is non-blank content', async () => {
    const { textarea } = setup();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await userEvent.type(textarea, '   ');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await userEvent.type(textarea, 'hi');
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('sends on Enter and clears the input', async () => {
    const { onSend, textarea } = setup();
    await userEvent.type(textarea, 'hello');
    await userEvent.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledWith('hello');
    expect(textarea).toHaveValue('');
  });

  it('inserts a newline on Shift+Enter without sending', async () => {
    const { onSend, textarea } = setup();
    await userEvent.type(textarea, 'line one');
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    await userEvent.type(textarea, 'line two');
    expect(onSend).not.toHaveBeenCalled();
    expect(textarea.value).toContain('\n');
  });

  it('does not send when Enter commits an IME composition', () => {
    const { onSend, textarea } = setup();
    fireEvent.change(textarea, { target: { value: 'こんにちは' } });
    fireEvent.compositionStart(textarea);
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.compositionEnd(textarea);
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('こんにちは');
  });

  it('shows a character counter only near the limit', async () => {
    const { textarea } = setup();
    await userEvent.type(textarea, 'short');
    expect(screen.queryByText(/\/ 8000/)).not.toBeInTheDocument();
    fireEvent.change(textarea, { target: { value: 'x'.repeat(7600) } });
    expect(screen.getByText('7600 / 8000')).toBeInTheDocument();
  });

  it('renders a reply preview with a cancel control', async () => {
    const onCancelReply = vi.fn();
    setup({
      replyReference: { authorLabel: 'Bjorn', excerpt: 'earlier message', muted: false },
      onCancelReply,
    });
    expect(screen.getByText('earlier message')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(onCancelReply).toHaveBeenCalled();
  });

  it('restores and reports a durable draft value', async () => {
    const onDraftChange = vi.fn();
    const { textarea } = setup({ initialValue: 'saved draft', onDraftChange });

    expect(textarea).toHaveValue('saved draft');
    await userEvent.type(textarea, ' plus');
    expect(onDraftChange).toHaveBeenLastCalledWith('saved draft plus');
  });
});
