// Generic messaging-unavailable banner. It deliberately reveals no cause: it
// never says who blocked whom, whether a block happened, whether contact status
// changed, or why availability changed. History stays readable; only sending,
// editing, and adding reactions are disabled by the surrounding UI.
export function MessagingUnavailableBanner() {
  return (
    <div className="messaging-unavailable" role="status">
      <p>Messaging is currently unavailable for this conversation.</p>
    </div>
  );
}
