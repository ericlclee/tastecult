'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTRPC } from '../trpc';

export function ProfileSetup({ email }: { email: string | null }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const create = useMutation(
    trpc.user.createProfile.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.user.me.queryKey() }),
    }),
  );

  const errorMessage = create.isError
    ? create.error.data?.code === 'BAD_REQUEST'
      ? 'Usernames are 3–30 lowercase letters, numbers or underscores.'
      : create.error.message
    : null;

  return (
    <section>
      <h2>Choose a username</h2>
      <p>
        You&apos;re signed in{email ? ` as ${email}` : ''}. Pick a username before logging your
        first dish.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({ username: username.trim().toLowerCase() });
        }}
      >
        <label htmlFor="username">Username</label>{' '}
        <input
          id="username"
          required
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />{' '}
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Save username'}
        </button>
      </form>
      <p>3–30 lowercase letters, numbers or underscores.</p>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
    </section>
  );
}
