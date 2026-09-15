import type { PrismaClient } from '@tastecult/db';
import {
  emptyReactionCounts,
  type ReactionCounts,
  type ReactionType,
} from '@tastecult/shared-types';

export interface LogSocial {
  reactionCounts: ReactionCounts;
  /** The viewer's own reaction, or null when signed out or not reacted. */
  myReaction: ReactionType | null;
  commentCount: number;
}

/** Reaction counts, the viewer's reaction and comment counts for a page of logs, in three queries. */
export async function socialFor(
  prisma: PrismaClient,
  ratingIds: string[],
  viewerId: string | null,
): Promise<Map<string, LogSocial>> {
  const result = new Map<string, LogSocial>(
    ratingIds.map((id) => [
      id,
      { reactionCounts: emptyReactionCounts(), myReaction: null, commentCount: 0 },
    ]),
  );
  if (ratingIds.length === 0) return result;

  const [reactions, comments, mine] = await Promise.all([
    prisma.reaction.groupBy({
      by: ['ratingId', 'type'],
      where: { ratingId: { in: ratingIds } },
      _count: { _all: true },
    }),
    prisma.comment.groupBy({
      by: ['ratingId'],
      where: { ratingId: { in: ratingIds } },
      _count: { _all: true },
    }),
    viewerId
      ? prisma.reaction.findMany({
          where: { ratingId: { in: ratingIds }, userId: viewerId },
          select: { ratingId: true, type: true },
        })
      : [],
  ]);

  for (const row of reactions) result.get(row.ratingId)!.reactionCounts[row.type] = row._count._all;
  for (const row of comments) result.get(row.ratingId)!.commentCount = row._count._all;
  for (const row of mine) result.get(row.ratingId)!.myReaction = row.type;
  return result;
}
