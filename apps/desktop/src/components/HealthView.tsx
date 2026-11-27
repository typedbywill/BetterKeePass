import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import type { Translations } from '../i18n/pt-BR';
import { api } from '../lib/tauri';
import { useUiStore } from '../store/ui';
import { Badge, EmptyState, Skeleton } from '../ui';

export function HealthView({ t }: { t: Translations }) {
  const { setSelectedEntryId, setActiveView } = useUiStore();
  const { data, isLoading } = useQuery({
    queryKey: ['health-report'],
    queryFn: () => api.analyzeHealth(),
  });

  if (isLoading) {
    return (
      <section aria-label={t.healthTitle} className="flex-1 p-6 overflow-y-auto bg-bg">
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          <Skeleton className="h-6 w-48" />
          <div className="grid grid-cols-4 gap-3">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        </div>
      </section>
    );
  }

  if (!data) return null;

  const affectedUuids = new Set(data.issues.map((i) => i.uuid));
  const healthyRatio =
    data.totalEntries > 0
      ? Math.max(0, Math.round(((data.totalEntries - affectedUuids.size) / data.totalEntries) * 100))
      : 100;

  return (
    <section aria-label={t.healthTitle} className="flex-1 p-6 overflow-y-auto bg-bg">
      <div className="max-w-3xl mx-auto flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-fg">{t.healthTitle}</h2>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5">
            <span className="text-xs text-fg-muted">{t.healthScore}</span>
            <span className="text-sm font-mono font-semibold text-accent tabular-nums">
              {healthyRatio}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <p className="text-xs text-fg-muted">{t.totalEntries}</p>
            <p className="text-2xl font-semibold font-mono tabular-nums mt-1 text-fg">
              {data.totalEntries}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <p className="text-xs text-fg-muted">{t.emptyPasswords}</p>
            <p className="text-2xl font-semibold font-mono tabular-nums mt-1 text-fg">
              {data.emptyCount}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <p className="text-xs text-fg-muted">{t.weakPasswords}</p>
            <p className="text-2xl font-semibold font-mono tabular-nums mt-1 text-warning">
              {data.weakCount}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <p className="text-xs text-fg-muted">{t.reusedPasswords}</p>
            <p className="text-2xl font-semibold font-mono tabular-nums mt-1 text-danger">
              {data.reusedCount}
            </p>
          </div>
        </div>

        {data.issues.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface">
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5 text-accent" aria-hidden="true" />}
              title={t.noHealthIssues}
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {data.issues.map((issue) => (
              <li key={`${issue.uuid}-${issue.kind}`}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEntryId(issue.uuid);
                    setActiveView('vault');
                  }}
                  className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface hover:bg-surface-hover transition-colors text-left cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ShieldAlert
                      className={
                        issue.kind === 'reusedPassword'
                          ? 'h-4 w-4 text-danger shrink-0'
                          : 'h-4 w-4 text-warning shrink-0'
                      }
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-fg truncate">{issue.title}</p>
                      <p className="text-xs text-fg-muted truncate">{issue.groupPath || 'Root'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={issue.kind === 'reusedPassword' ? 'danger' : 'warning'}>
                      {issue.kind} · {issue.score}
                    </Badge>
                    <ArrowRight
                      className="h-3.5 w-3.5 text-fg-subtle group-hover:text-fg transition-colors"
                      aria-hidden="true"
                    />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
