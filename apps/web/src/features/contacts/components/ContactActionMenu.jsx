// Groups the per-contact action buttons. Implemented as a labelled button group
// rather than a popup so keyboard users reach every action directly.
export function ContactActionMenu({ label, children }) {
  return (
    <div className="contact-actions" role="group" aria-label={label}>
      {children}
    </div>
  );
}
