import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import type { Translations } from '../i18n/pt-BR';
import { api } from '../lib/tauri';
import { Button } from './Button';
import { Popover } from './Popover';
import { SegmentedControl } from './SegmentedControl';
import { Slider } from './Slider';
import { StrengthMeter } from './StrengthMeter';

export interface PasswordGeneratorPopoverProps {
  t: Translations;
  onSelect: (value: string) => void;
  triggerLabel?: string;
}

export function PasswordGeneratorPopover({
  t,
  onSelect,
  triggerLabel,
}: PasswordGeneratorPopoverProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'password' | 'passphrase'>('password');
  const [length, setLength] = useState(20);
  const [words, setWords] = useState(5);
  const [preview, setPreview] = useState('');

  const generate = useCallback(async () => {
    const val =
      mode === 'password'
        ? await api.generatePassword(length)
        : await api.generatePassphrase(words);
    setPreview(val);
  }, [mode, length, words]);

  useEffect(() => {
    if (open) {
      void generate();
    }
  }, [open, generate]);

  return (
    <Popover
      isOpen={open}
      onOpenChange={setOpen}
      placement="bottom end"
      trigger={
        <Button
          size="xs"
          variant="ghost"
          isIconOnly
          aria-label={triggerLabel ?? t.generatorTitle}
          className="h-6 w-6"
        >
          <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
        </Button>
      }
    >
      {(close) => (
        <div className="w-72 p-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg">{t.generatorTitle}</span>
            <SegmentedControl
              size="xs"
              ariaLabel={t.generatorTitle}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'password', label: t.generatorPasswordTab },
                { value: 'passphrase', label: t.generatorPassphraseTab },
              ]}
            />
          </div>

          <div className="rounded-md border border-border bg-bg-subtle px-2.5 py-2 font-mono text-xs text-fg break-all select-all min-h-9 flex items-center justify-between gap-2">
            <span>{preview || '...'}</span>
            <Button
              size="xs"
              variant="ghost"
              isIconOnly
              aria-label={t.regenerate}
              onPress={() => void generate()}
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
            </Button>
          </div>

          <StrengthMeter
            password={preview}
            labels={{
              weak: t.strengthWeak,
              fair: t.strengthFair,
              good: t.strengthGood,
              strong: t.strengthStrong,
            }}
          />

          {mode === 'password' ? (
            <Slider
              label={t.lengthLabel}
              value={length}
              onChange={setLength}
              minValue={8}
              maxValue={64}
            />
          ) : (
            <Slider
              label={t.wordsLabel}
              value={words}
              onChange={setWords}
              minValue={3}
              maxValue={10}
            />
          )}

          <div className="flex justify-end gap-2 pt-1 border-t border-border">
            <Button size="xs" variant="ghost" onPress={close}>
              {t.cancel}
            </Button>
            <Button
              size="xs"
              variant="primary"
              onPress={() => {
                if (preview) onSelect(preview);
                close();
              }}
            >
              {t.useGenerated}
            </Button>
          </div>
        </div>
      )}
    </Popover>
  );
}
