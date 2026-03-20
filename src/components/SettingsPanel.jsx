import { useEffect, useMemo, useState } from "react";

const PLAYER_SETTINGS_STORAGE_KEY = "playerSettings";

const SETTINGS_SECTIONS = [
  { key: "account", label: "Account" },
  { key: "crossfade", label: "Crossfade" },
  { key: "equalizer", label: "Equalizer" },
  { key: "hotkeys", label: "Hotkeys" },
];

const EQUALIZER_PRESETS = {
  flat: { bass: 0, mid: 0, treble: 0 },
  bassBoost: { bass: 6, mid: 1, treble: -2 },
  vocalBoost: { bass: -1, mid: 5, treble: 1 },
  trebleBoost: { bass: -2, mid: 0, treble: 6 },
};

const DEFAULT_PLAYER_SETTINGS = {
  crossfadeEnabled: false,
  crossfadeSeconds: 4,
  equalizerPreset: "flat",
  equalizer: EQUALIZER_PRESETS.flat,
  hotkeysEnabled: true,
  spacebarPlayPauseEnabled: true,
  arrowSeekEnabled: false,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const getStoredPlayerSettings = () => {
  const rawSettings = localStorage.getItem(PLAYER_SETTINGS_STORAGE_KEY);
  if (!rawSettings) {
    return DEFAULT_PLAYER_SETTINGS;
  }

  try {
    const parsedSettings = JSON.parse(rawSettings);
    if (!parsedSettings || typeof parsedSettings !== "object") {
      return DEFAULT_PLAYER_SETTINGS;
    }

    const parsedEqualizer =
      parsedSettings.equalizer && typeof parsedSettings.equalizer === "object"
        ? parsedSettings.equalizer
        : {};

    return {
      crossfadeEnabled: Boolean(parsedSettings.crossfadeEnabled),
      crossfadeSeconds: clamp(Number(parsedSettings.crossfadeSeconds) || 4, 1, 12),
      equalizerPreset:
        typeof parsedSettings.equalizerPreset === "string"
          ? parsedSettings.equalizerPreset
          : "flat",
      equalizer: {
        bass: clamp(Number(parsedEqualizer.bass) || 0, -12, 12),
        mid: clamp(Number(parsedEqualizer.mid) || 0, -12, 12),
        treble: clamp(Number(parsedEqualizer.treble) || 0, -12, 12),
      },
      hotkeysEnabled:
        parsedSettings.hotkeysEnabled === undefined
          ? true
          : Boolean(parsedSettings.hotkeysEnabled),
      spacebarPlayPauseEnabled:
        parsedSettings.spacebarPlayPauseEnabled === undefined
          ? true
          : Boolean(parsedSettings.spacebarPlayPauseEnabled),
      arrowSeekEnabled: Boolean(parsedSettings.arrowSeekEnabled),
    };
  } catch {
    return DEFAULT_PLAYER_SETTINGS;
  }
};

const SettingsPanel = ({
  user,
  isDarkMode,
  onToggleDarkMode,
  onBackToLibrary,
  onSignOut,
}) => {
  const [activeSection, setActiveSection] = useState("account");
  const [settings, setSettings] = useState(() => getStoredPlayerSettings());

  useEffect(() => {
    localStorage.setItem(PLAYER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(
      new CustomEvent("player:settings-updated", {
        detail: settings,
      })
    );
  }, [settings]);

  const updateSettings = (partialSettings) => {
    setSettings((previousSettings) => ({
      ...previousSettings,
      ...partialSettings,
    }));
  };

  const applyEqualizerPreset = (presetKey) => {
    const presetValues = EQUALIZER_PRESETS[presetKey] || EQUALIZER_PRESETS.flat;
    updateSettings({
      equalizerPreset: presetKey,
      equalizer: presetValues,
    });
  };

  const setEqualizerBand = (band, value) => {
    setSettings((previousSettings) => ({
      ...previousSettings,
      equalizerPreset: "custom",
      equalizer: {
        ...previousSettings.equalizer,
        [band]: clamp(Number(value) || 0, -12, 12),
      },
    }));
  };

  const activeSectionLabel = useMemo(
    () => SETTINGS_SECTIONS.find((section) => section.key === activeSection)?.label || "",
    [activeSection]
  );

  return (
    <section className="panel settings-panel" aria-label="Settings">
      <div className="settings-layout">
        <aside className="settings-sidebar" aria-label="Settings Sections">
          <p className="panel-eyebrow">Settings</p>
          <h3 className="panel-title">Preferences</h3>
          <div className="settings-nav" role="tablist" aria-label="Settings Navigation">
            {SETTINGS_SECTIONS.map((section) => (
              <button
                key={section.key}
                type="button"
                role="tab"
                id={`settings-tab-${section.key}`}
                aria-selected={activeSection === section.key}
                aria-controls={`settings-panel-${section.key}`}
                className={`settings-nav-item ${
                  activeSection === section.key ? "settings-nav-item-active" : ""
                }`}
                onClick={() => setActiveSection(section.key)}
              >
                {section.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost settings-back-btn" onClick={onBackToLibrary}>
            Back to Library
          </button>
        </aside>

        <div
          className="settings-content"
          role="tabpanel"
          id={`settings-panel-${activeSection}`}
          aria-labelledby={`settings-tab-${activeSection}`}
        >
          <div className="panel-head">
            <p className="panel-eyebrow">Section</p>
            <h4 className="panel-title">{activeSectionLabel}</h4>
          </div>

          {activeSection === "account" && (
            <div className="settings-stack">
              <div className="settings-card">
                <p className="settings-label">Signed In As</p>
                <div className="settings-account-row">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="" className="auth-avatar auth-avatar-lg" />
                  ) : (
                    <span className="auth-avatar auth-avatar-fallback auth-avatar-lg" aria-hidden="true">
                      {(user?.displayName || user?.email || "U").charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="auth-user-meta">
                    <p className="auth-user-name">{user?.displayName || "Google User"}</p>
                    <p className="auth-user-email">{user?.email || ""}</p>
                  </div>
                </div>
              </div>

              <div className="settings-card">
                <p className="settings-label">Appearance</p>
                <div className="settings-row">
                  <span>{isDarkMode ? "Dark mode is enabled" : "Dark mode is disabled"}</span>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={onToggleDarkMode}>
                    Toggle Dark Mode
                  </button>
                </div>
              </div>

              <div className="settings-card">
                <p className="settings-label">Session</p>
                <button
                  type="button"
                  className="btn btn-sm btn-danger settings-inline-btn"
                  onClick={() => {
                    void onSignOut();
                  }}
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}

          {activeSection === "crossfade" && (
            <div className="settings-stack">
              <div className="settings-card">
                <label className="settings-row settings-toggle-row">
                  <span>Enable crossfade between tracks</span>
                  <input
                    type="checkbox"
                    checked={settings.crossfadeEnabled}
                    onChange={(event) =>
                      updateSettings({ crossfadeEnabled: event.target.checked })
                    }
                  />
                </label>
              </div>
              <div className="settings-card">
                <label className="settings-slider-label" htmlFor="crossfade-seconds">
                  Crossfade Duration: {settings.crossfadeSeconds}s
                </label>
                <input
                  id="crossfade-seconds"
                  className="seek-slider"
                  type="range"
                  min="1"
                  max="12"
                  step="1"
                  value={settings.crossfadeSeconds}
                  disabled={!settings.crossfadeEnabled}
                  onChange={(event) =>
                    updateSettings({ crossfadeSeconds: Number(event.target.value) || 4 })
                  }
                />
                <p className="helper-text">
                  Setting is saved and ready for the playback crossfade engine.
                </p>
              </div>
            </div>
          )}

          {activeSection === "equalizer" && (
            <div className="settings-stack">
              <div className="settings-card">
                <label className="settings-label" htmlFor="equalizer-preset">
                  Preset
                </label>
                <select
                  id="equalizer-preset"
                  className="select"
                  value={settings.equalizerPreset}
                  onChange={(event) => applyEqualizerPreset(event.target.value)}
                >
                  <option value="flat">Flat</option>
                  <option value="bassBoost">Bass Boost</option>
                  <option value="vocalBoost">Vocal Boost</option>
                  <option value="trebleBoost">Treble Boost</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="settings-card settings-bands">
                <label className="settings-slider-label" htmlFor="eq-bass">
                  Bass: {settings.equalizer.bass} dB
                </label>
                <input
                  id="eq-bass"
                  className="seek-slider"
                  type="range"
                  min="-12"
                  max="12"
                  step="1"
                  value={settings.equalizer.bass}
                  onChange={(event) => setEqualizerBand("bass", event.target.value)}
                />

                <label className="settings-slider-label" htmlFor="eq-mid">
                  Mid: {settings.equalizer.mid} dB
                </label>
                <input
                  id="eq-mid"
                  className="seek-slider"
                  type="range"
                  min="-12"
                  max="12"
                  step="1"
                  value={settings.equalizer.mid}
                  onChange={(event) => setEqualizerBand("mid", event.target.value)}
                />

                <label className="settings-slider-label" htmlFor="eq-treble">
                  Treble: {settings.equalizer.treble} dB
                </label>
                <input
                  id="eq-treble"
                  className="seek-slider"
                  type="range"
                  min="-12"
                  max="12"
                  step="1"
                  value={settings.equalizer.treble}
                  onChange={(event) => setEqualizerBand("treble", event.target.value)}
                />
              </div>
            </div>
          )}

          {activeSection === "hotkeys" && (
            <div className="settings-stack">
              <div className="settings-card">
                <label className="settings-row settings-toggle-row">
                  <span>Enable keyboard shortcuts</span>
                  <input
                    type="checkbox"
                    checked={settings.hotkeysEnabled}
                    onChange={(event) =>
                      updateSettings({ hotkeysEnabled: event.target.checked })
                    }
                  />
                </label>
                <label className="settings-row settings-toggle-row">
                  <span>Spacebar toggles play/pause</span>
                  <input
                    type="checkbox"
                    checked={settings.spacebarPlayPauseEnabled}
                    disabled={!settings.hotkeysEnabled}
                    onChange={(event) =>
                      updateSettings({
                        spacebarPlayPauseEnabled: event.target.checked,
                      })
                    }
                  />
                </label>
                <label className="settings-row settings-toggle-row">
                  <span>Arrow keys seek (coming soon)</span>
                  <input
                    type="checkbox"
                    checked={settings.arrowSeekEnabled}
                    disabled={!settings.hotkeysEnabled}
                    onChange={(event) =>
                      updateSettings({
                        arrowSeekEnabled: event.target.checked,
                      })
                    }
                  />
                </label>
              </div>
              <div className="settings-card">
                <p className="settings-label">Current Hotkeys</p>
                <ul className="settings-hotkey-list">
                  <li>
                    <kbd>Space</kbd>
                    <span>Play / Pause</span>
                  </li>
                  <li>
                    <kbd>N</kbd>
                    <span>Next Track</span>
                  </li>
                  <li>
                    <kbd>P</kbd>
                    <span>Previous Track</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default SettingsPanel;
