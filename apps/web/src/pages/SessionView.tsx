import { useParams } from '@tanstack/react-router';

export function SessionView() {
  const { id } = useParams({ from: '/sessions/$id' });
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Session {id}</h1>
      <p className="mt-2 text-neutral-400">
        Hello-session lobby — stub. Phase 0 item 8 wires the WebSocket and lists live members.
      </p>
    </main>
  );
}
