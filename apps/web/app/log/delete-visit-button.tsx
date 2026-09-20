'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../trpc';

export function DeleteVisitButton({ id, onDeleted }: { id: string; onDeleted?: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const remove = useMutation(
    trpc.visit.delete.mutationOptions({
      onSuccess: async () => {
        // Leave the edit page before its own query refetches a visit that no longer exists
        onDeleted?.();
        await queryClient.invalidateQueries({ queryKey: trpc.visit.pathKey() });
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
          if (
            window.confirm(
              'Delete this visit? Every dish on it goes too, with their photos, reactions and comments.',
            )
          ) {
            remove.mutate({ id });
          }
        }}
      >
        {remove.isPending ? 'Deleting…' : 'Delete visit'}
      </button>
      {remove.error ? (
        <span role="alert"> Couldn&apos;t delete: {remove.error.message}</span>
      ) : null}
    </>
  );
}
