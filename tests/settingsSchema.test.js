import { describe, expect, it } from "vitest";
import {
  LEGACY_PLAYER_SETTINGS_SCHEMA_VERSION,
  PLAYER_SETTINGS_SCHEMA_VERSION,
  detectPlayerSettingsSchemaVersion,
  mergePlayerSettings,
  migratePlayerSettings,
  normalizePlayerSettings,
  toLegacyFlatSettings,
  validatePlayerSettings,
} from "../src/lib/settingsSchema.js";

describe("settingsSchema", () => {
  it("normalizes legacy flat settings into v1 shape with clamped values", () => {
    const normalized = normalizePlayerSettings({
      uiTheme: "dark",
      crossfadeEnabled: true,
      crossfadeSeconds: 22,
      equalizerPreset: "bassBoost",
      equalizer: {
        bass: 20,
        mid: -20,
        treble: 3,
      },
      hotkeysEnabled: false,
      spacebarPlayPauseEnabled: false,
      autoplayBehavior: "play-immediately",
      duplicateHandling: "replace-existing",
      folderSortMode: "alphabetical",
    });

    expect(normalized.schemaVersion).toBe(PLAYER_SETTINGS_SCHEMA_VERSION);
    expect(normalized.ui.theme).toBe("dark");
    expect(normalized.crossfade.enabled).toBe(true);
    expect(normalized.crossfade.seconds).toBe(12);
    expect(normalized.equalizer.preset).toBe("bassBoost");
    expect(normalized.equalizer.bass).toBe(12);
    expect(normalized.equalizer.mid).toBe(-12);
    expect(normalized.equalizer.treble).toBe(3);
    expect(normalized.hotkeys.enabled).toBe(false);
    expect(normalized.hotkeys.spacebarPlayPauseEnabled).toBe(false);
    expect(normalized.playback.autoplayBehavior).toBe("play-immediately");
    expect(normalized.library.duplicateHandling).toBe("replace-existing");
    expect(normalized.library.folderSortMode).toBe("alphabetical");
  });

  it("detects schema version and reports migrations", () => {
    const legacyVersion = detectPlayerSettingsSchemaVersion({ uiTheme: "dark" });
    const currentVersion = detectPlayerSettingsSchemaVersion({
      schemaVersion: PLAYER_SETTINGS_SCHEMA_VERSION,
    });

    expect(legacyVersion).toBe(LEGACY_PLAYER_SETTINGS_SCHEMA_VERSION);
    expect(currentVersion).toBe(PLAYER_SETTINGS_SCHEMA_VERSION);

    const legacyMigration = migratePlayerSettings({ uiTheme: "dark" });
    expect(legacyMigration.didMigrate).toBe(true);
    expect(legacyMigration.sourceVersion).toBe(LEGACY_PLAYER_SETTINGS_SCHEMA_VERSION);
    expect(legacyMigration.targetVersion).toBe(PLAYER_SETTINGS_SCHEMA_VERSION);
    expect(legacyMigration.isFutureSchema).toBe(false);
    expect(legacyMigration.settings.ui.theme).toBe("dark");

    const futureMigration = migratePlayerSettings({
      schemaVersion: PLAYER_SETTINGS_SCHEMA_VERSION + 3,
      ui: { theme: "dark" },
    });
    expect(futureMigration.isFutureSchema).toBe(true);
    expect(futureMigration.didMigrate).toBe(true);
  });

  it("merges local/remote settings by updatedAtMs recency", () => {
    const local = normalizePlayerSettings({
      updatedAtMs: 100,
      ui: { theme: "light" },
    });
    const remote = normalizePlayerSettings({
      updatedAtMs: 200,
      ui: { theme: "dark" },
    });

    const merged = mergePlayerSettings(local, remote);
    expect(merged.ui.theme).toBe("dark");
    expect(merged.updatedAtMs).toBe(200);
  });

  it("maps v1 settings back to legacy flat shape", () => {
    const legacy = toLegacyFlatSettings(
      normalizePlayerSettings({
        ui: { theme: "dark" },
        crossfade: { enabled: true, seconds: 6 },
        playback: { autoplayBehavior: "stay-paused" },
      })
    );

    expect(legacy.uiTheme).toBe("dark");
    expect(legacy.crossfadeEnabled).toBe(true);
    expect(legacy.crossfadeSeconds).toBe(6);
    expect(legacy.autoplayBehavior).toBe("stay-paused");
  });

  it("returns valid result for normalized settings", () => {
    const validation = validatePlayerSettings({
      uiTheme: "dark",
      crossfadeSeconds: 42,
      equalizer: { bass: 99 },
    });
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(validation.normalizedSettings.crossfade.seconds).toBe(12);
    expect(validation.normalizedSettings.equalizer.bass).toBe(12);
  });
});
