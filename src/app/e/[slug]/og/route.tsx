import { ImageResponse } from "next/og";
import { db } from "@/server/db";
import { getEventBySlug } from "@/server/domains/events";
import { eventSharePreview } from "../_components/eventSharePreview";

// Satori can't read CSS variables, so the brand's light-theme token values are spelled out here
// (globals.css: bg-canvas, text-primary, text-secondary, accent-default).
const CANVAS = "#fbf8f5";
const TEXT_PRIMARY = "#1c1815";
const TEXT_SECONDARY = "#5c534b";
const ACCENT = "#d4421e";

/**
 * The Open Graph image for a game: its status, title, when/where and the
 * live headcount, drawn from the same preview as the share sheet. Links
 * carry `?v=` (see `eventShareImagePath`); the image is always rendered
 * from the game as it is now.
 */
export async function GET(_request: Request, { params }: RouteContext<"/e/[slug]/og">) {
  const { slug } = await params;
  const now = new Date();
  const event = await getEventBySlug(db, slug, { now });

  if (!event) {
    return new Response("Not found", { status: 404 });
  }

  const preview = eventSharePreview(event, now);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: CANVAS,
          borderTop: `16px solid ${ACCENT}`,
          color: TEXT_PRIMARY,
        }}
      >
        <div style={{ display: "flex" }}>
          <div style={{ display: "flex", padding: "10px 24px", borderRadius: 999, background: TEXT_PRIMARY, color: CANVAS, fontSize: 32 }}>
            {preview.status}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 76, lineHeight: 1.1 }}>{preview.title}</div>
          <div style={{ display: "flex", fontSize: 38, color: TEXT_SECONDARY }}>{preview.details}</div>
        </div>
        <div style={{ display: "flex", fontSize: 48, color: ACCENT }}>{preview.summary}</div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      // Rendered from live state, so a stale `?v=` must not pin an old image for a year (next/og's default).
      headers: { "cache-control": "public, max-age=300" },
    },
  );
}
