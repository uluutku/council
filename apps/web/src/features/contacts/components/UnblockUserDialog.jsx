import { ConfirmDialog } from './ConfirmDialog.jsx';

export function UnblockUserDialog({ open, name, isPending, onConfirm, onCancel }) {
  return (
    <ConfirmDialog
      open={open}
      title={`Unblock ${name}?`}
      confirmLabel="Unblock"
      isPending={isPending}
      onConfirm={onConfirm}
      onCancel={onCancel}
      description={
        <>
          <p>
            Unblocking lets you and {name} discover each other again, subject to your privacy
            settings.
          </p>
          <p>
            It does not restore your previous contact status, any pending request, or the earlier
            relationship. If you want to connect again, send a new contact request.
          </p>
        </>
      }
    />
  );
}
