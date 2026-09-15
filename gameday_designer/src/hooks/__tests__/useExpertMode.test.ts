import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useExpertMode } from '../useExpertMode';

/**
 * This test environment's jsdom has no real `window.localStorage` (accessing
 * it is `undefined` rather than throwing), so we install a minimal in-memory
 * stand-in per test — this also lets one test simulate a throwing storage
 * (private browsing, disabled storage) to verify the hook degrades gracefully.
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

describe('useExpertMode', () => {
  beforeEach(() => {
    installFakeLocalStorage();
  });

  it('defaults to false when nothing is stored', () => {
    const { result } = renderHook(() => useExpertMode());
    expect(result.current[0]).toBe(false);
  });

  it('persists true across hook instances (simulating a reload)', () => {
    const { result } = renderHook(() => useExpertMode());
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem('gd_expert_mode')).toBe('true');

    const { result: second } = renderHook(() => useExpertMode());
    expect(second.current[0]).toBe(true);
  });

  it('persists false after toggling back off', () => {
    window.localStorage.setItem('gd_expert_mode', 'true');
    const { result } = renderHook(() => useExpertMode());
    expect(result.current[0]).toBe(true);

    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem('gd_expert_mode')).toBe('false');
  });

  it('does not crash when localStorage throws', () => {
    installFakeLocalStorage({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });

    const { result } = renderHook(() => useExpertMode());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
  });
});
