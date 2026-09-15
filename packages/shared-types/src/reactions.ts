// The fixed set of reactions to a log. Stored as a Postgres enum (ReactionType in
// schema.prisma) — adding one needs a migration as well as an entry here.
export const REACTION_TYPES = ['WANT', 'FIRE', 'CLAP', 'LOL'] as const;

export type ReactionType = (typeof REACTION_TYPES)[number];

export const REACTIONS: Record<ReactionType, { emoji: string; label: string }> = {
  WANT: { emoji: '🤤', label: 'Want this' },
  FIRE: { emoji: '🔥', label: 'Looks amazing' },
  CLAP: { emoji: '👏', label: 'Great find' },
  LOL: { emoji: '😂', label: 'Haha' },
};

export type ReactionCounts = Record<ReactionType, number>;

export function emptyReactionCounts(): ReactionCounts {
  return { WANT: 0, FIRE: 0, CLAP: 0, LOL: 0 };
}
