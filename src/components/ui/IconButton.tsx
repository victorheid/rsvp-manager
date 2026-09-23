import Link from "next/link";
import { cn } from "./cn";
import { Icon, type IconName } from "./Icon";

/**
 * A 44px round icon-only button (or link) — back, share, •••. Always has
 * an accessible `label`, since there's no visible text.
 */
export const ICON_BUTTON_CLASS =
  "grid size-11 shrink-0 place-items-center rounded-full text-text-primary hover:bg-bg-subtle active:bg-bg-subtle";

export type IconButtonProps = {
  icon: IconName;
  label: string;
  className?: string;
} & ({ href: string; onClick?: undefined } | { href?: undefined; onClick: () => void });

export function IconButton(props: IconButtonProps) {
  const { icon, label, className } = props;

  if (props.href !== undefined) {
    return (
      <Link href={props.href} aria-label={label} className={cn(ICON_BUTTON_CLASS, className)}>
        <Icon name={icon} />
      </Link>
    );
  }

  return (
    <button type="button" aria-label={label} onClick={props.onClick} className={cn(ICON_BUTTON_CLASS, className)}>
      <Icon name={icon} />
    </button>
  );
}
