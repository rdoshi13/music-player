import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { firestoreDb, isFirebaseConfigured } from "./firebaseAuth";
import {
  DEFAULT_PLAYER_SETTINGS,
  LEGACY_PLAYER_SETTINGS_SCHEMA_VERSION,
  PLAYER_SETTINGS_SCHEMA_VERSION,
  mergePlayerSettings,
  migratePlayerSettings,
  normalizePlayerSettings,
  toLegacyFlatSettings,
  validatePlayerSettings,
} from "./settingsSchema";

export const PLAYER_SETTINGS_COLLECTION = "user_settings";
export const PLAYER_SETTINGS_LOCAL_STORAGE_KEY = "playerSettings";
export const PLAYER_SETTINGS_CACHE_KEY_PREFIX = "playerSettingsCache";

const isBrowserEnvironment = typeof window !== "undefined";

const ensureUserId = (uid) => {
  if (typeof uid !== "string" || !uid.trim()) {
    throw new Error("A valid user uid is required for settings operations.");
  }
  return uid.trim();
};

const getCacheKey = (uid) => `${PLAYER_SETTINGS_CACHE_KEY_PREFIX}:${uid}`;

const getSettingsDocRef = (uid) =>
  doc(firestoreDb, PLAYER_SETTINGS_COLLECTION, ensureUserId(uid));

const toFirestoreSettingsPayload = (input) => {
  const { normalizedSettings } = validatePlayerSettings(input);
  const timestampMs = Date.now();

  return {
    schemaVersion: PLAYER_SETTINGS_SCHEMA_VERSION,
    updatedAtMs: timestampMs,
    updatedAt: serverTimestamp(),
    ui: normalizedSettings.ui,
    account: normalizedSettings.account,
    playback: normalizedSettings.playback,
    crossfade: normalizedSettings.crossfade,
    equalizer: normalizedSettings.equalizer,
    hotkeys: normalizedSettings.hotkeys,
    library: normalizedSettings.library,
    data: normalizedSettings.data,
  };
};

const fromFirestoreSettingsPayloadWithMigration = (payload, options = {}) => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const migrationResult = migratePlayerSettings(
    {
      ...payload,
      updatedAtMs:
        typeof payload.updatedAtMs === "number" && Number.isFinite(payload.updatedAtMs)
          ? payload.updatedAtMs
          : payload.updatedAt && typeof payload.updatedAt.toMillis === "function"
            ? payload.updatedAt.toMillis()
            : 0,
    },
    options
  );

  return migrationResult;
};

export const readCachedSettings = (uid, options = {}) => {
  if (!isBrowserEnvironment) {
    return normalizePlayerSettings(DEFAULT_PLAYER_SETTINGS, options);
  }

  const cacheValue = localStorage.getItem(getCacheKey(uid));
  if (!cacheValue) {
    return null;
  }

  try {
    return normalizePlayerSettings(JSON.parse(cacheValue), options);
  } catch {
    return null;
  }
};

const readLegacySettings = (options = {}) => {
  if (!isBrowserEnvironment) {
    return null;
  }

  const legacyValue = localStorage.getItem(PLAYER_SETTINGS_LOCAL_STORAGE_KEY);
  if (!legacyValue) {
    return null;
  }

  try {
    return normalizePlayerSettings(JSON.parse(legacyValue), options);
  } catch {
    return null;
  }
};

export const writeCachedSettings = (uid, input, options = {}) => {
  if (!isBrowserEnvironment) {
    return normalizePlayerSettings(input, options);
  }

  const normalizedSettings = normalizePlayerSettings(input, options);
  localStorage.setItem(getCacheKey(uid), JSON.stringify(normalizedSettings));
  localStorage.setItem(
    PLAYER_SETTINGS_LOCAL_STORAGE_KEY,
    JSON.stringify(toLegacyFlatSettings(normalizedSettings, options))
  );
  return normalizedSettings;
};

export const clearCachedSettings = (uid) => {
  if (!isBrowserEnvironment) {
    return;
  }
  localStorage.removeItem(getCacheKey(uid));
};

export const isSettingsBackendAvailable = () =>
  Boolean(isFirebaseConfigured && firestoreDb);

export const fetchRemoteSettings = async (uid, options = {}) => {
  if (!isSettingsBackendAvailable()) {
    return null;
  }

  const settingsDoc = await getDoc(getSettingsDocRef(uid));
  if (!settingsDoc.exists()) {
    return null;
  }

  const migrationResult = fromFirestoreSettingsPayloadWithMigration(
    settingsDoc.data(),
    options
  );
  if (!migrationResult) {
    return null;
  }

  return migrationResult.settings;
};

export const saveRemoteSettings = async (uid, input, options = {}) => {
  if (!isSettingsBackendAvailable()) {
    throw new Error("Settings backend is not available. Check Firebase configuration.");
  }

  const payload = toFirestoreSettingsPayload(input);
  const normalizedSettings = normalizePlayerSettings(
    { ...payload, updatedAtMs: payload.updatedAtMs },
    options
  );
  const validation = validatePlayerSettings(normalizedSettings);
  if (!validation.isValid) {
    throw new Error(`Invalid settings payload: ${validation.errors.join("; ")}`);
  }

  await setDoc(getSettingsDocRef(uid), payload, { merge: true });
  writeCachedSettings(uid, normalizedSettings, options);
  return normalizedSettings;
};

export const loadUserSettings = async (uid, options = {}) => {
  const normalizedUid = ensureUserId(uid);
  const cachedSettings = readCachedSettings(normalizedUid, options);
  const legacySettings = cachedSettings ? null : readLegacySettings(options);
  const localSettings = cachedSettings || legacySettings;
  const localSourceVersion = localSettings
    ? migratePlayerSettings(localSettings, options).sourceVersion
    : LEGACY_PLAYER_SETTINGS_SCHEMA_VERSION;

  let remoteMigrationResult = null;
  if (isSettingsBackendAvailable()) {
    const settingsDoc = await getDoc(getSettingsDocRef(normalizedUid));
    if (settingsDoc.exists()) {
      remoteMigrationResult = fromFirestoreSettingsPayloadWithMigration(
        settingsDoc.data(),
        options
      );
    }
  }

  const remoteSettings = remoteMigrationResult?.settings || null;
  const mergedSettings =
    remoteMigrationResult?.isFutureSchema && remoteSettings
      ? remoteSettings
      : mergePlayerSettings(localSettings, remoteSettings, options);

  writeCachedSettings(normalizedUid, mergedSettings, options);

  const shouldBackfillFromLocal =
    !remoteSettings &&
    localSettings &&
    isSettingsBackendAvailable();

  const shouldPersistRemoteMigration =
    Boolean(remoteMigrationResult?.didMigrate) &&
    !remoteMigrationResult?.isFutureSchema &&
    isSettingsBackendAvailable();

  const shouldPersistMergedUpgrade =
    Boolean(remoteSettings) &&
    remoteMigrationResult &&
    !remoteMigrationResult.isFutureSchema &&
    remoteMigrationResult.sourceVersion <= PLAYER_SETTINGS_SCHEMA_VERSION &&
    localSourceVersion <= PLAYER_SETTINGS_SCHEMA_VERSION &&
    mergedSettings.updatedAtMs > remoteSettings.updatedAtMs;

  if (shouldBackfillFromLocal || shouldPersistRemoteMigration || shouldPersistMergedUpgrade) {
    try {
      await saveRemoteSettings(normalizedUid, mergedSettings, options);
    } catch {
      // Keep local UX responsive even if backfill fails.
    }
  }

  return mergedSettings;
};

export const subscribeToUserSettings = (
  uid,
  onChange,
  onError = () => {},
  options = {}
) => {
  const normalizedUid = ensureUserId(uid);
  const cachedSettings = readCachedSettings(normalizedUid, options);
  if (cachedSettings) {
    onChange(cachedSettings);
  }

  if (!isSettingsBackendAvailable()) {
    return () => {};
  }

  return onSnapshot(
    getSettingsDocRef(normalizedUid),
    (snapshot) => {
      if (!snapshot.exists()) {
        return;
      }

      const migrationResult = fromFirestoreSettingsPayloadWithMigration(
        snapshot.data(),
        options
      );
      if (!migrationResult) {
        return;
      }

      const remoteSettings = migrationResult.settings;
      writeCachedSettings(normalizedUid, remoteSettings, options);
      onChange(remoteSettings);

      if (
        migrationResult.didMigrate &&
        !migrationResult.isFutureSchema &&
        isSettingsBackendAvailable()
      ) {
        void saveRemoteSettings(normalizedUid, remoteSettings, options).catch(() => {
          // Migration writeback failures should not break realtime updates.
        });
      }
    },
    onError
  );
};
