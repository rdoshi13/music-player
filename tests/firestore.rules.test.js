import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { Timestamp, doc, getDoc, setDoc } from "firebase/firestore";

const emulatorHostValue = process.env.FIRESTORE_EMULATOR_HOST || "";
const [emulatorHost, emulatorPortRaw] = emulatorHostValue.split(":");
const emulatorPort = Number(emulatorPortRaw || 8080);
const hasEmulatorHost = Boolean(emulatorHostValue);

const describeIfEmulator = hasEmulatorHost ? describe : describe.skip;

const buildValidSettingsDocument = (uid) => ({
  schemaVersion: 1,
  updatedAtMs: Date.now(),
  updatedAt: Timestamp.fromMillis(Date.now()),
  ui: { theme: "dark" },
  account: {
    displayName: `User ${uid}`,
    email: `${uid}@example.com`,
    photoURL: "",
  },
  playback: {
    gaplessPlaybackEnabled: false,
    normalizeVolumeEnabled: false,
    autoplayBehavior: "resume-last-session",
  },
  crossfade: {
    enabled: true,
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
});

describeIfEmulator("firestore.rules", () => {
  let testEnvironment;

  beforeAll(async () => {
    const rulesPath = path.resolve(process.cwd(), "firestore.rules");
    const firestoreRules = fs.readFileSync(rulesPath, "utf8");

    testEnvironment = await initializeTestEnvironment({
      projectId: "music-player-rules-tests",
      firestore: {
        rules: firestoreRules,
        host: emulatorHost || "127.0.0.1",
        port: Number.isFinite(emulatorPort) ? emulatorPort : 8080,
      },
    });
  });

  beforeEach(async () => {
    await testEnvironment.clearFirestore();
  });

  afterAll(async () => {
    await testEnvironment.cleanup();
  });

  it("allows users to read/write their own settings doc", async () => {
    const aliceDb = testEnvironment.authenticatedContext("alice").firestore();
    const aliceDoc = doc(aliceDb, "user_settings", "alice");

    await assertSucceeds(setDoc(aliceDoc, buildValidSettingsDocument("alice")));

    const snapshot = await assertSucceeds(getDoc(aliceDoc));
    expect(snapshot.exists()).toBe(true);
  });

  it("denies users from reading or writing another user's settings", async () => {
    const aliceDb = testEnvironment.authenticatedContext("alice").firestore();
    const bobDb = testEnvironment.authenticatedContext("bob").firestore();

    const aliceDoc = doc(aliceDb, "user_settings", "alice");
    const bobTryingAliceDoc = doc(bobDb, "user_settings", "alice");

    await assertSucceeds(setDoc(aliceDoc, buildValidSettingsDocument("alice")));
    await assertFails(getDoc(bobTryingAliceDoc));
    await assertFails(setDoc(bobTryingAliceDoc, buildValidSettingsDocument("bob")));
  });

  it("denies invalid settings payloads", async () => {
    const aliceDb = testEnvironment.authenticatedContext("alice").firestore();
    const aliceDoc = doc(aliceDb, "user_settings", "alice");

    const invalidDoc = buildValidSettingsDocument("alice");
    invalidDoc.crossfade.seconds = 99;

    await assertFails(setDoc(aliceDoc, invalidDoc));
  });
});
