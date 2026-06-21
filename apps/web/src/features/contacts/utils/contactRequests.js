// Pure helpers for grouping the flat pending-request list returned by
// list_my_contact_requests into the incoming/outgoing sections the UI renders.

export function splitContactRequests(requests = []) {
  const incoming = [];
  const outgoing = [];

  for (const request of requests) {
    if (request.direction === 'incoming') {
      incoming.push(request);
    } else {
      outgoing.push(request);
    }
  }

  return { incoming, outgoing };
}

export function pendingIncomingCount(requests = []) {
  return requests.reduce(
    (total, request) => (request.direction === 'incoming' ? total + 1 : total),
    0,
  );
}
