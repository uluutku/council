// The restrained initial reaction set. Custom or arbitrary emoji are out of
// scope for this task.
export const REACTION_CHOICES = ['👍', '❤️', '😂', '😮', '😢'];

export const REACTION_LABELS = {
  '👍': 'Thumbs up',
  '❤️': 'Heart',
  '😂': 'Laughing',
  '😮': 'Surprised',
  '😢': 'Sad',
};

export function reactionAccessibleLabel(emoji) {
  return REACTION_LABELS[emoji] ?? 'Reaction';
}

/**
 * Groups a message's raw reaction rows into ordered summary entries with counts
 * and whether the current user reacted. Ordering follows the database's
 * deterministic (emoji, user_id) ordering so counts stay stable across refetch.
 *
 * @param {Array<{ emoji: string, user_id: string }>} reactions
 * @param {string|null} currentUserId
 */
export function summarizeReactions(reactions, currentUserId) {
  if (!Array.isArray(reactions) || reactions.length === 0) return [];

  const order = [];
  const groups = new Map();

  for (const reaction of reactions) {
    let group = groups.get(reaction.emoji);
    if (!group) {
      group = { emoji: reaction.emoji, count: 0, reactedByMe: false };
      groups.set(reaction.emoji, group);
      order.push(reaction.emoji);
    }
    group.count += 1;
    if (currentUserId && reaction.user_id === currentUserId) {
      group.reactedByMe = true;
    }
  }

  return order.map((emoji) => groups.get(emoji));
}
