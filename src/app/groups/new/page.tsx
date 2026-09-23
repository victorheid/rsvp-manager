"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { SignInFlow } from "@/app/_components/SignInFlow";
import { useRequireAuth } from "@/app/_components/useRequireAuth";

/** UI spec §10.1: create group. */
export default function CreateGroupPage() {
  const router = useRouter();
  const { me, requireAuth, isSigningIn, handleSignedIn, cancelSignIn } = useRequireAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createGroup = trpc.groups.create.useMutation({
    onSuccess: (group) => router.push(`/g/${group.slug}`),
  });

  function submit() {
    requireAuth(() => createGroup.mutate({ name, description: description || undefined }));
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Create a group</h1>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Thursday Basketball Galway"
            className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Description (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Where you play, level, anything people should know"
            className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>

        {!me && !isSigningIn && (
          <p className="text-xs text-neutral-500">You&apos;ll be asked to sign in before this is created.</p>
        )}

        {createGroup.error && <p className="text-sm text-red-600">{createGroup.error.message}</p>}

        {!isSigningIn && (
          <button
            type="submit"
            disabled={createGroup.isPending || !name}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {createGroup.isPending ? "Creating…" : "Create group"}
          </button>
        )}
      </form>

      {isSigningIn && (
        // Deliberately outside the form above — SignInFlow renders its own
        // <form>, and nested forms are invalid HTML.
        <div className="flex flex-col gap-2">
          <SignInFlow onSuccess={handleSignedIn} />
          <button type="button" className="self-start text-sm text-neutral-500 underline" onClick={cancelSignIn}>
            Cancel
          </button>
        </div>
      )}
    </main>
  );
}
