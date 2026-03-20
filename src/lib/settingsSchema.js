export const PLAYER_SETTINGS_SCHEMA_VERSION = 1;
export const LEGACY_PLAYER_SETTINGS_SCHEMA_VERSION = 0;

const THEME_OPTIONS = new Set(["light", "dark"]);
const AUTOPLAY_BEHAVIOR_OPTIONS = new Set([
  "resume-last-session",
  "stay-paused",
  "play-immediately",
]);
const EQUALIZER_PRESET_OPTIONS = new Set([
  "flat",
  "bassBoost",
  "vocalBoost",
  "trebleBoost",
  "custom",
]);
const DUPLICATE_HANDLING_OPTIONS = new Set([
  "skip-duplicates",
  "keep-both",
  "replace-existing",
]);
const FOLDER_SORT_OPTIONS = new Set([
  "recent-first",
  "alphabetical",
  "manual-order",
]);

export const DEFAULT_PLAYER_SETTINGS = {
  schemaVersion: PLAYER_SETTINGS_SCHEMA_VERSION,
  updatedAtMs: 0,
  ui: {
    theme: "light",
  },
  account: {
    displayName: "",
    email: "",
    photoURL: "",
  },
  playback: {
    gaplessPlaybackEnabled: false,
    normalizeVolumeEnabled: false,
    autoplayBehavior: "resume-last-session",
  },
  crossfade: {
    enabled: false,
    seconds: 4,
  },
  equalizer: {
    preset: "flat",
    bass: 0,
    mid: 0,
    treble: 0,
  },
  hotkeys: {
    enabled: true,
    spacebarPlayPauseEnabled: true,
    arrowSeekEnabled: false,
    nextPreviousKeysEnabled: true,
  },
  library: {
    autoRescanOnLaunch: false,
    duplicateHandling: "skip-duplicates",
    folderSortMode: "recent-first",
  },
  data: {
    includeThumbnailsInExport: true,
    backupReminderDismissed: false,
  },
};

const isObject = (value) =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const asBoolean = (value, fallback) =>
  typeof value === "boolean" ? value : fallback;

const asString = (value, fallback = "") =>
  typeof value === "string" ? value : fallback;

const asFiniteNumber = (value, fallback) =>
  Number.isFinite(value) ? value : fallback;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const asOption = (value, allowedOptions, fallback) =>
  typeof value === "string" && allowedOptions.has(value) ? value : fallback;

const getUpdatedAtMs = (source) => {
  if (!isObject(source)) {
    return 0;
  }

  if (typeof source.updatedAtMs === "number" && Number.isFinite(source.updatedAtMs)) {
    return Math.max(0, Math.floor(source.updatedAtMs));
  }

  if (source.updatedAt && typeof source.updatedAt.toMillis === "function") {
    const millis = source.updatedAt.toMillis();
    if (Number.isFinite(millis)) {
      return Math.max(0, Math.floor(millis));
    }
  }

  return 0;
};

const getLegacyMappedValues = (source) => {
  if (!isObject(source)) {
    return {};
  }

  return {
    theme: source.uiTheme,
    crossfadeEnabled: source.crossfadeEnabled,
    crossfadeSeconds: source.crossfadeSeconds,
    equalizerPreset: source.equalizerPreset,
    equalizer: source.equalizer,
    hotkeysEnabled: source.hotkeysEnabled,
    spacebarPlayPauseEnabled: source.spacebarPlayPauseEnabled,
    arrowSeekEnabled: source.arrowSeekEnabled,
    gaplessPlaybackEnabled: source.gaplessPlaybackEnabled,
    normalizeVolumeEnabled: source.normalizeVolumeEnabled,
    autoplayBehavior: source.autoplayBehavior,
    autoRescanOnLaunch: source.autoRescanOnLaunch,
    duplicateHandling: source.duplicateHandling,
    folderSortMode: source.folderSortMode,
  };
};

export const detectPlayerSettingsSchemaVersion = (input) => {
  if (
    input &&
    typeof input === "object" &&
    typeof input.schemaVersion === "number" &&
    Number.isInteger(input.schemaVersion)
  ) {
    return input.schemaVersion;
  }
  return LEGACY_PLAYER_SETTINGS_SCHEMA_VERSION;
};

export const normalizePlayerSettings = (input, options = {}) => {
  const source = isObject(input) ? input : {};
  const legacy = getLegacyMappedValues(source);
  const ui = isObject(source.ui) ? source.ui : {};
  const account = isObject(source.account) ? source.account : {};
  const playback = isObject(source.playback) ? source.playback : {};
  const crossfade = isObject(source.crossfade) ? source.crossfade : {};
  const equalizer = isObject(source.equalizer) ? source.equalizer : {};
  const hotkeys = isObject(source.hotkeys) ? source.hotkeys : {};
  const library = isObject(source.library) ? source.library : {};
  const data = isObject(source.data) ? source.data : {};

  const fallbackTheme = options.fallbackTheme === "dark" ? "dark" : "light";

  return {
    schemaVersion: PLAYER_SETTINGS_SCHEMA_VERSION,
    updatedAtMs: getUpdatedAtMs(source),
    ui: {
      theme: asOption(
        asString(ui.theme, asString(legacy.theme, fallbackTheme)),
        THEME_OPTIONS,
        fallbackTheme
      ),
    },
    account: {
      displayName: asString(account.displayName),
      email: asString(account.email),
      photoURL: asString(account.photoURL),
    },
    playback: {
      gaplessPlaybackEnabled: asBoolean(
        playback.gaplessPlaybackEnabled,
        asBoolean(legacy.gaplessPlaybackEnabled, false)
      ),
      normalizeVolumeEnabled: asBoolean(
        playback.normalizeVolumeEnabled,
        asBoolean(legacy.normalizeVolumeEnabled, false)
      ),
      autoplayBehavior: asOption(
        asString(playback.autoplayBehavior, asString(legacy.autoplayBehavior, "")),
        AUTOPLAY_BEHAVIOR_OPTIONS,
        DEFAULT_PLAYER_SETTINGS.playback.autoplayBehavior
      ),
    },
    crossfade: {
      enabled: asBoolean(
        crossfade.enabled,
        asBoolean(legacy.crossfadeEnabled, DEFAULT_PLAYER_SETTINGS.crossfade.enabled)
      ),
      seconds: clamp(
        Math.round(
          asFiniteNumber(
            crossfade.seconds,
            asFiniteNumber(legacy.crossfadeSeconds, DEFAULT_PLAYER_SETTINGS.crossfade.seconds)
          )
        ),
        1,
        12
      ),
    },
    equalizer: {
      preset: asOption(
        asString(equalizer.preset, asString(legacy.equalizerPreset, "")),
        EQUALIZER_PRESET_OPTIONS,
        DEFAULT_PLAYER_SETTINGS.equalizer.preset
      ),
      bass: clamp(
        Math.round(
          asFiniteNumber(
            equalizer.bass,
            asFiniteNumber(legacy.equalizer?.bass, DEFAULT_PLAYER_SETTINGS.equalizer.bass)
          )
        ),
        -12,
        12
      ),
      mid: clamp(
        Math.round(
          asFiniteNumber(
            equalizer.mid,
            asFiniteNumber(legacy.equalizer?.mid, DEFAULT_PLAYER_SETTINGS.equalizer.mid)
          )
        ),
        -12,
        12
      ),
      treble: clamp(
        Math.round(
          asFiniteNumber(
            equalizer.treble,
            asFiniteNumber(legacy.equalizer?.treble, DEFAULT_PLAYER_SETTINGS.equalizer.treble)
          )
        ),
        -12,
        12
      ),
    },
    hotkeys: {
      enabled: asBoolean(
        hotkeys.enabled,
        asBoolean(legacy.hotkeysEnabled, DEFAULT_PLAYER_SETTINGS.hotkeys.enabled)
      ),
      spacebarPlayPauseEnabled: asBoolean(
        hotkeys.spacebarPlayPauseEnabled,
        asBoolean(
          legacy.spacebarPlayPauseEnabled,
          DEFAULT_PLAYER_SETTINGS.hotkeys.spacebarPlayPauseEnabled
        )
      ),
      arrowSeekEnabled: asBoolean(
        hotkeys.arrowSeekEnabled,
        asBoolean(legacy.arrowSeekEnabled, DEFAULT_PLAYER_SETTINGS.hotkeys.arrowSeekEnabled)
      ),
      nextPreviousKeysEnabled: asBoolean(
        hotkeys.nextPreviousKeysEnabled,
        DEFAULT_PLAYER_SETTINGS.hotkeys.nextPreviousKeysEnabled
      ),
    },
    library: {
      autoRescanOnLaunch: asBoolean(
        library.autoRescanOnLaunch,
        asBoolean(
          legacy.autoRescanOnLaunch,
          DEFAULT_PLAYER_SETTINGS.library.autoRescanOnLaunch
        )
      ),
      duplicateHandling: asOption(
        asString(library.duplicateHandling, asString(legacy.duplicateHandling, "")),
        DUPLICATE_HANDLING_OPTIONS,
        DEFAULT_PLAYER_SETTINGS.library.duplicateHandling
      ),
      folderSortMode: asOption(
        asString(library.folderSortMode, asString(legacy.folderSortMode, "")),
        FOLDER_SORT_OPTIONS,
        DEFAULT_PLAYER_SETTINGS.library.folderSortMode
      ),
    },
    data: {
      includeThumbnailsInExport: asBoolean(
        data.includeThumbnailsInExport,
        DEFAULT_PLAYER_SETTINGS.data.includeThumbnailsInExport
      ),
      backupReminderDismissed: asBoolean(
        data.backupReminderDismissed,
        DEFAULT_PLAYER_SETTINGS.data.backupReminderDismissed
      ),
    },
  };
};

export const validatePlayerSettings = (input) => {
  const settings = normalizePlayerSettings(input);
  const errors = [];

  if (settings.schemaVersion !== PLAYER_SETTINGS_SCHEMA_VERSION) {
    errors.push("Unsupported player settings schema version.");
  }

  if (!THEME_OPTIONS.has(settings.ui.theme)) {
    errors.push("UI theme is invalid.");
  }

  if (!AUTOPLAY_BEHAVIOR_OPTIONS.has(settings.playback.autoplayBehavior)) {
    errors.push("Playback autoplay behavior is invalid.");
  }

  if (settings.crossfade.seconds < 1 || settings.crossfade.seconds > 12) {
    errors.push("Crossfade seconds must be between 1 and 12.");
  }

  if (!EQUALIZER_PRESET_OPTIONS.has(settings.equalizer.preset)) {
    errors.push("Equalizer preset is invalid.");
  }

  if (settings.equalizer.bass < -12 || settings.equalizer.bass > 12) {
    errors.push("Equalizer bass must be between -12 and 12 dB.");
  }

  if (settings.equalizer.mid < -12 || settings.equalizer.mid > 12) {
    errors.push("Equalizer mid must be between -12 and 12 dB.");
  }

  if (settings.equalizer.treble < -12 || settings.equalizer.treble > 12) {
    errors.push("Equalizer treble must be between -12 and 12 dB.");
  }

  if (!DUPLICATE_HANDLING_OPTIONS.has(settings.library.duplicateHandling)) {
    errors.push("Library duplicate handling option is invalid.");
  }

  if (!FOLDER_SORT_OPTIONS.has(settings.library.folderSortMode)) {
    errors.push("Library folder sort mode is invalid.");
  }

  return {
    isValid: errors.length === 0,
    errors,
    normalizedSettings: settings,
  };
};

export const mergePlayerSettings = (localSettings, remoteSettings, options = {}) => {
  const normalizedLocal = localSettings
    ? normalizePlayerSettings(localSettings, options)
    : null;
  const normalizedRemote = remoteSettings
    ? normalizePlayerSettings(remoteSettings, options)
    : null;

  if (!normalizedLocal && !normalizedRemote) {
    return normalizePlayerSettings(DEFAULT_PLAYER_SETTINGS, options);
  }

  if (!normalizedLocal) {
    return normalizedRemote;
  }

  if (!normalizedRemote) {
    return normalizedLocal;
  }

  return normalizedRemote.updatedAtMs >= normalizedLocal.updatedAtMs
    ? normalizedRemote
    : normalizedLocal;
};

export const migratePlayerSettings = (input, options = {}) => {
  const sourceVersion = detectPlayerSettingsSchemaVersion(input);
  const normalizedSettings = normalizePlayerSettings(input, options);
  const isFutureSchema = sourceVersion > PLAYER_SETTINGS_SCHEMA_VERSION;

  return {
    settings: normalizedSettings,
    sourceVersion,
    targetVersion: PLAYER_SETTINGS_SCHEMA_VERSION,
    didMigrate: sourceVersion !== PLAYER_SETTINGS_SCHEMA_VERSION,
    isFutureSchema,
  };
};

export const toLegacyFlatSettings = (input, options = {}) => {
  const settings = normalizePlayerSettings(input, options);
  return {
    crossfadeEnabled: settings.crossfade.enabled,
    crossfadeSeconds: settings.crossfade.seconds,
    equalizerPreset: settings.equalizer.preset,
    equalizer: {
      bass: settings.equalizer.bass,
      mid: settings.equalizer.mid,
      treble: settings.equalizer.treble,
    },
    hotkeysEnabled: settings.hotkeys.enabled,
    spacebarPlayPauseEnabled: settings.hotkeys.spacebarPlayPauseEnabled,
    arrowSeekEnabled: settings.hotkeys.arrowSeekEnabled,
    gaplessPlaybackEnabled: settings.playback.gaplessPlaybackEnabled,
    normalizeVolumeEnabled: settings.playback.normalizeVolumeEnabled,
    autoplayBehavior: settings.playback.autoplayBehavior,
    autoRescanOnLaunch: settings.library.autoRescanOnLaunch,
    duplicateHandling: settings.library.duplicateHandling,
    folderSortMode: settings.library.folderSortMode,
    uiTheme: settings.ui.theme,
  };
};
