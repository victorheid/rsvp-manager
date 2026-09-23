"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

/** UI spec §10.2: edit group. Name and description only — the slug never changes. */
export default function EditGroupPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { data: group, isLoading } = trpc.groups.getBySlug.useQuery({ slug });
  const { data: me } = trpc.auth.me.useQuery();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const loaded = useRef(false);
  useEffect(() => {
    if (!group || loaded.current) return;
    loaded.current = true;
    setName(group.name);
    setDescription(group.description ?? "");
  }, [group]);

  const editGroup = trpc.groups.edit.useMutation({
    onSuccess: (updated) => router.push(`/g/${updated.slug}`),
  });

  if (isLoading) {
    return <main className="mx-auto max-w-2xl p-4">Loading…</main>;
  }

  if (!group) {
    return <main className="mx-auto max-w-2xl p-4">Group not found.</main>;
  }

  if (me && group.organizerId !== me.id) {
    return <main className="mx-auto max-w-2xl p-4">Only the organizer can edit this group.</main>;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">Edit group</h1>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          editGroup.mutate({ groupId: group.id, name, description: description || undefined });
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Description (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>

        {editGroup.error && <p className="text-sm text-red-600">{editGroup.error.message}</p>}

        <button
          type="submit"
          disabled={editGroup.isPending || !name}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {editGroup.isPending ? "Saving…" : "Save"}
        </button>
      </form>
    </main>
  );
}
