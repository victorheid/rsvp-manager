import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon, type IconName } from "./Icon";

/**
 * An inline message that explains a situation or a consequence: "You're
 * in", "Confirms Wed 19:00 if 6+ are in", "You've paid €8.00 — no
 * automatic refund". Carries an icon and a title so it never relies on
 * colour, and an optional action.
 *
 * Use it to say the rule in plain words at the moment it matters (UI spec
 * §1, principle 3). Don't use it for transient feedback — that's a Toast.
 */
export type BannerTone = "info" | "success" | "warning" | "danger";

const TONES: Record<BannerTone, { box: string; fg: string; icon: IconName }> = {
  info: { box: "border-info-border bg-info-bg", fg: "text-info-fg", icon: "info" },
  success: { box: "border-success-border bg-success-bg", fg: "text-success-fg", icon: "check" },
  warning: { box: "border-warning-border bg-warning-bg", fg: "text-warning-fg", icon: "alert" },
  danger: { box: "border-danger-border bg-danger-bg", fg: "text-danger-fg", icon: "alert" },
};

export interface BannerProps {
  tone?: BannerTone;
  title: string;
  /** Supporting sentence(s). */
  children?: ReactNode;
  /** A single link or button, shown at the end, e.g. "Change". */
  action?: ReactNode;
  className?: string;
}

export function Banner({ tone = "info", title, children, action, className }: BannerProps) {
  const t = TONES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-lg border p-4", t.box, className)}
    >
      <Icon name={t.icon} size={20} className={cn("mt-0.5 shrink-0", t.fg)} />
      <div className="min-w-0 flex-1">
        <p className="text-small-strong text-text-primary">{title}</p>
        {children && <div className="text-small text-text-secondary">{children}</div>}
      </div>
      {action && <div className={cn("shrink-0 text-small-strong", t.fg)}>{action}</div>}
    </div>
  );
}
