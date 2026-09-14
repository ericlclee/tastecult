'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from '../../session';
import { useTRPC } from '../../trpc';

// Unstyled on purpose — the followers and following lists behind a profile's counts.
export function FollowList({ kind }: { kind: 'followers' | 'following' }) {
  const { username } = useParams<{ username: string }>();
  const trpc = useTRPC();
  const { session, ready } = useSession();
  const page = { getNextPageParam: (p: { nextCursor: string | null }) => p.nextCursor };

  // Both queries are declared (hooks can't be conditional); only the one for this page runs
  const followers = useInfiniteQuery(
    trpc.user.followers.infiniteQueryOptions(
      { username, limit: 50 },
      { ...page, enabled: Boolean(session) && kind === 'followers' },
    ),
  );
  const following = useInfiniteQuery(
    trpc.user.following.infiniteQueryOptions(
      { username, limit: 50 },
      { ...page, enabled: Boolean(session) && kind === 'following' },
    ),
  );
  const list = kind === 'followers' ? followers : following;
  const title =
    kind === 'followers' ? `People following ${username}` : `People ${username} follows`;

  if (!ready) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main>
        <h1>{title}</h1>
        <p>
          <Link href="/sign-in">Sign in</Link> to see this list.
        </p>
        <p>
          <Link href={`/u/${username}`}>Back to {username}</Link>
        </p>
      </main>
    );
  }

  const people = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <main>
      <h1>{title}</h1>
      <p>
        <Link href={`/u/${username}`}>Back to {username}</Link>
      </p>
      {list.isPending ? <p>Loading…</p> : null}
      {list.isError ? <p role="alert">Couldn&apos;t load this list: {list.error.message}</p> : null}
      {list.isSuccess && people.length === 0 ? <p>No one yet.</p> : null}
      <ul>
        {people.map((person) => (
          <li key={person.username}>
            <Link href={`/u/${person.username}`}>{person.displayName ?? person.username}</Link>
            {person.isSelf ? ' (you)' : person.isFollowing ? ' · you follow them' : ''}
          </li>
        ))}
      </ul>
      {list.hasNextPage ? (
        <button
          type="button"
          onClick={() => void list.fetchNextPage()}
          disabled={list.isFetchingNextPage}
        >
          {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </main>
  );
}
