import type { Metadata } from "next";
import { headers } from "next/headers";
import { db } from "@/server/db";
import { getEventBySlug } from "@/server/domains/events";
import { EventPage } from "./_components/EventPage";
import { eventShareImagePath, eventSharePreview } from "./_components/eventSharePreview";

/**
 * The link preview chat apps show (WhatsApp, iMessage…): the same title,
 * details and status as the share sheet's card, plus an image of it. The
 * image URL is versioned by the preview so a changed game gets a fresh one.
 */
export async function generateMetadata({ params }: PageProps<"/e/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const now = new Date();
  const event = await getEventBySlug(db, slug, { now });

  if (!event) {
    return {};
  }

  // Chat apps need absolute URLs; the request's own host keeps it right on every deploy.
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  const preview = eventSharePreview(event, now);
  const description = `${preview.status} · ${preview.details} · ${preview.summary}`;

  return {
    metadataBase: new URL(`${protocol}://${host}`),
    title: preview.title,
    description,
    openGraph: {
      type: "website",
      title: preview.title,
      description,
      // No og:url: pointing it at the bare link would let WhatsApp fold a versioned share back into its cache.
      images: [{ url: eventShareImagePath(slug, preview), width: 1200, height: 630, alt: `${preview.title} · ${preview.summary}` }],
    },
  };
}

export default function Page() {
  return <EventPage />;
}
