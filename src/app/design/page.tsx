import { notFound } from "next/navigation";
import { DesignGallery } from "./_components/DesignGallery";

/**
 * The living design-system gallery: every component in every state, in
 * Light and Dark. It's the visual half of src/components/ui/README.md and
 * a place to eyeball a change to a component. Development only — it 404s
 * in production.
 */
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <DesignGallery />;
}
