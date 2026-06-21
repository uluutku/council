const IMPACTS = {
  'message.created': ['conversation_messages', 'conversation_list'],
  'message.edited': ['conversation_messages', 'conversation_list'],
  'message.deleted': ['conversation_messages', 'conversation_list'],
  'reaction.changed': ['conversation_messages'],
  'receipt.changed': ['conversation_receipts', 'conversation_list'],
  'conversation.created': ['conversation_list'],
  'conversation.changed': ['conversation_list'],
  'messaging.availability_changed': ['conversation_list', 'conversation_details', 'contacts'],
};

export function getRealtimeQueryImpacts(eventName) {
  return IMPACTS[eventName] ? [...IMPACTS[eventName]] : [];
}
