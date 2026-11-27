import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../App';
import { api } from '../lib/tauri';
import { useUiStore } from '../store/ui';

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

async function unlockDemoVault() {
  const unlockButton = screen.getByRole('button', { name: /Desbloquear cofre/i });
  fireEvent.click(unlockButton);
  await waitFor(() => {
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });
  const skipPin = await screen.findByRole('button', { name: /Agora não/i });
  fireEvent.click(skipPin);
  await waitFor(() => {
    expect(
      screen.queryByRole('dialog', { name: /Criar PIN de desbloqueio/i }),
    ).not.toBeInTheDocument();
  });
}

describe('BetterKeePass Desktop UI', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
    await api.setAppConfig({
      security: { lockAfterSeconds: 300, lockOnSessionLock: true, rememberSession: false },
      clipboard: { clearAfterSeconds: 15 },
      browserIntegration: { firefox: false, chromium: false, brave: false },
      secretService: { enable: false, exposedGroups: [] },
      sshAgent: { enable: false },
    });
    await api.setUiConfig({
      theme: 'system',
      themePreset: 'default',
      language: 'pt-BR',
      presentationMode: false,
      sidebarCollapsed: false,
      listWidth: 320,
      fetchFavicons: false,
      sortBy: 'title',
      expandedGroups: [],
    });
    useUiStore.setState({
      unlocked: false,
      theme: 'system',
      themePreset: 'default',
      language: 'pt-BR',
      presentationMode: false,
      sidebarCollapsed: false,
      listWidth: 320,
      sortBy: 'title',
      faviconsEnabled: false,
      configHydrated: false,
      expandedGroups: [],
      draggingEntryId: null,
      activeView: 'vault',
      groupFilter: 'all',
      selectedEntryId: null,
      searchQuery: '',
      commandPaletteOpen: false,
      entryModalOpen: false,
      shortcutsOpen: false,
      deleteConfirmId: null,
      toasts: [],
    });
  });

  it('unlocks vault, filters entries, toggles presentation mode and opens command palette', async () => {
    renderApp();
    await unlockDemoVault();

    fireEvent.click(screen.getByText('GitHub'));
    const detail = screen.getByRole('region', { name: 'Detalhes da entrada' });
    await within(detail).findByLabelText('Usuário');

    fireEvent.click(screen.getByRole('button', { name: /Modo apresentação/i }));
    expect(
      screen.getByText(/Modo apresentação ativo — valores sensíveis ocultos/i),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: /Paleta de comandos/i })).toBeInTheDocument();
  });

  it('toggles theme and updates .dark class on documentElement', async () => {
    renderApp();
    await unlockDemoVault();

    const darkRadio = screen.getByRole('radio', { name: 'Escuro' });
    fireEvent.click(darkRadio);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    const lightRadio = screen.getByRole('radio', { name: 'Claro' });
    fireEvent.click(lightRadio);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('supports direct input editing and calls api.updateEntry on save', async () => {
    const spy = vi.spyOn(api, 'updateEntry');
    renderApp();
    await unlockDemoVault();

    fireEvent.click(screen.getByText('GitHub'));
    const detail = screen.getByRole('region', { name: 'Detalhes da entrada' });
    const input = await within(detail).findByLabelText('Usuário');
    const passwordInput = within(detail).getByLabelText('Senha');
    await waitFor(() => {
      expect(input).toHaveValue('octocat');
      expect(passwordInput).toHaveValue('Demo-GitHub-Pass!99');
    });

    fireEvent.change(input, { target: { value: 'hubot' } });
    fireEvent.click(within(detail).getByRole('button', { name: /Salvar entrada/i }));

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', {
        username: 'hubot',
      });
    });
    expect(await within(detail).findByDisplayValue('hubot')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('handles keyboard shortcuts for navigation, new entry modal, shortcuts dialog, and copy toast', async () => {
    renderApp();
    await unlockDemoVault();

    // ArrowDown selects first entry (GitHub)
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    const detail = screen.getByRole('region', { name: 'Detalhes da entrada' });
    await waitFor(() => {
      expect(within(detail).getByRole('button', { name: /Copiar senha/i })).toBeInTheDocument();
    });

    // Copy password triggers clipboard countdown toast
    fireEvent.click(within(detail).getByRole('button', { name: /Copiar senha/i }));
    await waitFor(() => {
      expect(screen.getByText(/Senha copiada/i)).toBeInTheDocument();
      expect(screen.getByText(/Limpeza em/i)).toBeInTheDocument();
    });

    // Ctrl+N opens New Entry inline form in the detail pane (same layout as view)
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
    expect(within(detail).getByRole('button', { name: /Cancelar/i })).toBeInTheDocument();
    expect(within(detail).getByLabelText('Título')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(within(detail).queryByRole('button', { name: /Cancelar/i })).not.toBeInTheDocument();
    });

    // ? opens Keyboard Shortcuts modal
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByRole('dialog', { name: /Atalhos de teclado/i })).toBeInTheDocument();
  });

  it('keeps groups collapsed by default, toggles on click, and persists preference', async () => {
    renderApp();
    await unlockDemoVault();

    const sidebar = screen.getByRole('complementary', { name: 'Navegação do cofre' });
    expect(within(sidebar).getByText('Desenvolvimento')).toBeInTheDocument();
    expect(within(sidebar).queryByText('Infra')).not.toBeInTheDocument();

    // Click to open group
    fireEvent.click(within(sidebar).getByText('Desenvolvimento'));
    await waitFor(() => {
      expect(within(sidebar).getByText('Infra')).toBeInTheDocument();
    });
    expect(JSON.parse(localStorage.getItem('bkp.expandedGroups') ?? '[]')).toContain('g1');

    // Click again to close group
    fireEvent.click(within(sidebar).getByText('Desenvolvimento'));
    await waitFor(() => {
      expect(within(sidebar).queryByText('Infra')).not.toBeInTheDocument();
    });
    expect(JSON.parse(localStorage.getItem('bkp.expandedGroups') ?? '[]')).not.toContain('g1');
  });

  it('changes a group icon through its context menu', async () => {
    const iconSpy = vi.spyOn(api, 'setGroupIcon');
    renderApp();
    await unlockDemoVault();
    fireEvent.contextMenu(screen.getByText('Desenvolvimento'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Alterar ícone' }));
    const dialog = screen.getByRole('dialog', { name: 'Alterar ícone' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ícone 42' }));
    await waitFor(() => expect(iconSpy).toHaveBeenCalledWith('Desenvolvimento', 42));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Alterar ícone' })).not.toBeInTheDocument());
  });

  it('supports dragging an entry onto another folder to move it', async () => {
    const moveSpy = vi.spyOn(api, 'moveEntry');
    renderApp();
    await unlockDemoVault();

    const sidebar = screen.getByRole('complementary', { name: 'Navegação do cofre' });
    const entryList = screen.getByRole('region', { name: 'Lista de entradas' });
    const draggableRow = within(entryList).getByText('GitHub').closest('[draggable="true"]')!;
    const targetFolder = within(sidebar).getByText('Pessoal').closest('[data-group-path]')!;

    const dataTransfer = {
      data: {} as Record<string, string>,
      effectAllowed: 'none',
      dropEffect: 'none',
      setData(type: string, val: string) {
        this.data[type] = val;
      },
      getData(type: string) {
        return this.data[type] ?? '';
      },
    };

    fireEvent.dragStart(draggableRow, { dataTransfer });
    fireEvent.dragOver(targetFolder, { dataTransfer });
    fireEvent.drop(targetFolder, { dataTransfer });

    await waitFor(() => {
      expect(moveSpy).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'Pessoal');
    });
    expect(await screen.findByText(/Entrada movida para outra pasta/i)).toBeInTheDocument();
    moveSpy.mockRestore();
  });

  it('creates a new folder from the sidebar hover + button', async () => {
    const createGroupSpy = vi.spyOn(api, 'createGroup');
    renderApp();
    await unlockDemoVault();

    const sidebar = screen.getByRole('complementary', { name: 'Navegação do cofre' });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Nova pasta' }));
    const input = within(sidebar).getByPlaceholderText('Nome da pasta...');
    fireEvent.change(input, { target: { value: 'Trabalho' } });
    fireEvent.submit(input.closest('form')!);

    await waitFor(() => {
      expect(createGroupSpy).toHaveBeenCalledWith('Trabalho');
    });
    expect(await within(sidebar).findByText('Trabalho')).toBeInTheDocument();
    createGroupSpy.mockRestore();
  });

  it('stages icon change in draft and only saves to vault on Save button click', async () => {
    const updateSpy = vi.spyOn(api, 'updateEntry');
    renderApp();
    await unlockDemoVault();

    const entryList = screen.getByRole('region', { name: 'Lista de entradas' });
    expect(within(entryList).queryByRole('searchbox')).not.toBeInTheDocument();

    fireEvent.click(within(entryList).getByText('GitHub'));
    const detail = screen.getByRole('region', { name: 'Detalhes da entrada' });
    const avatarBtn = await within(detail).findByRole('button', { name: 'Alterar ícone' });
    fireEvent.click(avatarBtn);

    expect(screen.getByText('Como deseja definir o ícone?')).toBeInTheDocument();
    expect(screen.getByText('Baixar ícone da URL')).toBeInTheDocument();
    expect(screen.getByText('Ícone personalizado')).toBeInTheDocument();

    // Pick built-in icon: should NOT call updateEntry yet
    const grid = screen.getByText('Ou escolha um ícone padrão').nextElementSibling!;
    const firstIconBtn = grid.querySelector('button')!;
    fireEvent.click(firstIconBtn);
    expect(updateSpy).not.toHaveBeenCalled();

    // Now click Save button -> persists icon to vault
    fireEvent.click(within(detail).getByRole('button', { name: /Salvar entrada/i }));
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', {
        iconId: 0,
      });
    });
    updateSpy.mockRestore();
  });

  it('applies custom themes in Settings and preserves preset when toggling light/dark', async () => {
    renderApp();
    await unlockDemoVault();

    fireEvent.click(screen.getByRole('button', { name: /Configurações/i }));

    const tokyoNightBtn = await screen.findByRole('button', { name: 'Tokyo Night' });
    fireEvent.click(tokyoNightBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('tokyo-night');
    expect(tokyoNightBtn).toHaveAttribute('aria-pressed', 'true');

    const settings = screen.getByRole('region', { name: 'Configurações' });
    fireEvent.click(within(settings).getByRole('radio', { name: 'Escuro' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('tokyo-night');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    fireEvent.click(within(settings).getByRole('radio', { name: 'Claro' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('tokyo-night');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    const grafiteBtn = screen.getByRole('button', { name: 'Grafite' });
    fireEvent.click(grafiteBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('grafite');
    expect(grafiteBtn).toHaveAttribute('aria-pressed', 'true');
    await waitFor(async () => expect((await api.getConfig()).ui.themePreset).toBe('grafite'));
    fireEvent.click(within(settings).getByRole('radio', { name: 'Escuro' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('grafite');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    fireEvent.click(within(settings).getByRole('radio', { name: 'Claro' }));

    const catppuccinBtn = screen.getByRole('button', { name: 'Catppuccin' });
    fireEvent.click(catppuccinBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('catppuccin');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(catppuccinBtn).toHaveAttribute('aria-pressed', 'true');

    const defaultBtn = screen.getByRole('button', { name: 'BetterKeePass' });
    fireEvent.click(defaultBtn);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('displays minimalist icon indicators for entry fields in the entry list', async () => {
    renderApp();
    await unlockDemoVault();

    const entryList = screen.getByRole('region', { name: 'Lista de entradas' });
    const githubRow = within(entryList).getByText('GitHub').closest('li')!;
    expect(within(githubRow).getByLabelText('Usuário')).toBeInTheDocument();
    expect(within(githubRow).getByLabelText('Senha')).toBeInTheDocument();
    expect(within(githubRow).getByLabelText('TOTP')).toBeInTheDocument();
    expect(within(githubRow).getByLabelText('Passkey')).toBeInTheDocument();
    expect(within(githubRow).getByLabelText('Notas')).toBeInTheDocument();
    expect(within(githubRow).getByLabelText('URL')).toBeInTheDocument();

    const protonRow = within(entryList).getByText('Proton Mail').closest('li')!;
    expect(within(protonRow).getByLabelText('Usuário')).toBeInTheDocument();
    expect(within(protonRow).getByLabelText('Senha')).toBeInTheDocument();
    expect(within(protonRow).getByLabelText('Notas')).toBeInTheDocument();
    expect(within(protonRow).getByLabelText('URL')).toBeInTheDocument();
    expect(within(protonRow).queryByLabelText('TOTP')).not.toBeInTheDocument();
    expect(within(protonRow).queryByLabelText('Passkey')).not.toBeInTheDocument();
  });

  it('handles Ctrl+T, Ctrl+U, and Ctrl+O shortcuts for selected entry', async () => {
    const copySpy = vi.spyOn(api, 'copySecret');
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextSpy },
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderApp();
    await unlockDemoVault();

    fireEvent.click(screen.getByText('GitHub'));
    const detail = screen.getByRole('region', { name: 'Detalhes da entrada' });
    await within(detail).findByLabelText('Usuário');

    fireEvent.keyDown(window, { key: 't', ctrlKey: true });
    await waitFor(() => {
      expect(copySpy).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'totp');
    });

    fireEvent.keyDown(window, { key: 'u', ctrlKey: true });
    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith('https://github.com');
    });
    expect(await screen.findByText('URL copiada')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'o', ctrlKey: true });
    expect(openSpy).toHaveBeenCalledWith('https://github.com', '_blank', 'noopener,noreferrer');

    copySpy.mockRestore();
    openSpy.mockRestore();
  });

  it('creates a PIN after unlocking and unlocks with PIN after app restart', async () => {
    const first = renderApp();
    fireEvent.click(screen.getByRole('button', { name: /Desbloquear cofre/i }));
    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });

    const pinDialog = await screen.findByRole('dialog', { name: /Criar PIN de desbloqueio/i });
    const pinField = within(pinDialog).getByLabelText(/PIN \(mínimo 4 caracteres\)/i);
    const confirmField = within(pinDialog).getByLabelText(/Confirmar PIN/i);
    fireEvent.change(pinField, { target: { value: '2580' } });
    fireEvent.change(confirmField, { target: { value: '2580' } });
    fireEvent.click(within(pinDialog).getByRole('button', { name: /Salvar PIN/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Criar PIN de desbloqueio/i })).not.toBeInTheDocument();
    });
    first.unmount();

    // Simulate closing and reopening the app
    useUiStore.setState({ unlocked: false, configHydrated: false });
    renderApp();

    const pinUnlockInput = await screen.findByLabelText(/PIN \(mínimo 4 caracteres\)/i);
    fireEvent.change(pinUnlockInput, { target: { value: '0000' } });
    fireEvent.click(screen.getByRole('button', { name: /Desbloquear com PIN/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/PIN incorreto/i);

    fireEvent.change(screen.getByLabelText(/PIN \(mínimo 4 caracteres\)/i), {
      target: { value: '2580' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Desbloquear com PIN/i }));

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });
  });

  it('configures auto-lock timeout, clipboard timeout, and integrations in Settings', async () => {
    const spy = vi.spyOn(api, 'setAppConfig');
    renderApp();
    await unlockDemoVault();

    fireEvent.click(screen.getByRole('button', { name: /Configurações/i }));

    const lockInput = await screen.findByLabelText(/Bloqueio automático \(segundos\)/i);
    fireEvent.change(lockInput, { target: { value: '45' } });
    fireEvent.blur(lockInput);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          security: expect.objectContaining({ lockAfterSeconds: 45 }),
        }),
      );
    });

    const sshSwitch = screen.getByRole('switch', { name: /Agente SSH integrado/i });
    fireEvent.click(sshSwitch);

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          sshAgent: { enable: true },
        }),
      );
    });

    spy.mockRestore();
  });
});
