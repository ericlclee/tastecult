'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { VisitFeed } from '../../visit-feed';
import { useSession } from '../../session';
import { useTRPC } from '../../trpc';
import { FollowButton } from './follow-button';

// Unstyled on purpose — a working profile page to replace with the real design.
export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const trpc = useTRPC();
  const { session } = useSession();
  const profile = useQuery(trpc.user.byUsername.queryOptions({ username }));
  const me = useQuery(trpc.user.me.queryOptions(undefined, { enabled: Boolean(session) }));
  const visits = useInfiniteQuery(
    trpc.visit.forUser.infiniteQueryOptions(
      { username, limit: 20 },
      { getNextPageParam: (page) => page.nextCursor },
    ),
  );

  if (profile.isError) {
    return (
      <main>
        <p role="alert">
          {profile.error.data?.code === 'NOT_FOUND'
            ? 'No one has that username.'
            : `Couldn't load this profile: ${profile.error.message}`}
        </p>
      </main>
    );
  }

  if (!profile.data) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  const person = profile.data;

  let followControl: ReactNode;
  if (person.isSelf) {
    followControl = (
      <p>
        This is your profile. <Link href="/me">Your logs</Link>
      </p>
    );
  } else if (!session) {
    followControl = (
      <p>
        <Link href="/sign-in">Sign in</Link> to follow {person.username}.
      </p>
    );
  } else if (me.data && !me.data.profile) {
    followControl = (
      <p>
        <Link href="/log">Choose a username</Link> to follow people.
      </p>
    );
  } else {
    followControl = <FollowButton username={person.username} isFollowing={person.isFollowing} />;
  }

  return (
    <main>
      <h1>{person.displayName ?? person.username}</h1>
      <p>
        @{person.username} · joined{' '}
        {person.joinedAt.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
      </p>
      <p>
        <Link href={`/u/${person.username}/followers`}>
          {person.followerCount} {person.followerCount === 1 ? 'follower' : 'followers'}
        </Link>{' '}
        · <Link href={`/u/${person.username}/following`}>{person.followingCount} following</Link>
      </p>
      {followControl}

      <VisitFeed
        pages={visits.data?.pages}
        status={visits.status}
        error={visits.error?.message ?? null}
        hasNextPage={visits.hasNextPage}
        isFetchingNextPage={visits.isFetchingNextPage}
        onLoadMore={() => void visits.fetchNextPage()}
        on="user"
      />
    </main>
  );
}
