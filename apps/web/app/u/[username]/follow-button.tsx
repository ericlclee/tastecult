'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../../trpc';

export function FollowButton({
  username,
  isFollowing,
}: {
  username: string;
  isFollowing: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Counts, follower lists and your feed all change when you follow someone
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.user.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.rating.feed.pathKey() }),
    ]);

  const follow = useMutation(trpc.user.follow.mutationOptions({ onSuccess: refresh }));
  const unfollow = useMutation(trpc.user.unfollow.mutationOptions({ onSuccess: refresh }));
  const pending = follow.isPending || unfollow.isPending;
  const error = follow.error ?? unfollow.error;

  return (
    <p>
      {isFollowing ? (
        <button type="button" disabled={pending} onClick={() => unfollow.mutate({ username })}>
          {pending ? 'Updating…' : 'Unfollow'}
        </button>
      ) : (
        <button type="button" disabled={pending} onClick={() => follow.mutate({ username })}>
          {pending ? 'Updating…' : 'Follow'}
        </button>
      )}
      {error ? <span role="alert"> Couldn&apos;t update: {error.message}</span> : null}
    </p>
  );
}
