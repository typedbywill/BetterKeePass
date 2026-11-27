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

  beforeEach(() => {
    document.documentElement.classList.remove('dark');
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

  it('supports inline editing and calls api.updateEntry', async () => {
    const spy = vi.spyOn(api, 'updateEntry');
    renderApp();
    await unlockDemoVault();

    fireEvent.click(screen.getByText('GitHub'));
    const detail = screen.getByRole('region', { name: 'Detalhes da entrada' });
    await waitFor(() => {
      expect(within(detail).getByText('octocat')).toBeInTheDocument();
    });

    fireEvent.click(within(detail).getByText('octocat'));
    const input = within(detail).getByLabelText('Usuário');
    fireEvent.change(input, { target: { value: 'hubot' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', {
        username: 'hubot',
      });
    });
    expect(await within(detail).findByText('hubot')).toBeInTheDocument();
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

    // Ctrl+N opens New Entry modal
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: /Nova entrada/i })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });

    // ? opens Keyboard Shortcuts modal
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByRole('dialog', { name: /Atalhos de teclado/i })).toBeInTheDocument();
  });
});
