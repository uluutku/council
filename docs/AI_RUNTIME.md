# AI runtime

Council will use OpenRouter as its provider gateway. DeepSeek is the primary language model, with
a server-configured fallback. A separate vision-capable OpenRouter model may analyze images that a
user explicitly shares with an AI contact; DeepSeek then receives structured visual context for
the final persona-consistent response.

All provider credentials are application-owned and server-only. The browser must never receive
OpenRouter credentials or Supabase service-role credentials. Users cannot provide arbitrary
provider keys or select arbitrary models in the first release.

Every AI request will require:

- authenticated server-side entitlement checks for trial or Pro access;
- estimated credit reservation and actual-cost reconciliation;
- an idempotency key covering retries;
- validated input and bounded output;
- provider, model, token, latency, and estimated-cost metadata without private content in logs;
- clear handling for cancellation, timeout, partial output, and failed reconciliation.

The AI runtime will support limited validated tool rounds and explicit image routing. No AI calls,
model configuration, entitlements, cost accounting, or provider integration are implemented in
Task 001.
