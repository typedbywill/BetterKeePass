import { invoke } from '@tauri-apps/api/core';

export interface EntrySummary {
  uuid: string;
  title: string;
  username: string;
  url: string;
  tags: string[];
  groupPath: string;
}

export interface GroupNode {
  uuid: string;
  name: string;
  path: string;
  entryCount: number;
  isRecycleBin: boolean;
  children: GroupNode[];
}

export interface CustomFieldView {
  name: string;
  value: string | null;
  protected: boolean;
}

export interface EntryDetailsView {
  summary: EntrySummary;
  notes: string;
  hasOtp: boolean;
  customFields: CustomFieldView[];
  attachments: string[];
}

export interface HistoryEntrySummary {
  index: number;
  title: string;
  username: string;
  lastModified: string | null;
}

export interface OtpCode {
  code: string;
  validForSecs: number;
  periodSecs: number;
}

export interface HealthIssue {
  uuid: string;
  title: string;
  groupPath: string;
  score: number;
  kind: 'emptyPassword' | 'weakPassword' | 'reusedPassword';
}

export interface HealthReport {
  totalEntries: number;
  emptyCount: number;
  weakCount: number;
  reusedCount: number;
  issues: HealthIssue[];
}

export interface AppConfig {
  security: { lockAfterSeconds: number; lockOnSessionLock: boolean };
  clipboard: { clearAfterSeconds: number };
  ui: { theme: string; language: string; presentationMode: boolean };
  managed_by_nix: boolean;
}

export interface PairedBrowser {
  id: string;
  name: string;
  publicKeyB64: string;
  pairedAt: string;
}

export interface NewEntryPayload {
  groupPath?: string;
  title: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  tags: string[];
}

const hasTauri = () =>
  typeof window !== 'undefined' &&
  '__TAURI_INTERNALS__' in (window as unknown as Record<string, unknown>);

// Estado mock em memória usado apenas em preview web / testes sem runtime Tauri.
const mockEntries: (EntryDetailsView & { _secret: string })[] = [
  {
    summary: {
      uuid: '11111111-1111-4111-8111-111111111111',
      title: 'GitHub',
      username: 'octocat',
      url: 'https://github.com',
      tags: ['Passkey', 'Dev'],
      groupPath: 'Desenvolvimento',
    },
    notes: 'Passkey ES256 armazenada no KDBX',
    hasOtp: true,
    customFields: [
      { name: 'KPEX_PASSKEY_RELYING_PARTY', value: null, protected: true },
      { name: 'KPEX_PASSKEY_CREDENTIAL_ID', value: null, protected: true },
    ],
    attachments: ['recovery-codes.txt'],
    _secret: 'Demo-GitHub-Pass!99',
  },
  {
    summary: {
      uuid: '22222222-2222-4222-8222-222222222222',
      title: 'Proton Mail',
      username: 'alice@proton.me',
      url: 'https://mail.proton.me',
      tags: ['Email'],
      groupPath: 'Pessoal',
    },
    notes: 'Conta principal',
    hasOtp: false,
    customFields: [],
    attachments: [],
    _secret: '123456',
  },
];

let mockBrowsers: PairedBrowser[] = [
  {
    id: 'b1',
    name: 'Firefox (NixOS)',
    publicKeyB64: 'mN8x...9qQ',
    pairedAt: '2026-11-27T10:00:00Z',
  },
];

export const api = {
  async openVault(path: string, password: string, keyfile?: string): Promise<void> {
    if (hasTauri()) {
      await invoke('open_vault', { path, password, keyfile: keyfile || null });
    }
  },
  async createVault(path: string, password: string, name?: string): Promise<void> {
    if (hasTauri()) {
      await invoke('create_vault', { path, password, name: name || null });
    }
  },
  async lockVault(): Promise<void> {
    if (hasTauri()) {
      await invoke('lock_vault');
    }
  },
  async listEntries(query: string): Promise<EntrySummary[]> {
    if (hasTauri()) {
      return invoke('search_entries', { query });
    }
    const q = query.trim().toLowerCase();
    return mockEntries
      .map((e) => e.summary)
      .filter((s) => {
        if (!q) return true;
        if (q.startsWith('tag:')) {
          const needle = q.slice(4);
          return s.tags.some((t) => t.toLowerCase().includes(needle));
        }
        if (q.startsWith('title:')) {
          return s.title.toLowerCase().includes(q.slice(6));
        }
        return (
          s.title.toLowerCase().includes(q) ||
          s.username.toLowerCase().includes(q) ||
          s.url.toLowerCase().includes(q)
        );
      });
  },
  async getGroupTree(): Promise<GroupNode> {
    if (hasTauri()) {
      return invoke('get_group_tree');
    }
    return {
      uuid: 'root',
      name: 'Root',
      path: '',
      entryCount: 0,
      isRecycleBin: false,
      children: [
        {
          uuid: 'g1',
          name: 'Desenvolvimento',
          path: 'Desenvolvimento',
          entryCount: 1,
          isRecycleBin: false,
          children: [],
        },
        {
          uuid: 'g2',
          name: 'Pessoal',
          path: 'Pessoal',
          entryCount: 1,
          isRecycleBin: false,
          children: [],
        },
      ],
    };
  },
  async getEntryDetails(uuid: string): Promise<EntryDetailsView> {
    if (hasTauri()) {
      return invoke('get_entry_details', { uuid });
    }
    const found = mockEntries.find((e) => e.summary.uuid === uuid);
    if (!found) throw new Error('Entry not found');
    return {
      summary: found.summary,
      notes: found.notes,
      hasOtp: found.hasOtp,
      customFields: found.customFields,
      attachments: found.attachments,
    };
  },
  async revealPassword(uuid: string): Promise<string> {
    if (hasTauri()) {
      return invoke('reveal_entry_password', { uuid });
    }
    const found = mockEntries.find((e) => e.summary.uuid === uuid);
    return found?._secret ?? '';
  },
  async copySecret(uuid: string, field: 'password' | 'username'): Promise<void> {
    if (hasTauri()) {
      await invoke('copy_entry_field', { uuid, field });
    }
  },
  async getTotp(uuid: string): Promise<OtpCode> {
    if (hasTauri()) {
      return invoke('get_entry_totp', { uuid });
    }
    return { code: '482910', validForSecs: 24, periodSecs: 30 };
  },
  async getHistory(uuid: string): Promise<HistoryEntrySummary[]> {
    if (hasTauri()) {
      return invoke('get_entry_history', { uuid });
    }
    return [];
  },
  async addEntry(payload: NewEntryPayload): Promise<string> {
    if (hasTauri()) {
      return invoke('add_entry', { payload });
    }
    const uuid = crypto.randomUUID();
    mockEntries.push({
      summary: {
        uuid,
        title: payload.title,
        username: payload.username ?? '',
        url: payload.url ?? '',
        tags: payload.tags,
        groupPath: payload.groupPath ?? '',
      },
      notes: payload.notes ?? '',
      hasOtp: false,
      customFields: [],
      attachments: [],
      _secret: payload.password ?? '',
    });
    return uuid;
  },
  async deleteEntry(uuid: string): Promise<void> {
    if (hasTauri()) {
      await invoke('delete_entry', { uuid, permanent: false });
      return;
    }
    const idx = mockEntries.findIndex((e) => e.summary.uuid === uuid);
    if (idx >= 0) mockEntries.splice(idx, 1);
  },
  async generatePassword(length = 20): Promise<string> {
    if (hasTauri()) {
      return invoke('generate_password_cmd', { length });
    }
    return 'Xk9#mP2$vL7@nQ4&rT8!';
  },
  async generatePassphrase(words = 5): Promise<string> {
    if (hasTauri()) {
      return invoke('generate_passphrase_cmd', { words });
    }
    return 'aurora-cofre-cedro-atlas-floresta';
  },
  async analyzeHealth(): Promise<HealthReport> {
    if (hasTauri()) {
      return invoke('analyze_health_cmd');
    }
    return {
      totalEntries: mockEntries.length,
      emptyCount: 0,
      weakCount: 1,
      reusedCount: 0,
      issues: [
        {
          uuid: '22222222-2222-4222-8222-222222222222',
          title: 'Proton Mail',
          groupPath: 'Pessoal',
          score: 0,
          kind: 'weakPassword',
        },
      ],
    };
  },
  async getConfig(): Promise<AppConfig> {
    if (hasTauri()) {
      return invoke('get_app_config');
    }
    return {
      security: { lockAfterSeconds: 300, lockOnSessionLock: true },
      clipboard: { clearAfterSeconds: 15 },
      ui: { theme: 'system', language: 'pt-BR', presentationMode: false },
      managed_by_nix: false,
    };
  },
  async listPairedBrowsers(): Promise<PairedBrowser[]> {
    if (hasTauri()) {
      return invoke('list_paired_browsers');
    }
    return mockBrowsers;
  },
  async revokeBrowser(id: string): Promise<void> {
    if (hasTauri()) {
      await invoke('revoke_paired_browser', { id });
      return;
    }
    mockBrowsers = mockBrowsers.filter((b) => b.id !== id);
  },
};
