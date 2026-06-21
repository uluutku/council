import { ConfirmDialog } from './ConfirmDialog.jsx';

export function BlockUserDialog({ open, name, isPending, onConfirm, onCancel }) {
  return (
    <ConfirmDialog
      open={open}
      title={`Block ${name}?`}
      tone="danger"
      confirmLabel="Block user"
      isPending={isPending}
      onConfirm={onConfirm}
      onCancel={onCancel}
      description={
        <>
          <p>Blocking {name} will:</p>
          <ul className="dialog-list">
            <li>Remove any existing contact relationship.</li>
            <li>Remove any pending request between you.</li>
            <li>Hide both of you from each other in discovery.</li>
            <li>Prevent either of you from sending a request until you unblock them.</li>
          </ul>
        </>
      }
    />
  );
}
