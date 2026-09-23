import { cn } from "./cn";
import { ActionMenu, type ActionMenuItem } from "./ActionMenu";
import { Icon } from "./Icon";

/**
 * One person in the organizer's list. Informational by design: a name and
 * one status line — no buttons. The status line marks what needs
 * attention (red for owes / no-show, amber for cash still to collect,
 * plain grey for everything fine), and every change happens in the •••
 * menu, which opens from anywhere on the row.
 *
 * That keeps the row calm and makes it hard to change something by
 * accident. Build the menu with the most likely action first (see
 * `ActionMenu`); the caller decides which actions exist for this phase
 * (`organizerRowActions` in the rsvps domain).
 *
 * Put rows in a `<div className="rounded-lg border …">` list — each row
 * draws its own bottom divider and the last one drops it.
 */
export type ManageRowTone = "neutral" | "warning" | "danger";

export interface PersonManageRowProps {
  name: string;
  /** The status line: "Paid online · €8.00", "Owes €8.00", "No-show · paid online". */
  detail: string;
  tone?: ManageRowTone;
  items: readonly ActionMenuItem[];
}

const DETAIL_TONES: Record<ManageRowTone, string> = {
  neutral: "text-text-secondary",
  warning: "text-warning-fg",
  danger: "text-danger-fg",
};

export function PersonManageRow({ name, detail, tone = "neutral", items }: PersonManageRowProps) {
  const rowClass = "border-b border-border-default first:rounded-t-lg last:rounded-b-lg last:border-b-0";

  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-strong text-text-primary">{name}</span>
        <span className={cn("block text-small", DETAIL_TONES[tone])}>{detail}</span>
      </span>
      {items.length > 0 && <Icon name="more" className="shrink-0 text-text-secondary" />}
    </>
  );

  if (items.length === 0) {
    return <div className={cn("flex min-h-15 items-center gap-2 px-4 py-2", rowClass)}>{content}</div>;
  }

  return (
    <ActionMenu
      label={`Actions for ${name}`}
      items={items}
      className={rowClass}
      triggerClassName="flex min-h-15 w-full items-center gap-2 rounded-[inherit] px-4 py-2 text-left hover:bg-bg-subtle active:bg-bg-subtle"
    >
      {content}
    </ActionMenu>
  );
}
