import { ConfirmDialog } from '../../contacts/components/ConfirmDialog.jsx';

export function DeleteChatDialog({ open, name, kind = 'human', isPending, onConfirm, onCancel }) {
  const isAi = kind === 'ai';
  return (
    <ConfirmDialog
      open={open}
      title={`Delete chat with ${name}?`}
      tone="danger"
      confirmLabel="Delete chat"
      isPending={isPending}
      onConfirm={onConfirm}
      onCancel={onCancel}
      description={
        isAi ? (
          <p>
            This removes the AI conversation and its saved chat history from your account. The AI
            contact or persona itself stays available.
          </p>
        ) : (
          <p>
            This clears the chat from your inbox and hides the current message history for you. It
            does not delete the other person&apos;s copy.
          </p>
        )
      }
    />
  );
}
