import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App';

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

describe('BetterKeePass Desktop UI', () => {
  it('unlocks vault, filters entries, toggles presentation mode and opens command palette', async () => {
    renderApp();

    const unlockButton = screen.getByRole('button', { name: /Desbloquear cofre/i });
    fireEvent.click(unlockButton);

    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeInTheDocument();
    });

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
});
