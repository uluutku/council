const notifiedMessages = new Set();

export function clearNotificationState() {
  notifiedMessages.clear();
}

export function notificationBody(message, previewsEnabled) {
  if (!previewsEnabled || !message || message.deleted_at || !message.content) return 'New message';
  return message.content.replace(/\s+/g, ' ').trim().slice(0, 160) || 'New message';
}

export function shouldNotifyMessage({
  messageId,
  senderId,
  currentUserId,
  conversationId,
  activeConversationId,
  pageVisible,
  muted,
  enabled,
  permission,
}) {
  if (!enabled || permission !== 'granted' || muted) return false;
  if (!messageId || senderId === currentUserId || notifiedMessages.has(messageId)) return false;
  if (pageVisible && conversationId === activeConversationId) return false;
  notifiedMessages.add(messageId);
  return true;
}

export function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.frequency.value = 660;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    oscillator.addEventListener('ended', () => context.close().catch(() => {}));
  } catch {
    // Browser autoplay and audio policies are best-effort.
  }
}
