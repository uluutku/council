export function parseTimeout(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 50 && parsed <= 300_000 ? parsed : fallback;
}

export function createDeadlineSignal(clientSignal, timeoutMs) {
  const controller = new AbortController();
  let timeoutTriggered = false;
  const abortFromClient = () => controller.abort(clientSignal?.reason);
  if (clientSignal?.aborted) abortFromClient();
  else clientSignal?.addEventListener('abort', abortFromClient, { once: true });
  const timer = setTimeout(() => {
    timeoutTriggered = true;
    controller.abort(new DOMException('Provider deadline exceeded', 'TimeoutError'));
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timeoutTriggered,
    cleanup() {
      clearTimeout(timer);
      clientSignal?.removeEventListener('abort', abortFromClient);
    },
  };
}
