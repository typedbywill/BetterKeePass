import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';

export interface EntrySummary {
  uuid: string;
  title: string;
  username: string;
  url: string;
  tags: string[];
  groupPath: string;
  iconId?: number | null;
  customIconUuid?: string | null;
  hasPassword?: boolean;
  hasOtp?: boolean;
  hasPasskey?: boolean;
  hasNotes?: boolean;
}

export interface GroupNode {
  uuid: string;
  name: string;
  path: string;
  entryCount: number;
  isRecycleBin: boolean;
  iconId?: number | null;
  customIconUuid?: string | null;
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

export interface UiConfig {
  theme: string;
  themePreset?: string;
  language: string;
  presentationMode: boolean;
  sidebarCollapsed: boolean;
  listWidth: number;
  fetchFavicons: boolean;
  sortBy: string;
  expandedGroups?: string[];
}

export interface SecurityConfig {
  lockAfterSeconds: number;
  lockOnSessionLock: boolean;
  rememberSession: boolean;
}

export interface ClipboardConfig {
  clearAfterSeconds: number;
}

export interface BrowserIntegrationConfig {
  firefox: boolean;
  chromium: boolean;
  brave: boolean;
}

export interface SecretServiceConfig {
  enable: boolean;
  exposedGroups: string[];
}

export interface SshAgentConfig {
  enable: boolean;
}

export interface AppConfig {
  security: SecurityConfig;
  clipboard: ClipboardConfig;
  ui: UiConfig;
  browserIntegration: BrowserIntegrationConfig;
  secretService: SecretServiceConfig;
  sshAgent: SshAgentConfig;
  managedByNix: boolean;
}

export interface AppConfigPatch {
  security?: SecurityConfig;
  clipboard?: ClipboardConfig;
  ui?: UiConfig;
  browserIntegration?: BrowserIntegrationConfig;
  secretService?: SecretServiceConfig;
  sshAgent?: SshAgentConfig;
}

export interface SetUiConfigResult {
  persisted: boolean;
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
  iconId?: number;
  customIconBase64?: string;
}

export interface EntryPatchPayload {
  title?: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  tags?: string[];
  iconId?: number;
  customIconBase64?: string;
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
      hasPassword: true,
      hasOtp: true,
      hasPasskey: true,
      hasNotes: true,
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
      hasPassword: true,
      hasOtp: false,
      hasPasskey: false,
      hasNotes: true,
    },
    notes: 'Conta principal',
    hasOtp: false,
    customFields: [],
    attachments: [],
    _secret: '123456',
  },
];

const mockExtraGroups: string[] = [];
const mockGroupIcons = new Map<string, number>();

const mockHistory = new Map<
  string,
  { snapshot: EntryDetailsView & { _secret: string }; lastModified: string }[]
>();

let mockConfig: AppConfig = {
  security: { lockAfterSeconds: 300, lockOnSessionLock: true, rememberSession: false },
  clipboard: { clearAfterSeconds: 15 },
  ui: {
    theme: 'system',
    themePreset: 'default',
    language: 'pt-BR',
    presentationMode: false,
    sidebarCollapsed: false,
    listWidth: 320,
    fetchFavicons: false,
    sortBy: 'title',
    expandedGroups: [],
  },
  browserIntegration: { firefox: false, chromium: false, brave: false },
  secretService: { enable: false, exposedGroups: [] },
  sshAgent: { enable: false },
  managedByNix: false,
};

let mockBrowsers: PairedBrowser[] = [
  {
    id: 'b1',
    name: 'Firefox (NixOS)',
    publicKeyB64: 'mN8x...9qQ',
    pairedAt: '2026-11-27T10:00:00Z',
  },
];

export const api = {
  async chooseVaultFile(create = false): Promise<string | null> {
    if (!hasTauri()) return null;
    const options = { filters: [{ name: "KeePass", extensions: ["kdbx"] }] };
    return create ? save({ ...options, defaultPath: "cofre.kdbx" }) : open({ ...options, multiple: false });
  },
  async chooseKeyFile(): Promise<string | null> {
    if (!hasTauri()) return null;
    return open({ multiple: false });
  },
  async openVault(
    path: string,
    password: string,
    keyfile?: string,
    keepOpen = false,
    rememberSession?: boolean,
  ): Promise<void> {
    if (hasTauri()) {
      await invoke('open_vault', {
        path,
        password,
        keyfile: keyfile || null,
        keepOpen,
        rememberSession: rememberSession ?? null,
      });
      return;
    }
    if (rememberSession !== undefined) {
      mockConfig = {
        ...mockConfig,
        security: { ...mockConfig.security, rememberSession },
      };
    }
    if (typeof localStorage !== 'undefined') {
      if (mockConfig.security.rememberSession) {
        localStorage.setItem('bkp.mockSession', path);
      } else {
        localStorage.removeItem('bkp.mockSession');
      }
    }
  },
  async createVault(
    path: string,
    password: string,
    name?: string,
    keepOpen = false,
    rememberSession?: boolean,
  ): Promise<void> {
    if (hasTauri()) {
      await invoke('create_vault', {
        path,
        password,
        name: name || null,
        keepOpen,
        rememberSession: rememberSession ?? null,
      });
      return;
    }
    if (rememberSession !== undefined) {
      mockConfig = {
        ...mockConfig,
        security: { ...mockConfig.security, rememberSession },
      };
    }
    if (typeof localStorage !== 'undefined') {
      if (mockConfig.security.rememberSession) {
        localStorage.setItem('bkp.mockSession', path);
      } else {
        localStorage.removeItem('bkp.mockSession');
      }
    }
  },
  async restoreSession(): Promise<string | null> {
    if (hasTauri()) {
      return invoke('restore_session');
    }
    if (mockConfig.security.rememberSession && typeof localStorage !== 'undefined') {
      return localStorage.getItem('bkp.mockSession');
    }
    return null;
  },
  async lockVault(): Promise<void> {
    if (hasTauri()) {
      await invoke('lock_vault');
      return;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('bkp.mockSession');
    }
  },
  async onVaultLocked(callback: () => void): Promise<() => void> {
    if (hasTauri()) {
      return listen('vault-locked', () => callback());
    }
    return () => {};
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
    const base: GroupNode = {
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
          entryCount: mockEntries.filter((e) => e.summary.groupPath === 'Desenvolvimento').length,
          isRecycleBin: false,
          children: [
            {
              uuid: 'g1-1',
              name: 'Infra',
              path: 'Desenvolvimento/Infra',
              entryCount: mockEntries.filter(
                (e) => e.summary.groupPath === 'Desenvolvimento/Infra',
              ).length,
              isRecycleBin: false,
              children: [],
            },
          ],
        },
        {
          uuid: 'g2',
          name: 'Pessoal',
          path: 'Pessoal',
          entryCount: mockEntries.filter((e) => e.summary.groupPath === 'Pessoal').length,
          isRecycleBin: false,
          children: [],
        },
      ],
    };
    for (const gp of mockExtraGroups) {
      const segments = gp.split('/').map((s) => s.trim()).filter(Boolean);
      let cur = base;
      let acc = '';
      for (const seg of segments) {
        acc = acc ? `${acc}/${seg}` : seg;
        let found = cur.children.find((c) => c.name === seg);
        if (!found) {
          found = {
            uuid: `mock-${acc}`,
            name: seg,
            path: acc,
            entryCount: mockEntries.filter((e) => e.summary.groupPath === acc).length,
            isRecycleBin: false,
            children: [],
          };
          cur.children.push(found);
        }
        cur = found;
      }
    }
    const applyIcons = (group: GroupNode) => {
      const icon = mockGroupIcons.get(group.path);
      if (icon !== undefined) group.iconId = icon;
      group.children.forEach(applyIcons);
    };
    applyIcons(base);
    return base;
  },
  async getEntryDetails(uuid: string): Promise<EntryDetailsView> {
    if (hasTauri()) {
      return invoke('get_entry_details', { uuid });
    }
    const found = mockEntries.find((e) => e.summary.uuid === uuid);
    if (!found) throw new Error('Entry not found');
    return {
      summary: { ...found.summary, tags: [...found.summary.tags] },
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
  async copySecret(uuid: string, field: 'password' | 'username' | 'totp'): Promise<void> {
    if (hasTauri()) {
      await invoke('copy_entry_field', { uuid, field });
      return;
    }
    const found = mockEntries.find((e) => e.summary.uuid === uuid);
    if (!found || typeof navigator === 'undefined' || !navigator.clipboard) return;
    const text =
      field === 'password'
        ? found._secret
        : field === 'username'
          ? found.summary.username
          : '482910';
    await navigator.clipboard.writeText(text).catch(() => {});
  },
  async getTotp(uuid: string): Promise<OtpCode> {
    if (hasTauri()) {
      return invoke('get_entry_totp', { uuid });
    }
    const periodSecs = 30;
    const epochSecs = Math.floor(Date.now() / 1000);
    const validForSecs = periodSecs - (epochSecs % periodSecs);
    return { code: '482910', validForSecs, periodSecs };
  },
  async getHistory(uuid: string): Promise<HistoryEntrySummary[]> {
    if (hasTauri()) {
      return invoke('get_entry_history', { uuid });
    }
    const revs = mockHistory.get(uuid) ?? [];
    return revs.map((rev, index) => ({
      index,
      title: rev.snapshot.summary.title,
      username: rev.snapshot.summary.username,
      lastModified: rev.lastModified,
    }));
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
        hasPassword: Boolean(payload.password),
        hasOtp: payload.tags.some((t) => t.toLowerCase() === 'otp' || t.toLowerCase() === 'totp'),
        hasPasskey: payload.tags.some((t) => t.toLowerCase() === 'passkey'),
        hasNotes: Boolean(payload.notes?.trim()),
      },
      notes: payload.notes ?? '',
      hasOtp: false,
      customFields: [],
      attachments: [],
      _secret: payload.password ?? '',
    });
    return uuid;
  },
  async updateEntry(uuid: string, patch: EntryPatchPayload): Promise<void> {
    if (hasTauri()) {
      await invoke('update_entry', { uuid, patch });
      return;
    }
    const found = mockEntries.find((e) => e.summary.uuid === uuid);
    if (!found) throw new Error('Entry not found');
    const prevList = mockHistory.get(uuid) ?? [];
    prevList.unshift({
      snapshot: structuredClone(found),
      lastModified: new Date().toISOString(),
    });
    mockHistory.set(uuid, prevList);

    if (patch.title !== undefined) found.summary.title = patch.title;
    if (patch.username !== undefined) found.summary.username = patch.username;
    if (patch.url !== undefined) found.summary.url = patch.url;
    if (patch.tags !== undefined) {
      found.summary.tags = patch.tags;
      found.summary.hasPasskey = patch.tags.some((t) => t.toLowerCase() === 'passkey');
    }
    if (patch.notes !== undefined) {
      found.notes = patch.notes;
      found.summary.hasNotes = patch.notes.trim().length > 0;
    }
    if (patch.password !== undefined) {
      found._secret = patch.password;
      found.summary.hasPassword = patch.password.length > 0;
    }
    if (patch.customIconBase64 !== undefined) {
      found.summary.customIconUuid = `mock-icon-${uuid}`;
    } else if (patch.iconId !== undefined) {
      found.summary.iconId = patch.iconId;
      found.summary.customIconUuid = null;
    }
  },
  async restoreHistory(uuid: string, index: number): Promise<void> {
    if (hasTauri()) {
      await invoke('restore_history', { uuid, index });
      return;
    }
    const revs = mockHistory.get(uuid) ?? [];
    const target = revs[index];
    const currentIdx = mockEntries.findIndex((e) => e.summary.uuid === uuid);
    if (!target || currentIdx < 0) return;
    const current = structuredClone(mockEntries[currentIdx]);
    mockEntries[currentIdx] = structuredClone(target.snapshot);
    revs.unshift({ snapshot: current, lastModified: new Date().toISOString() });
  },
  async deleteEntry(uuid: string): Promise<void> {
    if (hasTauri()) {
      await invoke('delete_entry', { uuid, permanent: false });
      return;
    }
    const idx = mockEntries.findIndex((e) => e.summary.uuid === uuid);
    if (idx >= 0) {
      const entry = mockEntries[idx];
      if (entry.summary.groupPath.startsWith('Recycle Bin')) {
        mockEntries.splice(idx, 1);
      } else {
        entry.summary.groupPath = 'Recycle Bin';
      }
    }
  },
  async moveEntry(uuid: string, groupPath: string): Promise<void> {
    if (hasTauri()) {
      await invoke('move_entry', { uuid, groupPath });
      return;
    }
    const found = mockEntries.find((e) => e.summary.uuid === uuid);
    if (!found) throw new Error('Entry not found');
    found.summary.groupPath = groupPath;
  },
  async getCustomIcon(uuid: string): Promise<string | null> {
    if (hasTauri()) {
      return invoke('get_custom_icon', { uuid });
    }
    return null;
  },
  async createGroup(groupPath: string): Promise<string> {
    if (hasTauri()) {
      return invoke('create_group', { groupPath });
    }
    const clean = groupPath.trim();
    if (clean && !mockExtraGroups.includes(clean)) {
      mockExtraGroups.push(clean);
    }
    return `mock-${clean}`;
  },
  async setGroupIcon(groupPath: string, iconId: number): Promise<void> {
    if (hasTauri()) return invoke('set_group_icon', { groupPath, iconId });
    mockGroupIcons.set(groupPath, iconId);
  },
  async fetchFaviconFromUrl(url: string): Promise<string> {
    if (hasTauri()) {
      return invoke('fetch_favicon_from_url', { url });
    }
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  },
  async generatePassword(length = 20): Promise<string> {
    if (hasTauri()) {
      return invoke('generate_password_cmd', { length });
    }
    const alphabet =
      'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*_-+=';
    const out: string[] = [];
    for (let i = 0; i < length; i += 1) {
      out.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
    }
    return out.join('');
  },
  async generatePassphrase(words = 5): Promise<string> {
    if (hasTauri()) {
      return invoke('generate_passphrase_cmd', { words });
    }
    const pool = [
      'aurora',
      'cofre',
      'cedro',
      'atlas',
      'floresta',
      'nevoa',
      'farol',
      'prisma',
      'vertice',
      'sombra',
      'brisa',
      'granito',
    ];
    const out: string[] = [];
    for (let i = 0; i < words; i += 1) {
      out.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return out.join('-');
  },
  async analyzeHealth(): Promise<HealthReport> {
    if (hasTauri()) {
      return invoke('analyze_health_cmd');
    }
    const issues: HealthIssue[] = [];
    let emptyCount = 0;
    let weakCount = 0;
    for (const item of mockEntries) {
      if (!item._secret) {
        emptyCount += 1;
        issues.push({
          uuid: item.summary.uuid,
          title: item.summary.title,
          groupPath: item.summary.groupPath,
          score: 0,
          kind: 'emptyPassword',
        });
      } else if (item._secret.length < 10) {
        weakCount += 1;
        issues.push({
          uuid: item.summary.uuid,
          title: item.summary.title,
          groupPath: item.summary.groupPath,
          score: 1,
          kind: 'weakPassword',
        });
      }
    }
    return {
      totalEntries: mockEntries.length,
      emptyCount,
      weakCount,
      reusedCount: 0,
      issues,
    };
  },
  async getConfig(): Promise<AppConfig> {
    if (hasTauri()) {
      return invoke('get_app_config');
    }
    return structuredClone(mockConfig);
  },
  async setUiConfig(ui: UiConfig): Promise<SetUiConfigResult> {
    if (hasTauri()) {
      return invoke('set_ui_config', { ui });
    }
    mockConfig = { ...mockConfig, ui: { ...ui } };
    return { persisted: !mockConfig.managedByNix };
  },
  async setAppConfig(patch: AppConfigPatch): Promise<SetUiConfigResult> {
    if (hasTauri()) {
      return invoke('set_app_config', { patch });
    }
    if (mockConfig.managedByNix) {
      return { persisted: false };
    }
    mockConfig = {
      ...mockConfig,
      ...(patch.security ? { security: { ...patch.security } } : {}),
      ...(patch.clipboard ? { clipboard: { ...patch.clipboard } } : {}),
      ...(patch.ui ? { ui: { ...patch.ui } } : {}),
      ...(patch.browserIntegration
        ? { browserIntegration: { ...patch.browserIntegration } }
        : {}),
      ...(patch.secretService ? { secretService: { ...patch.secretService } } : {}),
      ...(patch.sshAgent ? { sshAgent: { ...patch.sshAgent } } : {}),
    };
    return { persisted: true };
  },
  async getFavicon(domain: string): Promise<string | null> {
    if (hasTauri()) {
      return invoke('get_favicon', { domain });
    }
    return null;
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
