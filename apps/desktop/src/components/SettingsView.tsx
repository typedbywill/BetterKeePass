import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Switch } from '@heroui/react';
import { Info } from 'lucide-react';
import type { Translations } from '../i18n/pt-BR';
import { api } from '../lib/tauri';
import { useUiStore } from '../store/ui';

export function SettingsView({ t }: { t: Translations }) {
  const queryClient = useQueryClient();
  const { theme, setTheme, language, setLanguage, presentationMode, togglePresentationMode } =
    useUiStore();

  const configQuery = useQuery({
    queryKey: ['app-config'],
    queryFn: () => api.getConfig(),
  });

  const browsersQuery = useQuery({
    queryKey: ['paired-browsers'],
    queryFn: () => api.listPairedBrowsers(),
  });

  const managed = configQuery.data?.managed_by_nix ?? false;

  async function handleRevoke(id: string) {
    await api.revokeBrowser(id);
    await queryClient.invalidateQueries({ queryKey: ['paired-browsers'] });
  }

  return (
    <section aria-label={t.settingsTitle} className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{t.settingsTitle}</h2>

        {managed && (
          <div
            role="status"
            className="flex items-center gap-2 p-3 rounded-lg border border-sky-700 bg-sky-950/60 text-sky-200 text-sm"
          >
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t.nixManagedBanner}</span>
          </div>
        )}

        <Card className="border border-slate-800 bg-slate-900/60">
          <Card.Content className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">{t.themeLabel}</span>
              <div className="flex gap-2">
                {(['system', 'light', 'dark'] as const).map((opt) => (
                  <Button
                    key={opt}
                    size="sm"
                    variant={theme === opt ? 'primary' : 'secondary'}
                    isDisabled={managed}
                    onPress={() => setTheme(opt)}
                  >
                    {opt}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 pt-3">
              <span className="text-sm">{t.languageLabel}</span>
              <div className="flex gap-2">
                {(['pt-BR', 'en'] as const).map((lang) => (
                  <Button
                    key={lang}
                    size="sm"
                    variant={language === lang ? 'primary' : 'secondary'}
                    isDisabled={managed}
                    onPress={() => setLanguage(lang)}
                  >
                    {lang}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 pt-3">
              <span className="text-sm">{t.presentationMode}</span>
              <Switch
                isSelected={presentationMode}
                onChange={togglePresentationMode}
                aria-label={t.presentationMode}
              >
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch>
            </div>

            {configQuery.data && (
              <div className="border-t border-slate-800 pt-3 text-xs text-slate-400 flex flex-col gap-1">
                <span>
                  {t.lockAfterLabel}: {configQuery.data.security.lockAfterSeconds}s
                </span>
                <span>
                  {t.clipboardClearLabel}: {configQuery.data.clipboard.clearAfterSeconds}s
                </span>
              </div>
            )}
          </Card.Content>
        </Card>

        <Card className="border border-slate-800 bg-slate-900/60">
          <Card.Header>
            <Card.Title className="text-sm">{t.pairedBrowsers}</Card.Title>
          </Card.Header>
          <Card.Content className="flex flex-col gap-2">
            {browsersQuery.data && browsersQuery.data.length > 0 ? (
              browsersQuery.data.map((browser) => (
                <div
                  key={browser.id}
                  className="flex items-center justify-between p-2 rounded border border-slate-800"
                >
                  <div>
                    <p className="text-sm font-medium">{browser.name}</p>
                    <p className="text-xs text-slate-400">{browser.pairedAt}</p>
                  </div>
                  <Button size="sm" variant="danger" onPress={() => handleRevoke(browser.id)}>
                    {t.revokeBrowser}
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400">{t.noPairedBrowsers}</p>
            )}
          </Card.Content>
        </Card>
      </div>
    </section>
  );
}
