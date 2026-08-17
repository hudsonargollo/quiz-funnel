import type { FunnelStatus } from '@/lib/funnels';

export default function StatusPill({ status }: { status: FunnelStatus }) {
  const live = status === 'published';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide"
      style={{
        background: live ? 'var(--success-container, rgba(34,197,94,.12))' : 'var(--warning-container, rgba(251,191,36,.12))',
        color: live ? 'var(--success)' : 'var(--warning)',
      }}
    >
      <span
        className="h-[5px] w-[5px] rounded-full"
        style={{ background: live ? 'var(--success)' : 'var(--warning)' }}
      />
      {live ? 'Publicado' : 'Rascunho'}
    </span>
  );
}
