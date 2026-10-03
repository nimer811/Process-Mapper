import { useDeferredValue } from 'react';
import { useSearchParams } from 'react-router';
import { VersionStatus } from '@process-ai/shared';

/** Search text and status filter kept in the URL so results can be shared and survive reloads. */
export function useListParams() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const parsed = VersionStatus.safeParse(params.get('status'));
  const status = parsed.success ? parsed.data : undefined;
  const deferredQ = useDeferredValue(q);

  const update = (next: { q?: string; status?: VersionStatus | undefined }) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if ('q' in next) {
          if (next.q) p.set('q', next.q);
          else p.delete('q');
        }
        if ('status' in next) {
          if (next.status) p.set('status', next.status);
          else p.delete('status');
        }
        return p;
      },
      { replace: true },
    );
  };

  return { q, status, query: { q: deferredQ.trim() || undefined, status }, update };
}
