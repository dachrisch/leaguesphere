import { describe, it, expect, beforeEach } from 'vitest';
import { MockGamedayService } from '../mockGamedayApi';

/**
 * This test environment's jsdom has no real `window.localStorage` (accessing
 * it is `undefined` rather than throwing), so we install a minimal in-memory
 * stand-in per test — this also lets tests simulate a throwing storage
 * (private browsing, disabled storage) to verify the service degrades
 * gracefully instead of crashing, per `mockGamedayApi.ts`'s try/catch.
 */
function installFakeLocalStorage(overrides: Partial<Storage> = {}) {
  const store = new Map<string, string>();
  const fake: Storage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
    ...overrides,
  };
  Object.defineProperty(window, 'localStorage', { value: fake, configurable: true });
  return fake;
}

describe('MockGamedayService', () => {
  beforeEach(() => {
    installFakeLocalStorage();
  });

  it('seeds and persists the initial gamedays when nothing is stored yet', async () => {
    const service = new MockGamedayService();
    const { results } = await service.list();

    expect(results.length).toBeGreaterThan(0);
    expect(window.localStorage.getItem('leaguesphere_gamedays')).not.toBeNull();
  });

  it('loads gamedays already present in storage', async () => {
    window.localStorage.setItem(
      'leaguesphere_gamedays',
      JSON.stringify([{ id: 99, name: 'Stored Gameday', date: '2026-01-01', status: 'DRAFT' }])
    );

    const service = new MockGamedayService();
    const gameday = await service.get(99);

    expect(gameday.name).toBe('Stored Gameday');
  });

  it('falls back to the built-in defaults when localStorage.getItem throws', async () => {
    installFakeLocalStorage({
      getItem: () => {
        throw new Error('blocked');
      },
    });

    const service = new MockGamedayService();
    const { results } = await service.list();

    expect(results.length).toBeGreaterThan(0);
  });

  it('falls back to the built-in defaults when stored JSON is unparsable', async () => {
    installFakeLocalStorage({ getItem: () => 'not valid json{{{' });

    const service = new MockGamedayService();
    const { results } = await service.list();

    expect(results.length).toBeGreaterThan(0);
  });

  it('does not throw when localStorage.setItem fails while saving', async () => {
    installFakeLocalStorage({
      setItem: () => {
        throw new Error('quota exceeded');
      },
    });

    const service = new MockGamedayService();

    await expect(service.create({ name: 'New One' })).resolves.toMatchObject({ name: 'New One' });
  });
});
