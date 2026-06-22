// Receipt-state helpers. The backend guarantees only through-sequence receipt
// state per member, so we present an honest single indicator for the newest
// outgoing message rather than a per-message guess. The peer's read/delivered
// sequences are learned from realtime receipt events while a conversation is
// open; before any event arrives we only claim "Sent", which is always true for
// a message the server accepted.

export const RECEIPT_STATUS = {
  sending: 'sending',
  failed: 'failed',
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
};

export const RECEIPT_LABEL = {
  sending: 'Sending',
  failed: 'Failed',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
};

/**
 * Derives the receipt status of an authoritative outgoing message.
 *
 * @param {number} sequence message sequence
 * @param {{ readSequence: number, deliveredSequence: number }} peerReceipt
 */
export function deriveOutgoingReceipt(sequence, peerReceipt) {
  const readSequence = peerReceipt?.readSequence ?? 0;
  const deliveredSequence = peerReceipt?.deliveredSequence ?? 0;

  if (readSequence >= sequence) return RECEIPT_STATUS.read;
  if (deliveredSequence >= sequence) return RECEIPT_STATUS.delivered;
  return RECEIPT_STATUS.sent;
}

// Monotonic merge of a newly observed peer receipt into the known state.
export function mergePeerReceipt(current, next) {
  return {
    readSequence: Math.max(current?.readSequence ?? 0, next?.readSequence ?? 0),
    deliveredSequence: Math.max(current?.deliveredSequence ?? 0, next?.deliveredSequence ?? 0),
  };
}
