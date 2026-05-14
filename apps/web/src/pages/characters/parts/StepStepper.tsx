type Step = { id: string; label: string };

export function StepStepper({
  steps,
  current,
  onJump,
}: {
  steps: readonly Step[];
  current: string;
  onJump: (id: string) => void;
}) {
  return (
    <ol className="flex flex-wrap gap-2">
      {steps.map((s, i) => {
        const isActive = s.id === current;
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onJump(s.id)}
              className={
                'min-h-11 px-3 py-2 text-sm border transition-colors ' +
                (isActive
                  ? 'bg-ink-2 text-accent border-accent'
                  : 'bg-ink-1 text-text-dim border-line hover:border-line-soft hover:text-text')
              }
            >
              <span className="font-mono text-[10px] tracking-[0.14em] text-text-mute mr-1.5">
                {String(i + 1).padStart(2, '0')}
              </span>
              {s.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
