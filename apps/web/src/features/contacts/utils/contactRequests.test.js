import { describe, expect, it } from 'vitest';
import { pendingIncomingCount, splitContactRequests } from './contactRequests.js';

const requests = [
  { relationship_id: 'r1', direction: 'incoming' },
  { relationship_id: 'r2', direction: 'outgoing' },
  { relationship_id: 'r3', direction: 'incoming' },
];

describe('splitContactRequests', () => {
  it('separates incoming and outgoing requests', () => {
    const { incoming, outgoing } = splitContactRequests(requests);
    expect(incoming).toHaveLength(2);
    expect(outgoing).toHaveLength(1);
  });

  it('handles an empty list', () => {
    expect(splitContactRequests()).toEqual({ incoming: [], outgoing: [] });
  });
});

describe('pendingIncomingCount', () => {
  it('counts only incoming requests', () => {
    expect(pendingIncomingCount(requests)).toBe(2);
  });

  it('returns zero for an empty list', () => {
    expect(pendingIncomingCount()).toBe(0);
  });
});
