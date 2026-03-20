import { useMemo, useRef, useState } from "react";
import { useSettings } from "../context/useSettings";
import { normalizePlayerSettings } from "../lib/settingsSchema";

const SETTINGS_SECTIONS = [
  { key: "account", label: "Account" },
  { key: "playback", label: "Playback" },
  { key: "crossfade", label: "Crossfade" },
  { key: "equalizer", label: "Equalizer" },
  { key: "hotkeys", label: "Hotkeys" },
  { key: "library", label: "Library" },
  { key: "data", label: "Data" },
];

const EQUALIZER_PRESETS = {
  flat: { bass: 0, mid: 0, treble: 0 },
  bassBoost: { bass: 6, mid: 1, treble: -2 },
  vocalBoost: { bass: -1, mid: 5, treble: 1 },
  trebleBoost: { bass: -2, mid: 0, treble: 6 },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const SettingsPanel = ({ user, onBackToLibrary, onSignOut }) => {
  const {
    settings,
    isSavingSettings,
    settingsError,
    updateSettings,
    replaceSettings,
    resetSettingsToDefaults,
    clearSettingsError,
  } = useSettings();
  const [activeSection, setActiveSection] = useState("account");
  const [dataStatus, setDataStatus] = useState("");
  const importInputRef = useRef(null);

  const isDarkMode = settings.ui.theme === "dark";

  const activeSectionLabel = useMemo(
    () => SETTINGS_SECTIONS.find((section) => section.key === activeSection)?.label || "",
    [activeSection]
  );

  const applyEqualizerPreset = (presetKey) => {
    const presetValues = EQUALIZER_PRESETS[presetKey] || EQUALIZER_PRESETS.flat;
    updateSettings((previousSettings) => ({
      ...previousSettings,
      equalizer: {
        ...previousSettings.equalizer,
        preset: presetKey,
        bass: presetValues.bass,
        mid: presetValues.mid,
        treble: presetValues.treble,
      },
    }));
  };

  const setEqualizerBand = (band, value) => {
    updateSettings((previousSettings) => ({
      ...previousSettings,
      equalizer: {
        ...previousSettings.equalizer,
        preset: "custom",
        [band]: clamp(Number(value) || 0, -12, 12),
      },
    }));
  };

  const exportSettings = () => {
    let playlistThumbnails = null;
    if (settings.data.includeThumbnailsInExport) {
      try {
        playlistThumbnails = JSON.parse(localStorage.getItem("playlistThumbnails") || "null");
      } catch {
        playlistThumbnails = null;
      }
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      version: 1,
      settings,
      playlistThumbnails,
    };

    const fileBlob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const objectUrl = URL.createObjectURL(fileBlob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = "music-player-settings.json";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
    setDataStatus("Exported settings JSON.");
  };

  const handleSettingsImport = async (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    try {
      const fileText = await selectedFile.text();
      const parsedFile = JSON.parse(fileText);
      const importedSettings = normalizePlayerSettings(parsedFile?.settings || parsedFile, {
        fallbackTheme: settings.ui.theme,
      });
      replaceSettings(importedSettings);
      setDataStatus("Imported settings successfully.");
      clearSettingsError();
    } catch {
      setDataStatus("Could not import file. Use a valid settings JSON export.");
    } finally {
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  };

  const clearThumbnailCache = () => {
    localStorage.removeItem("playlistThumbnails");
    setDataStatus("Cleared playlist thumbnail cache.");
  };

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

          {(isSavingSettings || settingsError) && (
            <div className="settings-stack">
              {isSavingSettings && <p className="helper-text">Saving settings...</p>}
              {settingsError && <p className="helper-text">{settingsError}</p>}
            </div>
          )}

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
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => {
                      updateSettings((previousSettings) => ({
                        ...previousSettings,
                        ui: {
                          ...previousSettings.ui,
                          theme: previousSettings.ui.theme === "dark" ? "light" : "dark",
                        },
                      }));
                      clearSettingsError();
                    }}
                  >
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

          {activeSection === "playback" && (
            <div className="settings-stack">
              <div className="settings-card">
                <label className="settings-row settings-toggle-row">
                  <span>Gapless playback</span>
                  <input
                    type="checkbox"
                    checked={settings.playback.gaplessPlaybackEnabled}
                    onChange={(event) =>
                      updateSettings((previousSettings) => ({
                        ...previousSettings,
                        playback: {
                          ...previousSettings.playback,
                          gaplessPlaybackEnabled: event.target.checked,
                        },
                      }))
                    }
                  />
                </label>
                <p className="helper-text">
                  Gapless removes transition gaps between tracks. If crossfade is enabled, crossfade takes priority.
                </p>
                <label className="settings-row settings-toggle-row">
                  <span>Volume normalization (coming soon)</span>
                  <input
                    type="checkbox"
                    checked={settings.playback.normalizeVolumeEnabled}
                    onChange={(event) =>
                      updateSettings((previousSettings) => ({
                        ...previousSettings,
                        playback: {
                          ...previousSettings.playback,
                          normalizeVolumeEnabled: event.target.checked,
                        },
                      }))
                    }
                  />
                </label>
              </div>
              <div className="settings-card">
                <label className="settings-label" htmlFor="autoplay-behavior">
                  Autoplay behavior
                </label>
                <select
                  id="autoplay-behavior"
                  className="select"
                  value={settings.playback.autoplayBehavior}
                  onChange={(event) =>
                    updateSettings((previousSettings) => ({
                      ...previousSettings,
                      playback: {
                        ...previousSettings.playback,
                        autoplayBehavior: event.target.value,
                      },
                    }))
                  }
                >
                  <option value="resume-last-session">Resume last session</option>
                  <option value="stay-paused">Stay paused on load</option>
                  <option value="play-immediately">Autoplay immediately</option>
                </select>
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
                    checked={settings.crossfade.enabled}
                    onChange={(event) =>
                      updateSettings((previousSettings) => ({
                        ...previousSettings,
                        crossfade: {
                          ...previousSettings.crossfade,
                          enabled: event.target.checked,
                        },
                      }))
                    }
                  />
                </label>
              </div>
              <div className="settings-card">
                <label className="settings-slider-label" htmlFor="crossfade-seconds">
                  Crossfade Duration: {settings.crossfade.seconds}s
                </label>
                <input
                  id="crossfade-seconds"
                  className="seek-slider"
                  type="range"
                  min="1"
                  max="12"
                  step="1"
                  value={settings.crossfade.seconds}
                  disabled={!settings.crossfade.enabled}
                  onChange={(event) =>
                    updateSettings((previousSettings) => ({
                      ...previousSettings,
                      crossfade: {
                        ...previousSettings.crossfade,
                        seconds: Number(event.target.value) || 4,
                      },
                    }))
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
                  value={settings.equalizer.preset}
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
                    checked={settings.hotkeys.enabled}
                    onChange={(event) =>
                      updateSettings((previousSettings) => ({
                        ...previousSettings,
                        hotkeys: {
                          ...previousSettings.hotkeys,
                          enabled: event.target.checked,
                        },
                      }))
                    }
                  />
                </label>
                <label className="settings-row settings-toggle-row">
                  <span>Spacebar toggles play/pause</span>
                  <input
                    type="checkbox"
                    checked={settings.hotkeys.spacebarPlayPauseEnabled}
                    disabled={!settings.hotkeys.enabled}
                    onChange={(event) =>
                      updateSettings((previousSettings) => ({
                        ...previousSettings,
                        hotkeys: {
                          ...previousSettings.hotkeys,
                          spacebarPlayPauseEnabled: event.target.checked,
                        },
                      }))
                    }
                  />
                </label>
                <label className="settings-row settings-toggle-row">
                  <span>Arrow keys seek (coming soon)</span>
                  <input
                    type="checkbox"
                    checked={settings.hotkeys.arrowSeekEnabled}
                    disabled={!settings.hotkeys.enabled}
                    onChange={(event) =>
                      updateSettings((previousSettings) => ({
                        ...previousSettings,
                        hotkeys: {
                          ...previousSettings.hotkeys,
                          arrowSeekEnabled: event.target.checked,
                        },
                      }))
                    }
                  />
                </label>
                <label className="settings-row settings-toggle-row">
                  <span>N/P keys for next/previous track</span>
                  <input
                    type="checkbox"
                    checked={settings.hotkeys.nextPreviousKeysEnabled}
                    disabled={!settings.hotkeys.enabled}
                    onChange={(event) =>
                      updateSettings((previousSettings) => ({
                        ...previousSettings,
                        hotkeys: {
                          ...previousSettings.hotkeys,
                          nextPreviousKeysEnabled: event.target.checked,
                        },
                      }))
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

          {activeSection === "library" && (
            <div className="settings-stack">
              <div className="settings-card">
                <label className="settings-row settings-toggle-row">
                  <span>Auto-rescan connected folders on launch</span>
                  <input
                    type="checkbox"
                    checked={settings.library.autoRescanOnLaunch}
                    onChange={(event) =>
                      updateSettings((previousSettings) => ({
                        ...previousSettings,
                        library: {
                          ...previousSettings.library,
                          autoRescanOnLaunch: event.target.checked,
                        },
                      }))
                    }
                  />
                </label>
              </div>
              <div className="settings-card">
                <label className="settings-label" htmlFor="duplicate-handling">
                  Duplicate handling
                </label>
                <select
                  id="duplicate-handling"
                  className="select"
                  value={settings.library.duplicateHandling}
                  onChange={(event) =>
                    updateSettings((previousSettings) => ({
                      ...previousSettings,
                      library: {
                        ...previousSettings.library,
                        duplicateHandling: event.target.value,
                      },
                    }))
                  }
                >
                  <option value="skip-duplicates">Skip duplicates</option>
                  <option value="keep-both">Keep both</option>
                  <option value="replace-existing">Replace existing entry</option>
                </select>

                <label className="settings-label" htmlFor="folder-sort-mode">
                  Folder priority/sort mode
                </label>
                <select
                  id="folder-sort-mode"
                  className="select"
                  value={settings.library.folderSortMode}
                  onChange={(event) =>
                    updateSettings((previousSettings) => ({
                      ...previousSettings,
                      library: {
                        ...previousSettings.library,
                        folderSortMode: event.target.value,
                      },
                    }))
                  }
                >
                  <option value="recent-first">Most recent folder first</option>
                  <option value="alphabetical">Alphabetical</option>
                  <option value="manual-order">Manual order (coming soon)</option>
                </select>
              </div>
            </div>
          )}

          {activeSection === "data" && (
            <div className="settings-stack">
              <div className="settings-card">
                <label className="settings-row settings-toggle-row">
                  <span>Include playlist thumbnails in export</span>
                  <input
                    type="checkbox"
                    checked={settings.data.includeThumbnailsInExport}
                    onChange={(event) =>
                      updateSettings((previousSettings) => ({
                        ...previousSettings,
                        data: {
                          ...previousSettings.data,
                          includeThumbnailsInExport: event.target.checked,
                        },
                      }))
                    }
                  />
                </label>
              </div>
              <div className="settings-card settings-actions">
                <p className="settings-label">Transfer & Backup</p>
                <div className="settings-action-row">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={exportSettings}>
                    Export settings JSON
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => importInputRef.current?.click()}
                  >
                    Import settings JSON
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept="application/json"
                    className="visually-hidden"
                    onChange={handleSettingsImport}
                  />
                </div>
              </div>
              <div className="settings-card settings-actions">
                <p className="settings-label">Maintenance</p>
                <div className="settings-action-row">
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      resetSettingsToDefaults();
                      setDataStatus("Reset settings to defaults.");
                    }}
                  >
                    Reset all settings
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={clearThumbnailCache}
                  >
                    Clear thumbnail cache
                  </button>
                </div>
              </div>
              {dataStatus && <p className="helper-text">{dataStatus}</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default SettingsPanel;
