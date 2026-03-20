import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./useAuth";
import { SettingsContext } from "./AppSettingsContext";
import {
  DEFAULT_PLAYER_SETTINGS,
  normalizePlayerSettings,
} from "../lib/settingsSchema";
import {
  isSettingsBackendAvailable,
  loadUserSettings,
  saveRemoteSettings,
  subscribeToUserSettings,
  writeCachedSettings,
} from "../lib/settingsRepository";

const UI_THEME_STORAGE_KEY = "uiTheme";
const SETTINGS_SAVE_DEBOUNCE_MS = 800;

const getThemeFallback = () =>
  localStorage.getItem(UI_THEME_STORAGE_KEY) === "dark" ? "dark" : "light";

const normalizeWithTheme = (input, fallbackTheme) =>
  normalizePlayerSettings(input, { fallbackTheme });

export const SettingsProvider = ({ children }) => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [settings, setSettings] = useState(() =>
    normalizeWithTheme(DEFAULT_PLAYER_SETTINGS, getThemeFallback())
  );
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const lastSyncedSettingsRef = useRef("");
  const unsubscribeRemoteRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.ui.theme);
    localStorage.setItem(UI_THEME_STORAGE_KEY, settings.ui.theme);
  }, [settings.ui.theme]);

  useEffect(() => {
    if (isAuthLoading) {
      return undefined;
    }

    if (unsubscribeRemoteRef.current) {
      unsubscribeRemoteRef.current();
      unsubscribeRemoteRef.current = null;
    }

    if (!user?.uid) {
      setIsSettingsLoading(false);
      setSettings((previousSettings) =>
        normalizeWithTheme(DEFAULT_PLAYER_SETTINGS, previousSettings.ui.theme)
      );
      lastSyncedSettingsRef.current = "";
      return undefined;
    }

    let isCancelled = false;
    setIsSettingsLoading(true);
    setSettingsError("");

    void (async () => {
      try {
        const loadedSettings = await loadUserSettings(user.uid, {
          fallbackTheme: getThemeFallback(),
        });
        if (isCancelled) {
          return;
        }
        const loadedJson = JSON.stringify(loadedSettings);
        lastSyncedSettingsRef.current = loadedJson;
        setSettings(loadedSettings);
      } catch {
        if (!isCancelled) {
          setSettingsError("Could not load synced settings. Using local defaults.");
          setSettings((previousSettings) =>
            normalizeWithTheme(DEFAULT_PLAYER_SETTINGS, previousSettings.ui.theme)
          );
          lastSyncedSettingsRef.current = "";
        }
      } finally {
        if (!isCancelled) {
          setIsSettingsLoading(false);
        }
      }
    })();

    unsubscribeRemoteRef.current = subscribeToUserSettings(
      user.uid,
      (remoteSettings) => {
        if (isCancelled) {
          return;
        }
        const remoteJson = JSON.stringify(remoteSettings);
        lastSyncedSettingsRef.current = remoteJson;
        setSettings(remoteSettings);
      },
      () => {
        if (!isCancelled) {
          setSettingsError("Realtime settings sync is unavailable right now.");
        }
      },
      { fallbackTheme: getThemeFallback() }
    );

    return () => {
      isCancelled = true;
      if (unsubscribeRemoteRef.current) {
        unsubscribeRemoteRef.current();
        unsubscribeRemoteRef.current = null;
      }
    };
  }, [isAuthLoading, user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      return undefined;
    }

    const normalizedSettings = normalizeWithTheme(settings, settings.ui.theme);
    writeCachedSettings(user.uid, normalizedSettings, {
      fallbackTheme: settings.ui.theme,
    });

    const currentSettingsJson = JSON.stringify(normalizedSettings);
    if (currentSettingsJson === lastSyncedSettingsRef.current) {
      return undefined;
    }

    if (!isSettingsBackendAvailable()) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setIsSavingSettings(true);
      void saveRemoteSettings(user.uid, normalizedSettings, {
        fallbackTheme: settings.ui.theme,
      })
        .then((savedSettings) => {
          lastSyncedSettingsRef.current = JSON.stringify(savedSettings);
          setSettingsError("");
        })
        .catch(() => {
          setSettingsError("Could not sync settings to cloud. Retrying on next change.");
        })
        .finally(() => {
          setIsSavingSettings(false);
        });
    }, SETTINGS_SAVE_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [settings, user?.uid]);

  const updateSettings = useCallback((nextSettingsOrUpdater) => {
    setSettings((previousSettings) => {
      const nextCandidate =
        typeof nextSettingsOrUpdater === "function"
          ? nextSettingsOrUpdater(previousSettings)
          : nextSettingsOrUpdater;
      return normalizeWithTheme(nextCandidate, previousSettings.ui.theme);
    });
  }, []);

  const replaceSettings = useCallback((nextSettingsOrRaw) => {
    setSettings((previousSettings) =>
      normalizeWithTheme(nextSettingsOrRaw, previousSettings.ui.theme)
    );
  }, []);

  const resetSettingsToDefaults = useCallback(() => {
    setSettings((previousSettings) =>
      normalizeWithTheme(DEFAULT_PLAYER_SETTINGS, previousSettings.ui.theme)
    );
  }, []);

  const clearSettingsError = useCallback(() => {
    setSettingsError("");
  }, []);

  const contextValue = useMemo(
    () => ({
      settings,
      isSettingsLoading,
      isSavingSettings,
      settingsError,
      updateSettings,
      replaceSettings,
      resetSettingsToDefaults,
      clearSettingsError,
    }),
    [
      clearSettingsError,
      isSavingSettings,
      isSettingsLoading,
      replaceSettings,
      resetSettingsToDefaults,
      settings,
      settingsError,
      updateSettings,
    ]
  );

  return <SettingsContext.Provider value={contextValue}>{children}</SettingsContext.Provider>;
};
