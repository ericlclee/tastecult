'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../trpc';

export function DeleteLogButton({ id, onDeleted }: { id: string; onDeleted?: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const remove = useMutation(
    trpc.rating.delete.mutationOptions({
      onSuccess: async () => {
        // Leave the edit page before its own query refetches a log that no longer exists
        onDeleted?.();
        await queryClient.invalidateQueries({ queryKey: trpc.rating.pathKey() });
      },
    }),
  );

  return (
    <>
      <button
        type="button"
        disabled={remove.isPending}
        onClick={() => {
          if (window.confirm('Delete this log? Its photo, reactions and comments go too.')) {
            remove.mutate({ id });
          }
        }}
      >
        {remove.isPending ? 'Deleting…' : 'Delete log'}
      </button>
      {remove.error ? (
        <span role="alert"> Couldn&apos;t delete: {remove.error.message}</span>
      ) : null}
    </>
  );
}
