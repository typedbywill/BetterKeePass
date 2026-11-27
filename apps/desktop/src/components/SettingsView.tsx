import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Info, Monitor, Moon, Sun } from 'lucide-react';
import type { Language } from '../i18n';
import type { Translations } from '../i18n/pt-BR';
import { cn } from '../lib/cn';
import { api } from '../lib/tauri';
import { resolveDark, THEME_PRESETS } from '../lib/theme';
import { useUiStore, type ThemeMode } from '../store/ui';
import { Button, SegmentedControl, Switch } from '../ui';

export function SettingsView({ t }: { t: Translations }) {
  const queryClient = useQueryClient();
  const {
    theme,
    setTheme,
    themePreset,
    setThemePreset,
    language,
    setLanguage,
    presentationMode,
    togglePresentationMode,
    faviconsEnabled,
    setFaviconsEnabled,
  } = useUiStore();

  const configQuery = useQuery({
    queryKey: ['app-config'],
    queryFn: () => api.getConfig(),
  });

  const browsersQuery = useQuery({
    queryKey: ['paired-browsers'],
    queryFn: () => api.listPairedBrowsers(),
  });

  const managed = configQuery.data?.managedByNix ?? false;
  const previewDark = resolveDark(theme);

  async function handleRevoke(id: string) {
    await api.revokeBrowser(id);
    await queryClient.invalidateQueries({ queryKey: ['paired-browsers'] });
  }

  return (
    <section aria-label={t.settingsTitle} className="flex-1 p-6 overflow-y-auto bg-bg">
      <div className="max-w-2xl mx-auto flex flex-col gap-5">
        <h2 className="text-lg font-semibold tracking-tight text-fg">{t.settingsTitle}</h2>

        {managed && (
          <div
            role="status"
            className="flex items-center gap-2.5 p-3 rounded-xl border border-accent/30 bg-accent-subtle text-fg text-xs"
          >
            <Info className="h-4 w-4 text-accent shrink-0" aria-hidden="true" />
            <span>{t.nixManagedBanner}</span>
          </div>
        )}

        {/* Appearance */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-bg-subtle">
            <h3 className="text-xs font-semibold text-fg">{t.appearanceSection}</h3>
          </div>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-[13px] text-fg">{t.themeLabel}</span>
              <SegmentedControl<ThemeMode>
                ariaLabel={t.themeLabel}
                value={theme}
                onChange={setTheme}
                isDisabled={managed}
                options={[
                  {
                    value: 'system',
                    label: t.themeSystem,
                    icon: <Monitor className="h-3.5 w-3.5" aria-hidden="true" />,
                  },
                  {
                    value: 'light',
                    label: t.themeLight,
                    icon: <Sun className="h-3.5 w-3.5" aria-hidden="true" />,
                  },
                  {
                    value: 'dark',
                    label: t.themeDark,
                    icon: <Moon className="h-3.5 w-3.5" aria-hidden="true" />,
                  },
                ]}
              />
            </div>

            <div className="px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13px] text-fg">{t.customThemesLabel}</p>
                <p className="text-xs text-fg-muted mt-0.5">{t.customThemesDesc}</p>
              </div>
              <div
                role="group"
                aria-label={t.customThemesLabel}
                className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3"
              >
                {THEME_PRESETS.map((item) => {
                  const active = themePreset === item.id;
                  const [bg, surface, accent, fg] = previewDark
                    ? item.darkSwatches
                    : item.lightSwatches;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={managed}
                      aria-pressed={active}
                      onClick={() => setThemePreset(item.id)}
                      className={cn(
                        'group flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'border-accent bg-accent-subtle ring-1 ring-accent'
                          : 'border-border bg-bg-subtle hover:bg-surface-hover hover:border-border-strong',
                      )}
                    >
                      <div
                        className="flex h-7 w-full items-center justify-between rounded-md border px-2"
                        style={{
                          backgroundColor: bg,
                          borderColor: surface,
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: surface }}
                          />
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: accent }}
                          />
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: fg }}
                          />
                        </div>
                        {active && (
                          <Check className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} aria-hidden="true" />
                        )}
                      </div>
                      <span className="truncate text-xs font-medium text-fg">{item.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-[13px] text-fg">{t.languageLabel}</span>
              <SegmentedControl<Language>
                ariaLabel={t.languageLabel}
                value={language}
                onChange={setLanguage}
                isDisabled={managed}
                options={[
                  { value: 'pt-BR', label: 'pt-BR' },
                  { value: 'en', label: 'en' },
                ]}
              />
            </div>

            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13px] text-fg">{t.faviconsLabel}</p>
                <p className="text-xs text-fg-muted mt-0.5">{t.faviconsDesc}</p>
              </div>
              <Switch
                isSelected={faviconsEnabled}
                onChange={setFaviconsEnabled}
                isDisabled={managed}
                aria-label={t.faviconsLabel}
              />
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-bg-subtle">
            <h3 className="text-xs font-semibold text-fg">{t.securitySection}</h3>
          </div>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-[13px] text-fg">{t.presentationMode}</span>
              <Switch
                isSelected={presentationMode}
                onChange={togglePresentationMode}
                aria-label={t.presentationMode}
              />
            </div>

            {configQuery.data && (
              <div className="px-4 py-3 flex flex-col gap-1.5 text-xs text-fg-muted">
                <div className="flex justify-between">
                  <span>{t.lockAfterLabel}</span>
                  <span className="font-mono text-fg tabular-nums">
                    {configQuery.data.security.lockAfterSeconds}s
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>{t.clipboardClearLabel}</span>
                  <span className="font-mono text-fg tabular-nums">
                    {configQuery.data.clipboard.clearAfterSeconds}s
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Paired Browsers */}
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-bg-subtle">
            <h3 className="text-xs font-semibold text-fg">{t.pairedBrowsers}</h3>
          </div>
          <div className="p-4 flex flex-col gap-2">
            {browsersQuery.data && browsersQuery.data.length > 0 ? (
              browsersQuery.data.map((browser) => (
                <div
                  key={browser.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border bg-bg-subtle"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-fg truncate">{browser.name}</p>
                    <p className="text-xs text-fg-muted font-mono truncate">{browser.pairedAt}</p>
                  </div>
                  <Button
                    size="xs"
                    variant="danger"
                    onPress={() => void handleRevoke(browser.id)}
                  >
                    {t.revokeBrowser}
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-xs text-fg-muted">{t.noPairedBrowsers}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
