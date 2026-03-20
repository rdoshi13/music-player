import { useCallback, useEffect, useRef, useState } from "react";
import { PlayerContext } from "./AppPlayerContext";
import { useSettings } from "./useSettings";
import {
  loadFolderHandle,
  loadTrackHandle,
  removeTrackHandle,
  saveFolderHandle,
  saveTrackHandle,
  supportsFileSystemAccess,
} from "../utils/localTrackStore";
import { extractEmbeddedArtworkDataUrl } from "../utils/trackArtwork";

const ALL_TRACKS_PLAYLIST = "recent";
const RECENT_SONGS_PLAYLIST = "__recent_songs__";
const RECENT_SONGS_LIMIT = 25;
const MUSIC_FOLDER_HANDLE_ID = "primary-music-folder";
const HANDLE_STORAGE_TIMEOUT_MS = 3500;
const PLAYLISTS_STORAGE_MAX_CHARS = 2_500_000;
const PLAYLISTS_STORAGE_KEY = "playlists";
const VOLUME_STORAGE_KEY = "playerVolume";
const CURRENT_PLAYLIST_STORAGE_KEY = "currentPlaylist";
const PLAYBACK_SESSION_STORAGE_KEY = "playbackSession";

const REMOTE_TRACK_TYPE = "remote";
const LOCAL_HANDLE_TRACK_TYPE = "local-handle";
const LOCAL_FOLDER_TRACK_TYPE = "local-folder";
const TEMP_LOCAL_TRACK_TYPE = "temporary-local";

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".aac",
  ".flac",
  ".webm",
]);

const isAudioFileName = (fileName) => {
  const normalizedName = fileName.toLowerCase();
  return Array.from(AUDIO_EXTENSIONS).some((extension) =>
    normalizedName.endsWith(extension)
  );
};

const isRemoteTrack = (track) =>
  Boolean(
    track &&
      typeof track === "object" &&
      (track.sourceType === REMOTE_TRACK_TYPE || !track.sourceType) &&
      typeof track.title === "string" &&
      typeof track.url === "string" &&
      !track.url.startsWith("blob:")
  );

const isLocalHandleTrack = (track) =>
  Boolean(
    track &&
      typeof track === "object" &&
      track.sourceType === LOCAL_HANDLE_TRACK_TYPE &&
      typeof track.localHandleId === "string" &&
      typeof track.title === "string"
  );

const isLocalFolderTrack = (track) =>
  Boolean(
    track &&
      typeof track === "object" &&
      track.sourceType === LOCAL_FOLDER_TRACK_TYPE &&
      typeof track.relativePath === "string" &&
      typeof track.title === "string"
  );

const isTemporaryLocalTrack = (track) =>
  Boolean(
    track &&
      typeof track === "object" &&
      track.sourceType === TEMP_LOCAL_TRACK_TYPE &&
      typeof track.url === "string"
  );

const isTransferableTrack = (track) =>
  isRemoteTrack(track) || isLocalHandleTrack(track) || isLocalFolderTrack(track);

const serializeTrack = (track) => {
  if (isRemoteTrack(track)) {
    return {
      sourceType: REMOTE_TRACK_TYPE,
      title: track.title,
      url: track.url,
      fileName: track.fileName,
    };
  }

  if (isLocalHandleTrack(track)) {
    return {
      sourceType: LOCAL_HANDLE_TRACK_TYPE,
      title: track.title,
      localHandleId: track.localHandleId,
      fileName: track.fileName,
    };
  }

  if (isLocalFolderTrack(track)) {
    return {
      sourceType: LOCAL_FOLDER_TRACK_TYPE,
      title: track.title,
      fileName: track.fileName,
      relativePath: track.relativePath,
      folderHandleId: track.folderHandleId || MUSIC_FOLDER_HANDLE_ID,
      sourceFolderName: track.sourceFolderName,
    };
  }

  return null;
};

const normalizeStoredPlaylists = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { [ALL_TRACKS_PLAYLIST]: [], [RECENT_SONGS_PLAYLIST]: [] };
  }

  const normalizedPlaylists = {};

  Object.entries(value).forEach(([playlistName, tracks]) => {
    if (typeof playlistName !== "string" || !Array.isArray(tracks)) {
      return;
    }

    normalizedPlaylists[playlistName] = tracks
      .map((track) => {
        const serializedTrack = serializeTrack(track);
        if (serializedTrack) {
          return serializedTrack;
        }

        // Backward compatibility for older persisted remote format.
        if (
          track &&
          typeof track === "object" &&
          typeof track.title === "string" &&
          typeof track.url === "string" &&
          !track.url.startsWith("blob:")
        ) {
          return {
            sourceType: REMOTE_TRACK_TYPE,
            title: track.title,
            url: track.url,
            fileName: track.fileName,
          };
        }

        return null;
      })
      .filter(Boolean);
  });

  if (!normalizedPlaylists[ALL_TRACKS_PLAYLIST]) {
    normalizedPlaylists[ALL_TRACKS_PLAYLIST] = [];
  }

  if (!normalizedPlaylists[RECENT_SONGS_PLAYLIST]) {
    normalizedPlaylists[RECENT_SONGS_PLAYLIST] = [];
  }

  return normalizedPlaylists;
};

const withTimeout = async (
  promise,
  timeoutMs,
  fallbackValue = null
) =>
  Promise.race([
    promise,
    new Promise((resolve) => {
      window.setTimeout(() => resolve(fallbackValue), timeoutMs);
    }),
  ]);

const TRACK_ARTWORK_TIMEOUT_MS = 220;
const BACKGROUND_THUMBNAIL_BATCH_SIZE = 35;
const PLAYBACK_START_TIMEOUT_MS = 2000;
const EQ_BASS_FREQUENCY_HZ = 220;
const EQ_MID_FREQUENCY_HZ = 1100;
const EQ_MID_Q = 0.85;
const EQ_TREBLE_FREQUENCY_HZ = 3600;
const EQ_OUTPUT_CEILING_GAIN = 0.9;
const CROSSFADE_STEP_MS = 40;
const CROSSFADE_MIN_SECONDS = 1;
const CROSSFADE_MAX_SECONDS = 12;

export const PlayerProvider = ({ children }) => {
  const { settings, isSettingsLoading } = useSettings();
  const [playlists, setPlaylists] = useState({
    [ALL_TRACKS_PLAYLIST]: [],
    [RECENT_SONGS_PLAYLIST]: [],
  });
  const [currentPlaylist, setCurrentPlaylistState] = useState(ALL_TRACKS_PLAYLIST);
  const [playbackPlaylist, setPlaybackPlaylist] = useState(ALL_TRACKS_PLAYLIST);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [nowPlayingTrack, setNowPlayingTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isHydrated, setIsHydrated] = useState(false);
  const [supportsPersistentLocalFiles] = useState(() =>
    supportsFileSystemAccess()
  );
  const [hasConnectedMusicFolder, setHasConnectedMusicFolder] = useState(false);
  const audioRef = useRef(new Audio());
  const localTrackUrlCacheRef = useRef({});
  const localFileHandleCacheRef = useRef({});
  const musicFolderHandleRef = useRef(null);
  const playTrackRef = useRef(null);
  const syncMusicFolderRef = useRef(null);
  const playTrackRequestIdRef = useRef(0);
  const pendingPlaybackSessionRef = useRef(null);
  const hasAppliedPlaybackStartupRef = useRef(false);
  const hasAttemptedAutoRescanRef = useRef(false);
  const crossfadeOutgoingAudioRef = useRef(null);
  const crossfadeTimerIdsRef = useRef([]);
  const crossfadeTransitionActiveRef = useRef(false);
  const crossfadeTriggeredTrackRef = useRef("");
  const suppressPauseCleanupRef = useRef(false);
  const audioContextRef = useRef(null);
  const mediaElementSourceRef = useRef(null);
  const equalizerNodesRef = useRef(null);

  const playbackAutoplayBehavior = settings.playback.autoplayBehavior;
  const autoRescanOnLaunch = settings.library.autoRescanOnLaunch;
  const duplicateHandling = settings.library.duplicateHandling;
  const folderSortMode = settings.library.folderSortMode;
  const isCrossfadeEnabled = Boolean(settings.crossfade.enabled);
  const crossfadeSeconds = Math.max(
    CROSSFADE_MIN_SECONDS,
    Math.min(CROSSFADE_MAX_SECONDS, Number(settings.crossfade.seconds) || 0)
  );

  const getAudioContextConstructor = useCallback(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return window.AudioContext || window.webkitAudioContext || null;
  }, []);

  const ensureEqualizerGraph = useCallback(() => {
    if (equalizerNodesRef.current && mediaElementSourceRef.current && audioContextRef.current) {
      return true;
    }

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
      return false;
    }

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextCtor();
      }

      const audioContext = audioContextRef.current;
      const audioElement = audioRef.current;
      if (!audioElement) {
        return false;
      }

      // Avoid creating the source node before media src is set; some browsers
      // can get into a bad playback state when the graph is initialized too early.
      if (!mediaElementSourceRef.current && !audioElement.src) {
        return false;
      }

      if (!mediaElementSourceRef.current) {
        mediaElementSourceRef.current = audioContext.createMediaElementSource(audioElement);
      }

      if (!equalizerNodesRef.current) {
        const bassNode = audioContext.createBiquadFilter();
        bassNode.type = "lowshelf";
        bassNode.frequency.value = EQ_BASS_FREQUENCY_HZ;

        const midNode = audioContext.createBiquadFilter();
        midNode.type = "peaking";
        midNode.frequency.value = EQ_MID_FREQUENCY_HZ;
        midNode.Q.value = EQ_MID_Q;

        const trebleNode = audioContext.createBiquadFilter();
        trebleNode.type = "highshelf";
        trebleNode.frequency.value = EQ_TREBLE_FREQUENCY_HZ;

        const outputGainNode = audioContext.createGain();
        outputGainNode.gain.value = EQ_OUTPUT_CEILING_GAIN;

        mediaElementSourceRef.current.connect(bassNode);
        bassNode.connect(midNode);
        midNode.connect(trebleNode);
        trebleNode.connect(outputGainNode);
        outputGainNode.connect(audioContext.destination);

        equalizerNodesRef.current = {
          bassNode,
          midNode,
          trebleNode,
          outputGainNode,
        };
      }

      return true;
    } catch {
      return false;
    }
  }, [getAudioContextConstructor]);

  const applyEqualizerSettings = useCallback(() => {
    if (!ensureEqualizerGraph()) {
      return false;
    }

    const audioContext = audioContextRef.current;
    const equalizerNodes = equalizerNodesRef.current;
    if (!audioContext || !equalizerNodes) {
      return false;
    }

    const applyGain = (node, gainValue) => {
      const normalizedGain = Number.isFinite(gainValue) ? gainValue : 0;
      if (typeof node.gain.setTargetAtTime === "function") {
        node.gain.setTargetAtTime(normalizedGain, audioContext.currentTime, 0.012);
        return;
      }
      node.gain.value = normalizedGain;
    };

    const bassGainDb = Number.isFinite(settings.equalizer.bass)
      ? settings.equalizer.bass
      : 0;
    const midGainDb = Number.isFinite(settings.equalizer.mid)
      ? settings.equalizer.mid
      : 0;
    const trebleGainDb = Number.isFinite(settings.equalizer.treble)
      ? settings.equalizer.treble
      : 0;

    applyGain(equalizerNodes.bassNode, bassGainDb);
    applyGain(equalizerNodes.midNode, midGainDb);
    applyGain(equalizerNodes.trebleNode, trebleGainDb);

    if (equalizerNodes.outputGainNode?.gain) {
      const highestPositiveEqGain = Math.max(0, bassGainDb, midGainDb, trebleGainDb);
      const compensationLinear = Math.pow(10, (-highestPositiveEqGain) / 20);
      const targetOutputGain = Math.max(
        0,
        Math.min(1, EQ_OUTPUT_CEILING_GAIN * compensationLinear)
      );

      if (typeof equalizerNodes.outputGainNode.gain.setTargetAtTime === "function") {
        equalizerNodes.outputGainNode.gain.setTargetAtTime(
          targetOutputGain,
          audioContext.currentTime,
          0.012
        );
      } else {
        equalizerNodes.outputGainNode.gain.value = targetOutputGain;
      }
    }
    return true;
  }, [
    ensureEqualizerGraph,
    settings.equalizer.bass,
    settings.equalizer.mid,
    settings.equalizer.treble,
  ]);

  const resumeAudioEngine = useCallback(async () => {
    if (!ensureEqualizerGraph()) {
      return false;
    }

    const audioContext = audioContextRef.current;
    if (!audioContext) {
      return false;
    }

    if (audioContext.state === "running") {
      return Boolean(audioContext);
    }

    try {
      await audioContext.resume();
      return audioContext.state === "running";
    } catch {
      return false;
    }
  }, [ensureEqualizerGraph]);

  const clearCrossfadeTimers = useCallback(() => {
    crossfadeTimerIdsRef.current.forEach((timerId) => {
      window.clearInterval(timerId);
    });
    crossfadeTimerIdsRef.current = [];
  }, []);

  const stopOutgoingCrossfadeAudio = useCallback(() => {
    const outgoingAudio = crossfadeOutgoingAudioRef.current;
    if (!outgoingAudio) {
      return;
    }

    try {
      outgoingAudio.pause();
    } catch {
      // Best-effort cleanup.
    }

    try {
      outgoingAudio.removeAttribute("src");
      outgoingAudio.load();
    } catch {
      // Best-effort cleanup.
    }
  }, []);

  const stopCrossfadeTransition = useCallback(() => {
    clearCrossfadeTimers();
    stopOutgoingCrossfadeAudio();
    crossfadeTransitionActiveRef.current = false;
  }, [clearCrossfadeTimers, stopOutgoingCrossfadeAudio]);

  const animateAudioVolume = useCallback(
    (audioElement, fromVolume, toVolume, durationSeconds, onComplete) => {
      if (!audioElement) {
        if (typeof onComplete === "function") {
          onComplete();
        }
        return;
      }

      const safeStart = Math.max(0, Math.min(1, fromVolume));
      const safeEnd = Math.max(0, Math.min(1, toVolume));
      const safeDurationMs = Math.max(120, Math.round(durationSeconds * 1000));
      const startedAt = Date.now();

      audioElement.volume = safeStart;

      const timerId = window.setInterval(() => {
        const elapsedMs = Date.now() - startedAt;
        const progress = Math.min(1, elapsedMs / safeDurationMs);
        const nextVolume = safeStart + (safeEnd - safeStart) * progress;
        audioElement.volume = Math.max(0, Math.min(1, nextVolume));

        if (progress >= 1) {
          window.clearInterval(timerId);
          crossfadeTimerIdsRef.current = crossfadeTimerIdsRef.current.filter(
            (activeTimerId) => activeTimerId !== timerId
          );

          if (typeof onComplete === "function") {
            onComplete();
          }
        }
      }, CROSSFADE_STEP_MS);

      crossfadeTimerIdsRef.current.push(timerId);
    },
    []
  );

  const startOutgoingCrossfade = useCallback(
    async (durationSeconds) => {
      const activeAudio = audioRef.current;
      if (!activeAudio?.src || activeAudio.paused) {
        return false;
      }

      clearCrossfadeTimers();
      stopOutgoingCrossfadeAudio();

      if (!crossfadeOutgoingAudioRef.current) {
        crossfadeOutgoingAudioRef.current = new Audio();
      }

      const outgoingAudio = crossfadeOutgoingAudioRef.current;

      try {
        outgoingAudio.src = activeAudio.src;
        outgoingAudio.currentTime = Math.max(0, activeAudio.currentTime || 0);
        outgoingAudio.playbackRate = activeAudio.playbackRate || 1;
        outgoingAudio.volume = Math.max(0, Math.min(1, volume));

        const playPromise = outgoingAudio.play();
        if (playPromise?.catch) {
          try {
            await playPromise;
          } catch {
            return false;
          }
        }

        animateAudioVolume(
          outgoingAudio,
          outgoingAudio.volume,
          0,
          durationSeconds,
          () => {
            stopOutgoingCrossfadeAudio();
            crossfadeTransitionActiveRef.current = false;
          }
        );

        return true;
      } catch {
        stopOutgoingCrossfadeAudio();
        return false;
      }
    },
    [animateAudioVolume, clearCrossfadeTimers, stopOutgoingCrossfadeAudio, volume]
  );

  const createTrackId = () =>
    globalThis.crypto?.randomUUID?.() ??
    `track-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const getTrackIdentity = (track) => {
    if (!track || typeof track !== "object") {
      return "";
    }

    if (track.sourceType === LOCAL_HANDLE_TRACK_TYPE && track.localHandleId) {
      return `local-handle:${track.localHandleId}`;
    }

    if (track.sourceType === LOCAL_FOLDER_TRACK_TYPE && track.relativePath) {
      return `local-folder:${track.folderHandleId || MUSIC_FOLDER_HANDLE_ID}:${track.relativePath}`;
    }

    if (track.sourceType === TEMP_LOCAL_TRACK_TYPE && track.url) {
      return `temporary-local:${track.url}`;
    }

    if (track.url) {
      return `remote:${track.url}`;
    }

    return `track:${track.title || ""}:${track.fileName || ""}`;
  };

  const cloneTrackForRecentSongs = (track) => {
    const serializedTrack = serializeTrack(track);
    if (serializedTrack) {
      if (track.trackThumbnail) {
        serializedTrack.trackThumbnail = track.trackThumbnail;
      }
      return serializedTrack;
    }

    if (isTemporaryLocalTrack(track)) {
      return {
        sourceType: TEMP_LOCAL_TRACK_TYPE,
        title: track.title,
        url: track.url,
        fileName: track.fileName,
        trackThumbnail: track.trackThumbnail,
      };
    }

    return null;
  };

  const updateRecentSongs = (track) => {
    const recentTrack = cloneTrackForRecentSongs(track);
    if (!recentTrack) {
      return;
    }

    const recentIdentity = getTrackIdentity(recentTrack);
    if (!recentIdentity) {
      return;
    }

    setPlaylists((previousPlaylists) => {
      const existingRecentSongs = previousPlaylists[RECENT_SONGS_PLAYLIST] || [];
      const deduplicatedRecentSongs = existingRecentSongs.filter(
        (item) => getTrackIdentity(item) !== recentIdentity
      );
      const nextRecentSongs = [recentTrack, ...deduplicatedRecentSongs].slice(
        0,
        RECENT_SONGS_LIMIT
      );

      return {
        ...previousPlaylists,
        [RECENT_SONGS_PLAYLIST]: nextRecentSongs,
      };
    });
  };

  const getTrackCacheKey = (track) => {
    if (isLocalHandleTrack(track)) {
      return `handle:${track.localHandleId}`;
    }

    if (isLocalFolderTrack(track)) {
      const folderHandleId = track.folderHandleId || MUSIC_FOLDER_HANDLE_ID;
      return `folder:${folderHandleId}:${track.relativePath}`;
    }

    return "";
  };

  const revokeCachedTrackUrl = (track) => {
    const cacheKey = getTrackCacheKey(track);
    if (!cacheKey) {
      return;
    }

    const objectUrl = localTrackUrlCacheRef.current[cacheKey];
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      delete localTrackUrlCacheRef.current[cacheKey];
    }
  };

  const cleanupLocalHandle = async (localHandleId) => {
    revokeCachedTrackUrl({
      sourceType: LOCAL_HANDLE_TRACK_TYPE,
      localHandleId,
      title: "",
    });
    delete localFileHandleCacheRef.current[localHandleId];
    try {
      await removeTrackHandle(localHandleId);
    } catch {
      // Keep runtime stable even if IndexedDB cleanup fails.
    }
  };

  const isLocalHandleReferenced = (allPlaylists, localHandleId) =>
    Object.values(allPlaylists).some((tracks) =>
      (tracks || []).some(
        (track) =>
          track?.sourceType === LOCAL_HANDLE_TRACK_TYPE &&
          track.localHandleId === localHandleId
      )
    );

  const getMusicFolderHandle = async () => {
    if (musicFolderHandleRef.current) {
      return musicFolderHandleRef.current;
    }

    const storedFolderHandle = await withTimeout(
      loadFolderHandle(MUSIC_FOLDER_HANDLE_ID),
      HANDLE_STORAGE_TIMEOUT_MS,
      null
    );
    if (storedFolderHandle) {
      musicFolderHandleRef.current = storedFolderHandle;
      setHasConnectedMusicFolder(true);
    }
    return storedFolderHandle;
  };

  const ensureFolderPermission = async (folderHandle, interactive = false) => {
    if (!folderHandle || typeof folderHandle.queryPermission !== "function") {
      return false;
    }

    let permission = await folderHandle.queryPermission({ mode: "read" });
    if (
      interactive &&
      permission !== "granted" &&
      typeof folderHandle.requestPermission === "function"
    ) {
      permission = await folderHandle.requestPermission({ mode: "read" });
    }

    return permission === "granted";
  };

  const resolvePathFromFolder = async (folderHandle, relativePath) => {
    const pathSegments = relativePath.split("/").filter(Boolean);
    if (pathSegments.length === 0) {
      return null;
    }

    let currentDirectory = folderHandle;
    for (let index = 0; index < pathSegments.length - 1; index += 1) {
      currentDirectory = await currentDirectory.getDirectoryHandle(
        pathSegments[index]
      );
    }

    return currentDirectory.getFileHandle(pathSegments[pathSegments.length - 1]);
  };

  const resolveLocalHandleUrl = async (localHandleId, interactive = true) => {
    const cacheKey = `handle:${localHandleId}`;
    if (localTrackUrlCacheRef.current[cacheKey]) {
      return localTrackUrlCacheRef.current[cacheKey];
    }

    try {
      let handle = localFileHandleCacheRef.current[localHandleId];
      if (!handle) {
        handle = await withTimeout(
          loadTrackHandle(localHandleId),
          HANDLE_STORAGE_TIMEOUT_MS,
          null
        );
        if (handle) {
          localFileHandleCacheRef.current[localHandleId] = handle;
        }
      }

      if (!handle) {
        return "";
      }

      if (typeof handle.queryPermission === "function") {
        let permission = await handle.queryPermission({ mode: "read" });
        if (
          interactive &&
          permission !== "granted" &&
          typeof handle.requestPermission === "function"
        ) {
          permission = await handle.requestPermission({ mode: "read" });
        }

        if (permission !== "granted") {
          return "";
        }
      }

      const file = await handle.getFile();
      const objectUrl = URL.createObjectURL(file);
      localTrackUrlCacheRef.current[cacheKey] = objectUrl;
      return objectUrl;
    } catch {
      return "";
    }
  };

  const resolveLocalFolderTrackUrl = async (track, interactive = true) => {
    const cacheKey = getTrackCacheKey(track);
    if (cacheKey && localTrackUrlCacheRef.current[cacheKey]) {
      return localTrackUrlCacheRef.current[cacheKey];
    }

    try {
      const folderHandle = await getMusicFolderHandle();
      if (!folderHandle) {
        return "";
      }

      const hasPermission = await ensureFolderPermission(
        folderHandle,
        interactive
      );
      if (!hasPermission) {
        return "";
      }

      const fileHandle = await resolvePathFromFolder(
        folderHandle,
        track.relativePath
      );
      if (!fileHandle) {
        return "";
      }

      const file = await fileHandle.getFile();
      const objectUrl = URL.createObjectURL(file);
      if (cacheKey) {
        localTrackUrlCacheRef.current[cacheKey] = objectUrl;
      }
      return objectUrl;
    } catch {
      return "";
    }
  };

  const collectAudioTracksFromDirectory = async (
    directoryHandle,
    pathPrefix = "",
    sourceFolderName = ""
  ) => {
    const tracks = [];
    for await (const [entryName, entryHandle] of directoryHandle.entries()) {
      const nextPath = pathPrefix ? `${pathPrefix}/${entryName}` : entryName;

      if (entryHandle.kind === "directory") {
        const nestedTracks = await collectAudioTracksFromDirectory(
          entryHandle,
          nextPath,
          sourceFolderName
        );
        tracks.push(...nestedTracks);
        continue;
      }

      if (entryHandle.kind === "file" && isAudioFileName(entryName)) {
        tracks.push({
          sourceType: LOCAL_FOLDER_TRACK_TYPE,
          title: entryName,
          fileName: entryName,
          relativePath: nextPath,
          folderHandleId: MUSIC_FOLDER_HANDLE_ID,
          sourceFolderName,
          trackThumbnail: "",
        });
      }
    }

    return tracks;
  };

  const hydrateFolderTrackThumbnailsInBackground = async (
    folderHandle,
    playlistName,
    tracksToHydrate
  ) => {
    if (!folderHandle || !Array.isArray(tracksToHydrate) || tracksToHydrate.length === 0) {
      return;
    }

    const thumbnailByKey = new Map();
    for (const track of tracksToHydrate) {
      if (!isLocalFolderTrack(track) || !track.relativePath) {
        continue;
      }

      try {
        const fileHandle = await resolvePathFromFolder(folderHandle, track.relativePath);
        if (!fileHandle) {
          continue;
        }

        const file = await fileHandle.getFile();
        const thumbnail = await withTimeout(
          extractEmbeddedArtworkDataUrl(file),
          TRACK_ARTWORK_TIMEOUT_MS,
          ""
        );
        if (!thumbnail) {
          continue;
        }

        const key = `${track.folderHandleId || MUSIC_FOLDER_HANDLE_ID}:${track.relativePath}`;
        thumbnailByKey.set(key, thumbnail);
      } catch {
        // Keep folder sync resilient even when thumbnail extraction fails.
      }
    }

    if (thumbnailByKey.size === 0) {
      return;
    }

    setPlaylists((previousPlaylists) => {
      const playlistTracks = previousPlaylists[playlistName] || [];
      let updated = false;

      const nextTracks = playlistTracks.map((track) => {
        if (!isLocalFolderTrack(track) || track.trackThumbnail) {
          return track;
        }

        const key = `${track.folderHandleId || MUSIC_FOLDER_HANDLE_ID}:${track.relativePath}`;
        const thumbnail = thumbnailByKey.get(key);
        if (!thumbnail) {
          return track;
        }

        updated = true;
        return {
          ...track,
          trackThumbnail: thumbnail,
        };
      });

      if (!updated) {
        return previousPlaylists;
      }

      return {
        ...previousPlaylists,
        [playlistName]: nextTracks,
      };
    });
  };

  const importTracksFromMusicFolder = async (
    folderHandle,
    playlistName = currentPlaylist
  ) => {
    const sourceFolderName = folderHandle?.name || "Connected music folder";
    const folderTracks = await collectAudioTracksFromDirectory(
      folderHandle,
      "",
      sourceFolderName
    );
    if (folderTracks.length === 0) {
      return 0;
    }

    const folderTrackByKey = new Map(
      folderTracks.map((track) => [
        `${track.folderHandleId || MUSIC_FOLDER_HANDLE_ID}:${track.relativePath}`,
        track,
      ])
    );

    let addedCount = 0;
    setPlaylists((previousPlaylists) => {
      const existingTracks = previousPlaylists[playlistName] || [];
      const existingTrackKeys = new Set();
      let updatedExistingTracks = false;

      const mergedTracks = existingTracks.map((track) => {
        if (!isLocalFolderTrack(track)) {
          return track;
        }

        const key = `${track.folderHandleId || MUSIC_FOLDER_HANDLE_ID}:${track.relativePath}`;
        existingTrackKeys.add(key);

        const importedTrack = folderTrackByKey.get(key);
        if (!importedTrack) {
          return track;
        }

        const nextSourceFolderName =
          track.sourceFolderName || importedTrack.sourceFolderName || "";
        const nextTrackThumbnail =
          importedTrack.trackThumbnail || track.trackThumbnail || "";

        if (
          nextSourceFolderName === (track.sourceFolderName || "") &&
          nextTrackThumbnail === (track.trackThumbnail || "")
        ) {
          return track;
        }

        updatedExistingTracks = true;
        return {
          ...track,
          sourceFolderName: nextSourceFolderName,
          trackThumbnail: nextTrackThumbnail,
        };
      });

      const newTracks = folderTracks.filter((track) => {
        const key = `${track.folderHandleId || MUSIC_FOLDER_HANDLE_ID}:${track.relativePath}`;
        if (existingTrackKeys.has(key)) {
          return duplicateHandling === "keep-both";
        }
        existingTrackKeys.add(key);
        return true;
      });

      addedCount = newTracks.length;

      if (!updatedExistingTracks && newTracks.length === 0) {
        return previousPlaylists;
      }

      let nextPlaylistTracks = [...mergedTracks, ...newTracks];
      if (folderSortMode === "recent-first") {
        nextPlaylistTracks = [...newTracks, ...mergedTracks];
      } else if (folderSortMode === "alphabetical") {
        nextPlaylistTracks = [...nextPlaylistTracks].sort((left, right) =>
          (left?.title || "").localeCompare(right?.title || "", undefined, {
            sensitivity: "base",
          })
        );
      }

      return {
        ...previousPlaylists,
        [playlistName]: nextPlaylistTracks,
      };
    });

    const thumbnailHydrationTracks = folderTracks
      .slice(0, BACKGROUND_THUMBNAIL_BATCH_SIZE);
    void hydrateFolderTrackThumbnailsInBackground(
      folderHandle,
      playlistName,
      thumbnailHydrationTracks
    );

    return addedCount;
  };

  useEffect(() => {
    let hydratedPlaylists = {
      [ALL_TRACKS_PLAYLIST]: [],
      [RECENT_SONGS_PLAYLIST]: [],
    };
    const storedPlaylists = localStorage.getItem(PLAYLISTS_STORAGE_KEY);
    if (storedPlaylists) {
      if (storedPlaylists.length > PLAYLISTS_STORAGE_MAX_CHARS) {
        localStorage.removeItem(PLAYLISTS_STORAGE_KEY);
      } else {
        try {
          const parsedPlaylists = JSON.parse(storedPlaylists);
          hydratedPlaylists = normalizeStoredPlaylists(parsedPlaylists);
        } catch {
          hydratedPlaylists = {
            [ALL_TRACKS_PLAYLIST]: [],
            [RECENT_SONGS_PLAYLIST]: [],
          };
          localStorage.removeItem(PLAYLISTS_STORAGE_KEY);
        }
      }
    }
    setPlaylists(hydratedPlaylists);

    const storedCurrentPlaylist = localStorage.getItem(
      CURRENT_PLAYLIST_STORAGE_KEY
    );
    if (
      storedCurrentPlaylist &&
      Object.prototype.hasOwnProperty.call(hydratedPlaylists, storedCurrentPlaylist)
    ) {
      setCurrentPlaylistState(storedCurrentPlaylist);
    } else {
      setCurrentPlaylistState(ALL_TRACKS_PLAYLIST);
    }

    const storedVolume = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (storedVolume !== null) {
      const parsedVolume = Number(storedVolume);
      if (
        Number.isFinite(parsedVolume) &&
        parsedVolume >= 0 &&
        parsedVolume <= 1
      ) {
        setVolume(parsedVolume);
      }
    }

    if (supportsPersistentLocalFiles) {
      void withTimeout(
        loadFolderHandle(MUSIC_FOLDER_HANDLE_ID),
        HANDLE_STORAGE_TIMEOUT_MS,
        null
      )
        .then((folderHandle) => {
          if (folderHandle) {
            musicFolderHandleRef.current = folderHandle;
            setHasConnectedMusicFolder(true);
          }
        })
        .catch(() => {
          setHasConnectedMusicFolder(false);
        });
    }

    const storedPlaybackSession = localStorage.getItem(PLAYBACK_SESSION_STORAGE_KEY);
    if (storedPlaybackSession) {
      try {
        const parsedPlaybackSession = JSON.parse(storedPlaybackSession);
        if (
          parsedPlaybackSession &&
          typeof parsedPlaybackSession.playlistName === "string" &&
          Number.isInteger(parsedPlaybackSession.trackIndex)
        ) {
          pendingPlaybackSessionRef.current = {
            playlistName: parsedPlaybackSession.playlistName,
            trackIndex: Math.max(0, parsedPlaybackSession.trackIndex),
          };
        }
      } catch {
        pendingPlaybackSessionRef.current = null;
      }
    }

    setIsHydrated(true);
  }, [supportsPersistentLocalFiles]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const persistablePlaylists = Object.fromEntries(
      Object.entries(playlists).map(([playlistName, tracks]) => [
        playlistName,
        (tracks || []).map(serializeTrack).filter(Boolean),
      ])
    );

    if (!persistablePlaylists[ALL_TRACKS_PLAYLIST]) {
      persistablePlaylists[ALL_TRACKS_PLAYLIST] = [];
    }
    if (!persistablePlaylists[RECENT_SONGS_PLAYLIST]) {
      persistablePlaylists[RECENT_SONGS_PLAYLIST] = [];
    }

    try {
      localStorage.setItem(
        PLAYLISTS_STORAGE_KEY,
        JSON.stringify(persistablePlaylists)
      );
    } catch {
      // Prevent hard crashes when localStorage quota is reached.
    }
  }, [isHydrated, playlists]);

  useEffect(() => {
    if (!isHydrated || !supportsPersistentLocalFiles) {
      return;
    }

    const localHandleIds = new Set();
    Object.values(playlists).forEach((tracks) => {
      (tracks || []).forEach((track) => {
        if (isLocalHandleTrack(track)) {
          localHandleIds.add(track.localHandleId);
        }
      });
    });

    localHandleIds.forEach((localHandleId) => {
      if (localFileHandleCacheRef.current[localHandleId]) {
        return;
      }

      void withTimeout(
        loadTrackHandle(localHandleId),
        HANDLE_STORAGE_TIMEOUT_MS,
        null
      )
        .then((handle) => {
          if (handle) {
            localFileHandleCacheRef.current[localHandleId] = handle;
          }
        })
        .catch(() => {
          // Keep playback operational for tracks with valid handles.
        });
    });
  }, [isHydrated, playlists, supportsPersistentLocalFiles]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!playlists[currentPlaylist]) {
      setCurrentPlaylistState(ALL_TRACKS_PLAYLIST);
      return;
    }

    localStorage.setItem(CURRENT_PLAYLIST_STORAGE_KEY, currentPlaylist);
  }, [currentPlaylist, isHydrated, playlists]);

  useEffect(() => {
    if (!isHydrated || !nowPlayingTrack) {
      return;
    }

    try {
      localStorage.setItem(
        PLAYBACK_SESSION_STORAGE_KEY,
        JSON.stringify({
          playlistName: playbackPlaylist,
          trackIndex: currentTrackIndex,
          updatedAtMs: Date.now(),
        })
      );
    } catch {
      // Playback should keep working even if session persistence fails.
    }
  }, [currentTrackIndex, isHydrated, nowPlayingTrack, playbackPlaylist]);

  useEffect(() => {
    audioRef.current.volume = volume;
    if (crossfadeOutgoingAudioRef.current && !crossfadeTransitionActiveRef.current) {
      crossfadeOutgoingAudioRef.current.volume = volume;
    }
    localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
  }, [volume]);

  useEffect(
    () => () => {
      Object.values(localTrackUrlCacheRef.current).forEach((objectUrl) => {
        URL.revokeObjectURL(objectUrl);
      });
      localTrackUrlCacheRef.current = {};
      localFileHandleCacheRef.current = {};
      musicFolderHandleRef.current = null;
      stopCrossfadeTransition();
      crossfadeTriggeredTrackRef.current = "";

      if (equalizerNodesRef.current) {
        const { bassNode, midNode, trebleNode, outputGainNode } = equalizerNodesRef.current;
        try {
          bassNode.disconnect();
        } catch {
          // Best-effort cleanup.
        }
        try {
          midNode.disconnect();
        } catch {
          // Best-effort cleanup.
        }
        try {
          trebleNode.disconnect();
        } catch {
          // Best-effort cleanup.
        }
        if (outputGainNode) {
          try {
            outputGainNode.disconnect();
          } catch {
            // Best-effort cleanup.
          }
        }
        equalizerNodesRef.current = null;
      }

      if (mediaElementSourceRef.current) {
        try {
          mediaElementSourceRef.current.disconnect();
        } catch {
          // Best-effort cleanup.
        }
        mediaElementSourceRef.current = null;
      }

      const audioContext = audioContextRef.current;
      audioContextRef.current = null;
      if (audioContext && typeof audioContext.close === "function") {
        void audioContext.close().catch(() => {
          // Best-effort cleanup.
        });
      }
    },
    [stopCrossfadeTransition]
  );

  useEffect(() => {
    if (isSettingsLoading) {
      return;
    }
    applyEqualizerSettings();
  }, [
    applyEqualizerSettings,
    isSettingsLoading,
    settings.equalizer.bass,
    settings.equalizer.mid,
    settings.equalizer.treble,
  ]);

  useEffect(() => {
    if (!isHydrated || isSettingsLoading) {
      return;
    }

    if (hasAppliedPlaybackStartupRef.current) {
      return;
    }

    hasAppliedPlaybackStartupRef.current = true;

    const playbackSession = pendingPlaybackSessionRef.current;
    if (
      !playbackSession ||
      playbackAutoplayBehavior === "stay-paused" ||
      !playlists[playbackSession.playlistName]
    ) {
      return;
    }

    const targetPlaylist = playlists[playbackSession.playlistName] || [];
    if (targetPlaylist.length === 0) {
      return;
    }

    const restoredIndex = Math.min(
      Math.max(0, playbackSession.trackIndex),
      targetPlaylist.length - 1
    );
    const restoredTrack = targetPlaylist[restoredIndex];
    if (!restoredTrack) {
      return;
    }

    setCurrentPlaylistState(playbackSession.playlistName);
    setPlaybackPlaylist(playbackSession.playlistName);
    setCurrentTrackIndex(restoredIndex);
    setNowPlayingTrack(restoredTrack);

    if (playbackAutoplayBehavior === "play-immediately" && playTrackRef.current) {
      void playTrackRef.current(restoredIndex, playbackSession.playlistName);
    }
  }, [isHydrated, isSettingsLoading, playbackAutoplayBehavior, playlists]);

  useEffect(() => {
    if (
      !isHydrated ||
      isSettingsLoading ||
      !supportsPersistentLocalFiles ||
      !hasConnectedMusicFolder ||
      !autoRescanOnLaunch
    ) {
      return;
    }

    if (hasAttemptedAutoRescanRef.current) {
      return;
    }

    hasAttemptedAutoRescanRef.current = true;
    if (syncMusicFolderRef.current) {
      void syncMusicFolderRef.current(ALL_TRACKS_PLAYLIST);
    }
  }, [
    autoRescanOnLaunch,
    hasConnectedMusicFolder,
    isHydrated,
    isSettingsLoading,
    supportsPersistentLocalFiles,
  ]);

  const stopPlayback = () => {
    stopCrossfadeTransition();
    crossfadeTriggeredTrackRef.current = "";
    audioRef.current.pause();
    audioRef.current.src = "";
    setIsPlaying(false);
  };

  const setCurrentPlaylist = (playlistName) => {
    if (!playlists[playlistName]) {
      return;
    }
    setCurrentPlaylistState(playlistName);
  };

  const resolvePlayableUrl = async (track, interactive = true) => {
    if (!track) {
      return "";
    }

    if (track.url) {
      return track.url;
    }

    if (isLocalHandleTrack(track)) {
      return resolveLocalHandleUrl(track.localHandleId, interactive);
    }

    if (isLocalFolderTrack(track)) {
      return resolveLocalFolderTrackUrl(track, interactive);
    }

    return "";
  };

  const playTrack = async (
    index,
    playlistName = currentPlaylist,
    options = {}
  ) => {
    const { disableCrossfade = false } = options;
    const playlist = playlists[playlistName] || [];
    if (playlist.length === 0 || index < 0 || index >= playlist.length) {
      return;
    }

    const requestId = playTrackRequestIdRef.current + 1;
    playTrackRequestIdRef.current = requestId;

    const nextTrack = playlist[index];
    const isLocalTrack =
      isLocalHandleTrack(nextTrack) || isLocalFolderTrack(nextTrack);

    const resolveTrackUrl = async (refreshLocalUrl = false) => {
      if (refreshLocalUrl && isLocalTrack) {
        revokeCachedTrackUrl(nextTrack);
      }
      return resolvePlayableUrl(nextTrack, true);
    };

    let playableUrl = await resolveTrackUrl();
    if (requestId !== playTrackRequestIdRef.current) {
      return;
    }

    if (!playableUrl && isLocalTrack) {
      playableUrl = await resolveTrackUrl(true);
      if (requestId !== playTrackRequestIdRef.current) {
        return;
      }
    }

    if (!playableUrl) {
      return;
    }

    const switchingToSameTrack =
      playbackPlaylist === playlistName && currentTrackIndex === index;
    const shouldCrossfade =
      !disableCrossfade &&
      isCrossfadeEnabled &&
      !switchingToSameTrack &&
      Boolean(audioRef.current?.src) &&
      !audioRef.current.paused &&
      isPlaying;

    const startPlayback = async (url, fadeInSeconds = 0) => {
      audioRef.current.src = url;
      audioRef.current.currentTime = 0;
      audioRef.current.volume = fadeInSeconds > 0 ? 0 : volume;
      try {
        audioRef.current.load();
      } catch {
        // Ignore load failures and still attempt play.
      }
      // Never block playback on audio engine resume.
      void resumeAudioEngine();
      const playPromise = audioRef.current.play();
      let hasStarted = !audioRef.current.paused;
      if (playPromise?.catch) {
        try {
          await Promise.race([
            playPromise,
            new Promise((_, reject) => {
              window.setTimeout(
                () => reject(new Error("Playback start timeout.")),
                PLAYBACK_START_TIMEOUT_MS
              );
            }),
          ]);
          hasStarted = !audioRef.current.paused;
        } catch {
          return false;
        }
      }

      if (!hasStarted) {
        return false;
      }

      if (fadeInSeconds > 0) {
        animateAudioVolume(audioRef.current, 0, volume, fadeInSeconds, () => {
          crossfadeTransitionActiveRef.current = false;
        });
      }

      return true;
    };

    let activeFadeSeconds = 0;
    if (shouldCrossfade) {
      crossfadeTransitionActiveRef.current = true;
      const outgoingStarted = await startOutgoingCrossfade(crossfadeSeconds);
      if (!outgoingStarted) {
        crossfadeTransitionActiveRef.current = false;
      } else {
        activeFadeSeconds = crossfadeSeconds;
      }
    } else {
      stopCrossfadeTransition();
    }

    suppressPauseCleanupRef.current = true;
    let started = await startPlayback(playableUrl, activeFadeSeconds);
    suppressPauseCleanupRef.current = false;
    if (requestId !== playTrackRequestIdRef.current) {
      return;
    }

    if (!started && isLocalTrack) {
      const refreshedUrl = await resolveTrackUrl(true);
      if (requestId !== playTrackRequestIdRef.current) {
        return;
      }

      if (refreshedUrl) {
        suppressPauseCleanupRef.current = true;
        started = await startPlayback(refreshedUrl, activeFadeSeconds);
        suppressPauseCleanupRef.current = false;
      }
    }

    if (!started) {
      stopCrossfadeTransition();
      setIsPlaying(false);
      return;
    }

    setCurrentTrackIndex(index);
    setPlaybackPlaylist(playlistName);
    setNowPlayingTrack(nextTrack);
    crossfadeTriggeredTrackRef.current = "";
    updateRecentSongs(nextTrack);
  };

  playTrackRef.current = playTrack;

  useEffect(() => {
    const audio = audioRef.current;

    const handlePlay = () => {
      setIsPlaying(true);
      void resumeAudioEngine();
    };
    const handlePause = () => {
      setIsPlaying(false);
      if (!suppressPauseCleanupRef.current) {
        stopCrossfadeTransition();
      }
    };
    const handleTimeUpdate = () => {
      if (
        !isCrossfadeEnabled ||
        crossfadeTransitionActiveRef.current ||
        !isPlaying
      ) {
        return;
      }

      const playlist = playlists[playbackPlaylist] || [];
      const nextIndex = currentTrackIndex + 1;
      if (nextIndex >= playlist.length) {
        return;
      }

      const duration = Number(audio.duration);
      const currentTime = Number(audio.currentTime);
      if (!Number.isFinite(duration) || !Number.isFinite(currentTime) || duration <= 0) {
        return;
      }

      const remainingSeconds = duration - currentTime;
      if (remainingSeconds > crossfadeSeconds) {
        return;
      }

      const triggerKey = `${playbackPlaylist}:${currentTrackIndex}`;
      if (crossfadeTriggeredTrackRef.current === triggerKey) {
        return;
      }
      crossfadeTriggeredTrackRef.current = triggerKey;

      if (playTrackRef.current) {
        void playTrackRef.current(nextIndex, playbackPlaylist, {
          disableCrossfade: false,
        });
      }
    };
    const handleEnded = () => {
      const playlist = playlists[playbackPlaylist] || [];
      const nextIndex = currentTrackIndex + 1;
      if (nextIndex < playlist.length && playTrackRef.current) {
        void playTrackRef.current(nextIndex, playbackPlaylist);
        return;
      }

      setIsPlaying(false);
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [
    crossfadeSeconds,
    currentTrackIndex,
    isCrossfadeEnabled,
    isPlaying,
    playbackPlaylist,
    playlists,
    resumeAudioEngine,
    stopCrossfadeTransition,
  ]);

  const addToPlaylist = (track, playlistName = currentPlaylist) => {
    if (!isRemoteTrack(track)) {
      return;
    }

    setPlaylists((previousPlaylists) => ({
      ...previousPlaylists,
      [playlistName]: [
        ...(previousPlaylists[playlistName] || []),
        {
          sourceType: REMOTE_TRACK_TYPE,
          title: track.title,
          url: track.url,
          fileName: track.fileName,
        },
      ],
    }));
  };

  const addLocalFileHandle = async (
    fileHandle,
    playlistName = currentPlaylist
  ) => {
    if (!supportsPersistentLocalFiles || !fileHandle) {
      return false;
    }

    try {
      const file = await fileHandle.getFile();
      const trackThumbnail = await withTimeout(
        extractEmbeddedArtworkDataUrl(file),
        TRACK_ARTWORK_TIMEOUT_MS,
        ""
      );
      const localHandleId = createTrackId();
      await saveTrackHandle(localHandleId, fileHandle);
      localFileHandleCacheRef.current[localHandleId] = fileHandle;

      setPlaylists((previousPlaylists) => ({
        ...previousPlaylists,
        [playlistName]: [
          ...(previousPlaylists[playlistName] || []),
          {
            sourceType: LOCAL_HANDLE_TRACK_TYPE,
            title: file.name,
            localHandleId,
            fileName: file.name,
            trackThumbnail,
          },
        ],
      }));

      return true;
    } catch {
      return false;
    }
  };

  const addTemporaryLocalFile = (file, playlistName = currentPlaylist) => {
    if (!file) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPlaylists((previousPlaylists) => ({
      ...previousPlaylists,
      [playlistName]: [
        ...(previousPlaylists[playlistName] || []),
        {
          sourceType: TEMP_LOCAL_TRACK_TYPE,
          title: file.name,
          url: objectUrl,
          fileName: file.name,
        },
      ],
    }));
  };

  const connectMusicFolder = async (playlistName = currentPlaylist) => {
    if (
      !supportsPersistentLocalFiles ||
      typeof window.showDirectoryPicker !== "function"
    ) {
      return { success: false, addedCount: 0, message: "Folder access is not supported in this browser." };
    }

    try {
      const folderHandle = await window.showDirectoryPicker({ mode: "read" });
      const hasPermission = await ensureFolderPermission(folderHandle, true);
      if (!hasPermission) {
        return { success: false, addedCount: 0, message: "Folder permission was not granted." };
      }

      musicFolderHandleRef.current = folderHandle;
      setHasConnectedMusicFolder(true);
      void saveFolderHandle(MUSIC_FOLDER_HANDLE_ID, folderHandle).catch(() => {
        // Non-blocking: keep runtime folder access even if IndexedDB is unavailable.
      });

      const addedCount = await importTracksFromMusicFolder(
        folderHandle,
        playlistName
      );

      return {
        success: true,
        addedCount,
        message:
          addedCount > 0
            ? `Imported ${addedCount} track(s) from folder.`
            : "No new tracks found in folder.",
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        return { success: false, addedCount: 0, message: "Folder selection was cancelled." };
      }

      return {
        success: false,
        addedCount: 0,
        message: "Could not connect the folder. Please try again.",
      };
    }
  };

  const syncMusicFolder = async (playlistName = currentPlaylist) => {
    try {
      const folderHandle = await getMusicFolderHandle();
      if (!folderHandle) {
        return {
          success: false,
          addedCount: 0,
          message: "No music folder is connected yet.",
        };
      }

      const hasPermission = await ensureFolderPermission(folderHandle, true);
      if (!hasPermission) {
        return {
          success: false,
          addedCount: 0,
          message: "Folder permission was not granted.",
        };
      }

      const addedCount = await importTracksFromMusicFolder(folderHandle, playlistName);
      return {
        success: true,
        addedCount,
        message:
          addedCount > 0
            ? `Synced ${addedCount} new track(s) from folder.`
            : "Folder sync complete. No new tracks found.",
      };
    } catch {
      return {
        success: false,
        addedCount: 0,
        message: "Could not sync folder tracks. Reconnect the folder and try again.",
      };
    }
  };

  syncMusicFolderRef.current = syncMusicFolder;

  const removeAllSyncedTracks = (playlistName = currentPlaylist) => {
    const tracks = playlists[playlistName] || [];
    if (tracks.length === 0) {
      return 0;
    }

    const removedTracks = [];
    const nextTracks = [];
    tracks.forEach((track, index) => {
      if (isLocalFolderTrack(track)) {
        removedTracks.push({ track, index });
      } else {
        nextTracks.push(track);
      }
    });

    if (removedTracks.length === 0) {
      return 0;
    }

    setPlaylists((previousPlaylists) => ({
      ...previousPlaylists,
      [playlistName]: nextTracks,
    }));

    removedTracks.forEach(({ track }) => {
      revokeCachedTrackUrl(track);
    });

    if (playlistName === currentPlaylist) {
      const removedCurrentTrack = removedTracks.some(
        ({ index }) => index === currentTrackIndex
      );
      const removedBeforeCurrentCount = removedTracks.filter(
        ({ index }) => index < currentTrackIndex
      ).length;

      if (removedCurrentTrack) {
        stopPlayback();
      }

      const adjustedTrackIndex = Math.max(
        0,
        Math.min(
          currentTrackIndex - removedBeforeCurrentCount,
          Math.max(0, nextTracks.length - 1)
        )
      );
      setCurrentTrackIndex(adjustedTrackIndex);
    }

    return removedTracks.length;
  };

  const removeFromPlaylist = (index, playlistName = currentPlaylist) => {
    const tracks = playlists[playlistName] || [];
    if (index < 0 || index >= tracks.length) {
      return;
    }

    const removedTrack = tracks[index];
    const nextTracks = tracks.filter((_, itemIndex) => itemIndex !== index);
    const nextPlaylists = {
      ...playlists,
      [playlistName]: nextTracks,
    };

    setPlaylists((previousPlaylists) => ({
      ...previousPlaylists,
      [playlistName]: nextTracks,
    }));

    if (isTemporaryLocalTrack(removedTrack) && removedTrack.url) {
      URL.revokeObjectURL(removedTrack.url);
    } else if (isLocalFolderTrack(removedTrack)) {
      revokeCachedTrackUrl(removedTrack);
    }

    if (
      isLocalHandleTrack(removedTrack) &&
      !isLocalHandleReferenced(nextPlaylists, removedTrack.localHandleId)
    ) {
      void cleanupLocalHandle(removedTrack.localHandleId);
    }

    if (playlistName !== playbackPlaylist) {
      return;
    }

    if (index === currentTrackIndex) {
      stopPlayback();
      const nextIndex = Math.min(index, Math.max(0, nextTracks.length - 1));
      setCurrentTrackIndex(nextIndex);
      setNowPlayingTrack(nextTracks[nextIndex] || null);
      return;
    }

    if (index < currentTrackIndex) {
      setCurrentTrackIndex((previousIndex) => Math.max(0, previousIndex - 1));
      return;
    }

    if (currentTrackIndex >= nextTracks.length) {
      setCurrentTrackIndex(Math.max(0, nextTracks.length - 1));
    }
  };

  const createPlaylist = (playlistName) => {
    const trimmedPlaylistName = playlistName.trim();
    if (
      !trimmedPlaylistName ||
      trimmedPlaylistName === ALL_TRACKS_PLAYLIST ||
      trimmedPlaylistName === RECENT_SONGS_PLAYLIST
    ) {
      return;
    }

    if (!playlists[trimmedPlaylistName]) {
      setPlaylists((previousPlaylists) => ({
        ...previousPlaylists,
        [trimmedPlaylistName]: [],
      }));
    }

    setCurrentPlaylistState(trimmedPlaylistName);
  };

  const ensurePlaylist = (playlistName) => {
    const trimmedPlaylistName = playlistName.trim();
    if (
      !trimmedPlaylistName ||
      trimmedPlaylistName === ALL_TRACKS_PLAYLIST ||
      trimmedPlaylistName === RECENT_SONGS_PLAYLIST
    ) {
      return "";
    }

    if (!playlists[trimmedPlaylistName]) {
      setPlaylists((previousPlaylists) => ({
        ...previousPlaylists,
        [trimmedPlaylistName]: [],
      }));
    }

    return trimmedPlaylistName;
  };

  const addTrackToPlaylist = (track, playlistName) => {
    if (!isTransferableTrack(track)) {
      return false;
    }

    const targetPlaylist = ensurePlaylist(playlistName);
    if (!targetPlaylist) {
      return false;
    }

    const serializedTrack = serializeTrack(track);
    if (!serializedTrack) {
      return false;
    }
    if (track.trackThumbnail) {
      serializedTrack.trackThumbnail = track.trackThumbnail;
    }

    setPlaylists((previousPlaylists) => ({
      ...previousPlaylists,
      [targetPlaylist]: [
        ...(previousPlaylists[targetPlaylist] || []),
        serializedTrack,
      ],
    }));

    return true;
  };

  const renamePlaylist = (oldName, newName) => {
    const trimmedOldName = oldName.trim();
    const trimmedNewName = newName.trim();

    if (
      !trimmedOldName ||
      !trimmedNewName ||
      trimmedOldName === trimmedNewName ||
      trimmedOldName === ALL_TRACKS_PLAYLIST ||
      trimmedOldName === RECENT_SONGS_PLAYLIST ||
      !playlists[trimmedOldName] ||
      playlists[trimmedNewName]
    ) {
      return false;
    }

    const renamedPlaylists = {};
    Object.entries(playlists).forEach(([playlistName, tracks]) => {
      renamedPlaylists[
        playlistName === trimmedOldName ? trimmedNewName : playlistName
      ] = tracks;
    });

    setPlaylists(renamedPlaylists);
    if (currentPlaylist === trimmedOldName) {
      setCurrentPlaylistState(trimmedNewName);
    }
    if (playbackPlaylist === trimmedOldName) {
      setPlaybackPlaylist(trimmedNewName);
    }

    return true;
  };

  const deletePlaylist = (playlistName) => {
    const trimmedPlaylistName = playlistName.trim();
    if (
      trimmedPlaylistName === ALL_TRACKS_PLAYLIST ||
      trimmedPlaylistName === RECENT_SONGS_PLAYLIST ||
      !playlists[trimmedPlaylistName]
    ) {
      return false;
    }

    const updatedPlaylists = { ...playlists };
    const removedTracks = updatedPlaylists[trimmedPlaylistName] || [];
    delete updatedPlaylists[trimmedPlaylistName];

    if (!updatedPlaylists[ALL_TRACKS_PLAYLIST]) {
      updatedPlaylists[ALL_TRACKS_PLAYLIST] = [];
    }
    if (!updatedPlaylists[RECENT_SONGS_PLAYLIST]) {
      updatedPlaylists[RECENT_SONGS_PLAYLIST] = [];
    }

    setPlaylists(updatedPlaylists);

    removedTracks.forEach((track) => {
      if (isTemporaryLocalTrack(track) && track.url) {
        URL.revokeObjectURL(track.url);
      }

      if (isLocalFolderTrack(track)) {
        revokeCachedTrackUrl(track);
      }

      if (
        isLocalHandleTrack(track) &&
        !isLocalHandleReferenced(updatedPlaylists, track.localHandleId)
      ) {
        void cleanupLocalHandle(track.localHandleId);
      }
    });

    if (currentPlaylist === trimmedPlaylistName) {
      setCurrentPlaylistState(ALL_TRACKS_PLAYLIST);
    }
    if (playbackPlaylist === trimmedPlaylistName) {
      stopPlayback();
      setCurrentTrackIndex(0);
      setPlaybackPlaylist(ALL_TRACKS_PLAYLIST);
      setNowPlayingTrack(null);
    }

    return true;
  };

  const contextValue = {
    playlists,
    currentPlaylist,
    playbackPlaylist,
    setCurrentPlaylist,
    currentTrackIndex,
    nowPlayingTrack,
    isPlaying,
    volume,
    setVolume,
    audioRef,
    resumeAudioEngine,
    playTrack,
    addToPlaylist,
    addLocalFileHandle,
    addTemporaryLocalFile,
    supportsPersistentLocalFiles,
    hasConnectedMusicFolder,
    connectMusicFolder,
    syncMusicFolder,
    removeAllSyncedTracks,
    removeFromPlaylist,
    createPlaylist,
    ensurePlaylist,
    addTrackToPlaylist,
    renamePlaylist,
    deletePlaylist,
    allTracksPlaylistName: ALL_TRACKS_PLAYLIST,
    recentSongsPlaylistName: RECENT_SONGS_PLAYLIST,
  };

  return (
    <PlayerContext.Provider value={contextValue}>
      {children}
    </PlayerContext.Provider>
  );
};
