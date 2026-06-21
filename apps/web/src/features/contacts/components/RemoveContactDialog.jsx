import { ConfirmDialog } from './ConfirmDialog.jsx';

export function RemoveContactDialog({ open, name, isPending, onConfirm, onCancel }) {
  return (
    <ConfirmDialog
      open={open}
      title={`Remove ${name}?`}
      tone="danger"
      confirmLabel="Remove contact"
      isPending={isPending}
      onConfirm={onConfirm}
      onCancel={onCancel}
      description={
        <p>
          Removing a contact does not block them. {name} can still find you in discovery and send a
          new contact request later.
        </p>
      }
    />
  );
}
