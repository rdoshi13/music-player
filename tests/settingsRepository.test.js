import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => ({
  doc: vi.fn((db, collection, id) => ({ db, collection, id })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
}));

vi.mock("firebase/firestore", () => firestoreMocks);
vi.mock("../src/lib/firebaseAuth.js", () => ({
  firestoreDb: { __mockDb: true },
  isFirebaseConfigured: true,
}));

const createLocalStorageMock = () => {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(String(key), String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};

describe("settingsRepository", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    globalThis.window = globalThis;
    globalThis.localStorage = createLocalStorageMock();
  });

  it("writes per-user cache and legacy fallback settings", async () => {
    const repository = await import("../src/lib/settingsRepository.js");

    const normalized = repository.writeCachedSettings(
      "user-a",
      { uiTheme: "dark" },
      { fallbackTheme: "dark" }
    );

    const namespacedCache = globalThis.localStorage.getItem("playerSettingsCache:user-a");
    const legacyCache = globalThis.localStorage.getItem(
      repository.PLAYER_SETTINGS_LOCAL_STORAGE_KEY
    );

    expect(normalized.ui.theme).toBe("dark");
    expect(namespacedCache).toContain("\"schemaVersion\":1");
    expect(legacyCache).toContain("\"uiTheme\":\"dark\"");
  });

  it("loads local settings and backfills Firestore when remote doc is missing", async () => {
    const repository = await import("../src/lib/settingsRepository.js");

    globalThis.localStorage.setItem(
      repository.PLAYER_SETTINGS_LOCAL_STORAGE_KEY,
      JSON.stringify({
        uiTheme: "dark",
        hotkeysEnabled: false,
        updatedAtMs: 125,
      })
    );

    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => false,
    });
    firestoreMocks.setDoc.mockResolvedValue(undefined);

    const loaded = await repository.loadUserSettings("user-backfill", {
      fallbackTheme: "light",
    });

    expect(loaded.ui.theme).toBe("dark");
    expect(loaded.hotkeys.enabled).toBe(false);
    expect(firestoreMocks.setDoc).toHaveBeenCalledTimes(1);
    expect(firestoreMocks.setDoc.mock.calls[0][0]).toMatchObject({
      collection: repository.PLAYER_SETTINGS_COLLECTION,
      id: "user-backfill",
    });
  });

  it("migrates legacy remote payload in subscription and writes upgraded v1 back", async () => {
    const repository = await import("../src/lib/settingsRepository.js");
    const onChange = vi.fn();

    firestoreMocks.onSnapshot.mockImplementation((docRef, snapshotHandler) => {
      snapshotHandler({
        exists: () => true,
        data: () => ({
          uiTheme: "dark",
          hotkeysEnabled: false,
          updatedAtMs: 5,
        }),
      });
      return () => {};
    });
    firestoreMocks.setDoc.mockResolvedValue(undefined);

    const unsubscribe = repository.subscribeToUserSettings(
      "user-subscribe",
      onChange,
      vi.fn(),
      { fallbackTheme: "light" }
    );

    expect(typeof unsubscribe).toBe("function");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].ui.theme).toBe("dark");
    expect(onChange.mock.calls[0][0].hotkeys.enabled).toBe(false);
    expect(firestoreMocks.setDoc).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite future-version remote schema", async () => {
    const repository = await import("../src/lib/settingsRepository.js");

    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        schemaVersion: 99,
        ui: { theme: "dark" },
        updatedAtMs: 1000,
      }),
    });
    firestoreMocks.setDoc.mockResolvedValue(undefined);

    const loaded = await repository.loadUserSettings("user-future", {
      fallbackTheme: "light",
    });

    expect(loaded.ui.theme).toBe("dark");
    expect(firestoreMocks.setDoc).not.toHaveBeenCalled();
  });
});
