import { Pip } from './Pip';

export interface PipRowProps {
  current: number;
  max: number;
  className?: string;
}

export function PipRow({ current, max, className = '' }: PipRowProps) {
  return (
    <span className={`inline-flex gap-0.5 ${className}`}>
      {Array.from({ length: max }, (_, i) => (
        <Pip key={i} on={i < current} />
      ))}
    </span>
  );
}
