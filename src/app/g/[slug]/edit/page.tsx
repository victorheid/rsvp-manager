"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Banner, Button, EmptyState, Screen, ScreenSkeleton, StickyActionBar, TextArea, TextField, TopBar } from "@/components/ui";
import { trpc } from "@/lib/trpc/client";

const FORM_ID = "group-form";

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
    return <ScreenSkeleton backHref={`/g/${slug}`} />;
  }

  const topBar = <TopBar backHref={`/g/${slug}`} title="Edit group" />;

  if (!group) {
    return (
      <Screen topBar={topBar}>
        <EmptyState icon="info" title="Group not found" />
      </Screen>
    );
  }

  if (me && group.organizerId !== me.id) {
    return (
      <Screen topBar={topBar}>
        <EmptyState icon="lock" title="Only the organizer can edit this group" />
      </Screen>
    );
  }

  return (
    <Screen
      topBar={topBar}
      actionBar={
        <StickyActionBar context="The group’s link doesn’t change">
          <Button type="submit" form={FORM_ID} size="lg" fullWidth loading={editGroup.isPending} disabled={!name}>
            Save changes
          </Button>
        </StickyActionBar>
      }
    >
      <form
        id={FORM_ID}
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          editGroup.mutate({ groupId: group.id, name, description: description || undefined });
        }}
      >
        <TextField label="Group name" required value={name} onChange={(event) => setName(event.target.value)} />
        <TextArea label="Description (optional)" value={description} onChange={(event) => setDescription(event.target.value)} />
        {editGroup.error && (
          <Banner tone="danger" title="Couldn’t save">
            {editGroup.error.message}
          </Banner>
        )}
      </form>
    </Screen>
  );
}
