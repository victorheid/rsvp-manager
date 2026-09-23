import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "./cn";
import { Icon, type IconName } from "./Icon";

/**
 * The one button. Pill-shaped, at least 44px tall (touch target, UI spec
 * §13). Renders a `<button>`, or a Next `<Link>` when you pass `href`.
 *
 * One primary per screen (UI spec §1, principle 1): everything else is
 * `secondary` or `ghost`. `destructive` is only for the button that
 * commits an irreversible action inside a confirmation sheet — never for
 * the button that opens it.
 */
type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "md" | "lg";

interface CommonProps {
  variant?: Variant;
  /** `md` = 44px (inline, secondary). `lg` = 52px (the main action of a screen or sheet). */
  size?: Size;
  fullWidth?: boolean;
  leadingIcon?: IconName;
  children: ReactNode;
}

type ButtonAsButton = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof CommonProps> & {
    href?: undefined;
    /** Shows a spinner, disables the button and announces busy. Buttons only. */
    loading?: boolean;
  };

type ButtonAsLink = CommonProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, keyof CommonProps> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent-default text-text-on-accent hover:bg-accent-pressed active:bg-accent-pressed",
  secondary:
    "border-[1.5px] border-border-strong bg-bg-surface text-text-primary hover:bg-bg-subtle active:bg-bg-subtle",
  ghost: "text-text-link hover:bg-accent-subtle active:bg-accent-subtle",
  destructive: "bg-danger-solid text-text-on-accent hover:opacity-90 active:opacity-90",
};

const SIZES: Record<Size, string> = {
  md: "h-11 px-4",
  lg: "h-13 px-6",
};

function classes(variant: Variant, size: Size, fullWidth: boolean, disabled: boolean): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full text-button transition-colors",
    SIZES[size],
    disabled ? "cursor-not-allowed bg-bg-subtle text-text-tertiary" : VARIANTS[variant],
    fullWidth && "w-full",
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

export function Button(props: ButtonProps) {
  if (props.href !== undefined) {
    const { variant = "primary", size = "md", fullWidth = false, leadingIcon, children, className, ...rest } = props;
    return (
      <Link {...rest} className={cn(classes(variant, size, fullWidth, false), className)}>
        {leadingIcon && <Icon name={leadingIcon} size={18} />}
        {children}
      </Link>
    );
  }

  const {
    variant = "primary",
    size = "md",
    fullWidth = false,
    leadingIcon,
    loading = false,
    disabled,
    children,
    className,
    type = "button",
    ...rest
  } = props;
  const isDisabled = disabled === true || loading;

  return (
    <button
      {...rest}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(classes(variant, size, fullWidth, disabled === true), loading && "opacity-80", className)}
    >
      {loading ? <Spinner /> : leadingIcon && <Icon name={leadingIcon} size={18} />}
      {children}
    </button>
  );
}
