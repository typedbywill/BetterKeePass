import { useQuery } from '@tanstack/react-query';
import { Card, Chip } from '@heroui/react';
import type { Translations } from '../i18n/pt-BR';
import { api } from '../lib/tauri';

export function HealthView({ t }: { t: Translations }) {
  const { data } = useQuery({
    queryKey: ['health-report'],
    queryFn: () => api.analyzeHealth(),
  });

  if (!data) return null;

  return (
    <section aria-label={t.healthTitle} className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-3xl flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{t.healthTitle}</h2>
        <div className="grid grid-cols-3 gap-3">
          <Card className="border border-slate-800 bg-slate-900/60">
            <Card.Content>
              <p className="text-xs text-slate-400">{t.emptyPasswords}</p>
              <p className="text-2xl font-bold">{data.emptyCount}</p>
            </Card.Content>
          </Card>
          <Card className="border border-slate-800 bg-slate-900/60">
            <Card.Content>
              <p className="text-xs text-slate-400">{t.weakPasswords}</p>
              <p className="text-2xl font-bold text-amber-400">{data.weakCount}</p>
            </Card.Content>
          </Card>
          <Card className="border border-slate-800 bg-slate-900/60">
            <Card.Content>
              <p className="text-xs text-slate-400">{t.reusedPasswords}</p>
              <p className="text-2xl font-bold text-rose-400">{data.reusedCount}</p>
            </Card.Content>
          </Card>
        </div>

        <ul className="flex flex-col gap-2">
          {data.issues.map((issue) => (
            <li
              key={`${issue.uuid}-${issue.kind}`}
              className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/50"
            >
              <div>
                <p className="text-sm font-medium">{issue.title}</p>
                <p className="text-xs text-slate-400">{issue.groupPath || 'Root'}</p>
              </div>
              <Chip size="sm" color="warning" variant="soft">
                {issue.kind} (score {issue.score})
              </Chip>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
