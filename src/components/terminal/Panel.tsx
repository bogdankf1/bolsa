import { type ReactNode } from "react";

type Props = {
  title?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function Panel({
  title,
  rightSlot,
  children,
  className = "",
  bodyClassName = "",
}: Props) {
  return (
    <section
      className={`flex min-h-0 flex-col border border-[var(--color-phosphor-dark)] ${className}`}
    >
      {title ? (
        <header className="flex items-center justify-between border-b border-[var(--color-phosphor-dark)] bg-[color-mix(in_srgb,var(--color-phosphor)_5%,transparent)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--color-phosphor-dim)]">
          <span className="glow">┌─ {title}</span>
          {rightSlot ? <span>{rightSlot}</span> : null}
        </header>
      ) : null}
      <div className={`min-h-0 flex-1 overflow-auto ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}
