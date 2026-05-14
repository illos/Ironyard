import type { HTMLAttributes, ReactNode } from 'react';

export interface SectionProps extends HTMLAttributes<HTMLElement> {
  /** Small uppercase tracked header, e.g. "PARTY · 4 HEROES". */
  heading?: ReactNode;
  /** Right-aligned slot in the header. */
  right?: ReactNode;
  /** When true, fill available vertical space. */
  fill?: boolean;
  children: ReactNode;
}

export function Section({
  heading,
  right,
  fill = false,
  className = '',
  children,
  ...rest
}: SectionProps) {
  return (
    <section
      {...rest}
      className={`flex flex-col bg-ink-1 border border-line min-h-0 ${
        fill ? 'flex-1' : ''
      } ${className}`}
    >
      {heading && (
        <header className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 border-b border-line-soft">
          <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-mute">
            {heading}
          </h3>
          {right && (
            <div className="flex items-center gap-2 text-[11px] font-mono tracking-[0.08em] text-text-mute">
              {right}
            </div>
          )}
        </header>
      )}
      <div className={`p-2.5 min-h-0 ${fill ? 'flex-1 overflow-y-auto' : ''}`}>{children}</div>
    </section>
  );
}
