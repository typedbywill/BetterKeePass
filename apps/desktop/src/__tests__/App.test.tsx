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
}

describe('BetterKeePass Desktop UI', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    await api.setUiConfig({
      theme: 'system',
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
    await waitFor(() => {
      expect(screen.getByText('octocat')).toBeInTheDocument();
    });

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
});
