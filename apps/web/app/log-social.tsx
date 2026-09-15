'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@tastecult/api-client';
import { COMMENT_MAX_LENGTH, REACTION_TYPES, REACTIONS } from '@tastecult/shared-types';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useSession } from './session';
import { useTRPC } from './trpc';

type Social = RouterOutputs['reaction']['set'];

// Unstyled on purpose — reactions and comments under a log, to replace with the real design.
export function LogSocial({ ratingId, social }: { ratingId: string; social: Social }) {
  const trpc = useTRPC();
  const { session } = useSession();
  const me = useQuery(trpc.user.me.queryOptions(undefined, { enabled: Boolean(session) }));
  const canTakePart = Boolean(me.data?.profile);

  // The mutation's response is the freshest count, so it wins over the list the log came from
  const [updated, setUpdated] = useState<Social | null>(null);
  const current = updated ?? social;
  const react = useMutation(trpc.reaction.set.mutationOptions({ onSuccess: setUpdated }));

  const [open, setOpen] = useState(false);

  return (
    <div>
      <p>
        {REACTION_TYPES.map((type) => {
          const mine = current.myReaction === type;
          return (
            <button
              key={type}
              type="button"
              title={REACTIONS[type].label}
              aria-label={`${REACTIONS[type].label}: ${current.reactionCounts[type]}`}
              aria-pressed={mine}
              disabled={!canTakePart || react.isPending}
              onClick={() => react.mutate({ ratingId, type: mine ? null : type })}
            >
              {REACTIONS[type].emoji} {current.reactionCounts[type]}
              {mine ? ' (you)' : ''}
            </button>
          );
        })}{' '}
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide comments' : `Comments (${current.commentCount})`}
        </button>
        {react.error ? <span role="alert"> Couldn&apos;t react: {react.error.message}</span> : null}
      </p>
      {open ? (
        <Comments
          ratingId={ratingId}
          canTakePart={canTakePart}
          signedIn={Boolean(session)}
          onCountChange={(commentCount) => setUpdated({ ...current, commentCount })}
        />
      ) : null}
    </div>
  );
}

function Comments({
  ratingId,
  canTakePart,
  signedIn,
  onCountChange,
}: {
  ratingId: string;
  canTakePart: boolean;
  signedIn: boolean;
  onCountChange: (count: number) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');

  const comments = useInfiniteQuery(
    trpc.comment.list.infiniteQueryOptions(
      { ratingId, limit: 20 },
      { getNextPageParam: (page) => page.nextCursor },
    ),
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.comment.list.queryKey({ ratingId }) });
    const total = queryClient
      .getQueriesData<{ pages: { total: number }[] }>({
        queryKey: trpc.comment.list.queryKey({ ratingId }),
      })
      .map(([, data]) => data?.pages[0]?.total)
      .find((value) => value !== undefined);
    if (total !== undefined) onCountChange(total);
  };

  const create = useMutation(
    trpc.comment.create.mutationOptions({
      onSuccess: async () => {
        setBody('');
        await refresh();
      },
    }),
  );
  const remove = useMutation(trpc.comment.delete.mutationOptions({ onSuccess: refresh }));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (body.trim()) create.mutate({ ratingId, body });
  }

  if (comments.status === 'pending') return <p>Loading comments…</p>;
  if (comments.status === 'error') {
    return <p role="alert">Couldn&apos;t load comments: {comments.error.message}</p>;
  }

  const first = comments.data.pages[0]!;
  const items = comments.data.pages.flatMap((page) => page.items);

  return (
    <section>
      {items.length === 0 ? <p>No comments yet.</p> : null}
      <ul>
        {items.map((comment) => (
          <li key={comment.id}>
            <Link href={`/u/${comment.user.username}`}>
              {comment.user.displayName ?? comment.user.username}
            </Link>
            : {comment.body}{' '}
            {comment.canDelete ? (
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: comment.id })}
              >
                Delete
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {remove.error ? (
        <p role="alert">Couldn&apos;t delete the comment: {remove.error.message}</p>
      ) : null}

      {first.limited ? (
        <p>
          Showing {items.length} of {first.total} comments. <Link href="/sign-in">Sign in</Link> to
          see them all.
        </p>
      ) : null}
      {comments.hasNextPage ? (
        <button
          type="button"
          onClick={() => void comments.fetchNextPage()}
          disabled={comments.isFetchingNextPage}
        >
          {comments.isFetchingNextPage ? 'Loading…' : 'More comments'}
        </button>
      ) : null}

      {canTakePart ? (
        <form onSubmit={submit}>
          <label htmlFor={`comment-${ratingId}`}>Add a comment</label>{' '}
          <input
            id={`comment-${ratingId}`}
            value={body}
            maxLength={COMMENT_MAX_LENGTH}
            onChange={(event) => setBody(event.target.value)}
          />{' '}
          <button type="submit" disabled={create.isPending || !body.trim()}>
            {create.isPending ? 'Posting…' : 'Post'}
          </button>
          {create.error ? (
            <span role="alert"> Couldn&apos;t post: {create.error.message}</span>
          ) : null}
        </form>
      ) : signedIn ? (
        <p>
          <Link href="/log">Choose a username</Link> to react and comment.
        </p>
      ) : (
        <p>
          <Link href="/sign-in">Sign in</Link> to react and comment.
        </p>
      )}
    </section>
  );
}
