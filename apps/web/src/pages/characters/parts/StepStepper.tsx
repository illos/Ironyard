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
                'min-h-11 px-3 py-2 rounded-md text-sm border ' +
                (isActive
                  ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                  : 'bg-neutral-900 text-neutral-300 border-neutral-800 hover:border-neutral-700')
              }
            >
              {i + 1}. {s.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
