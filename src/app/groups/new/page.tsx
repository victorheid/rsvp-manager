"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Screen, StickyActionBar, TextArea, TextField, TopBar } from "@/components/ui";
import { trpc } from "@/lib/trpc/client";
import { SignInSheet } from "@/app/_components/SignInSheet";
import { useRequireAuth } from "@/app/_components/useRequireAuth";

const FORM_ID = "group-form";

/** UI spec §10.1: create group. Then straight to the group with the share sheet open. */
export default function CreateGroupPage() {
  const router = useRouter();
  const { me, requireAuth, signInSheetProps } = useRequireAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createGroup = trpc.groups.create.useMutation({
    onSuccess: (group) => router.push(`/g/${group.slug}?share=1`),
  });

  function submit() {
    requireAuth(() => createGroup.mutate({ name, description: description || undefined }));
  }

  return (
    <Screen
      topBar={<TopBar backHref="/" title="Create a group" />}
      actionBar={
        <StickyActionBar context={me ? undefined : "You’ll be asked to sign in before this is created"}>
          <Button type="submit" form={FORM_ID} size="lg" fullWidth loading={createGroup.isPending} disabled={!name}>
            Create group
          </Button>
        </StickyActionBar>
      }
    >
      <form
        id={FORM_ID}
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <TextField
          label="Group name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Thursday Basketball Galway"
        />
        <TextArea
          label="Description (optional)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Where you play, level, anything people should know"
        />
        {createGroup.error && (
          <Banner tone="danger" title="Couldn’t create the group">
            {createGroup.error.message}
          </Banner>
        )}
      </form>
      <SignInSheet {...signInSheetProps} />
    </Screen>
  );
}
