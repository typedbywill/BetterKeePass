import { en } from './en';
import { ptBR, type Translations } from './pt-BR';

export type Language = 'pt-BR' | 'en';

export function getTranslations(lang: Language): Translations {
  return lang === 'en' ? en : ptBR;
}
