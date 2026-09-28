import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../generator/App';

afterEach(() => {
  vi.restoreAllMocks();
});

function stubTeams(results: Array<Record<string, unknown>>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ results }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    )
  );
}

describe('generator App options', () => {
  it('offers color and logo customization and no attribution toggle', () => {
    stubTeams([]);
    const { container } = render(<App />);

    expect(screen.getByTestId('gen-color')).toBeInTheDocument();
    expect(screen.getByTestId('gen-logo')).toBeInTheDocument();
    // Attribution is not an option any more.
    expect(container.querySelector('#opt-powered')).toBeNull();
  });

  it('builds an embed url with the chosen color and logo, and no powered param', async () => {
    stubTeams([{ id: 159, name: 'Renegades', description: 'Ren', logo: null }]);
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: /Renegades \(Ren\)/ }));

    fireEvent.change(screen.getByTestId('gen-color'), {
      target: { value: '#1a73e8' },
    });
    fireEvent.change(screen.getByTestId('gen-logo'), {
      target: { value: 'https://club.de/logo.png' },
    });

    const iframe = await screen.findByTitle('Vorschau');
    const params = new URLSearchParams(
      (iframe.getAttribute('src') ?? '').split('?')[1]
    );
    expect(params.get('color')).toBe('1a73e8');
    expect(params.get('logo')).toBe('https://club.de/logo.png');
    expect(params.has('powered')).toBe(false);
  });
});
