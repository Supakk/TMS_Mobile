import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Era } from '../dates';
import { deviceLanguage, setActiveLanguage, type Language, type LanguageSetting } from '../i18n';

const KEY = 'tms.settings';

export type EraSetting = Era | 'auto';
type Stored = { language: LanguageSetting; era: EraSetting };

type SettingsState = {
  ready: boolean;
  languageSetting: LanguageSetting;
  eraSetting: EraSetting;
  /** The language in use after resolving "auto". */
  language: Language;
  /** The era in use after resolving "auto": Thai defaults to พ.ศ. */
  era: Era;
  setLanguageSetting: (value: LanguageSetting) => void;
  setEraSetting: (value: EraSetting) => void;
};

const SettingsContext = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [stored, setStored] = useState<Stored>({ language: 'auto', era: 'auto' });

  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(KEY);
        if (raw) setStored({ language: 'auto', era: 'auto', ...(JSON.parse(raw) as Partial<Stored>) });
      } catch {
        // Defaults are fine.
      }
      setReady(true);
    })();
  }, []);

  const persist = useCallback((next: Stored) => {
    setStored(next);
    SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  const language: Language = stored.language === 'auto' ? deviceLanguage() : stored.language;
  const era: Era = stored.era === 'auto' ? (language === 'th' ? 'BE' : 'CE') : stored.era;
  // Set during render so the first paint of the remounted screens already has the right words.
  setActiveLanguage(language);

  const value = useMemo<SettingsState>(
    () => ({
      ready,
      languageSetting: stored.language,
      eraSetting: stored.era,
      language,
      era,
      setLanguageSetting: (next) => persist({ ...stored, language: next }),
      setEraSetting: (next) => persist({ ...stored, era: next }),
    }),
    [ready, stored, language, era, persist],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsState {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside SettingsProvider');
  return value;
}
