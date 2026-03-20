import { useEffect, useRef, useState } from "react";
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

  const playbackAutoplayBehavior = settings.playback.autoplayBehavior;
  const autoRescanOnLaunch = settings.library.autoRescanOnLaunch;
  const duplicateHandling = settings.library.duplicateHandling;
  const folderSortMode = settings.library.folderSortMode;

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
    },
    []
  );

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

  const playTrack = async (index, playlistName = currentPlaylist) => {
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

    setCurrentTrackIndex(index);
    setPlaybackPlaylist(playlistName);
    setNowPlayingTrack(nextTrack);

    const startPlayback = async (url) => {
      audioRef.current.src = url;
      audioRef.current.currentTime = 0;
      const playPromise = audioRef.current.play();
      if (playPromise?.catch) {
        try {
          await playPromise;
          return true;
        } catch {
          return false;
        }
      }
      return true;
    };

    let started = await startPlayback(playableUrl);
    if (requestId !== playTrackRequestIdRef.current) {
      return;
    }

    if (!started && isLocalTrack) {
      const refreshedUrl = await resolveTrackUrl(true);
      if (requestId !== playTrackRequestIdRef.current) {
        return;
      }

      if (refreshedUrl) {
        started = await startPlayback(refreshedUrl);
      }
    }

    if (!started) {
      setIsPlaying(false);
      return;
    }

    updateRecentSongs(nextTrack);
  };

  playTrackRef.current = playTrack;

  useEffect(() => {
    const audio = audioRef.current;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
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
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [currentTrackIndex, playbackPlaylist, playlists]);

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
