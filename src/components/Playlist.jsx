import { useContext, useEffect, useRef, useState } from "react";
import { PlayerContext } from "../context/AppPlayerContext";

const VIEW_ALL_TRACKS = "all-tracks";
const VIEW_PLAYLISTS = "playlists";
const PLAYLIST_THUMBNAILS_STORAGE_KEY = "playlistThumbnails";
const THUMBNAIL_MAX_SIDE_PX = 240;
const THUMBNAIL_JPEG_QUALITY = 0.78;
const FOLDER_ACTION_TIMEOUT_MS = 20000;

const MusicNoteIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14.5 3a1 1 0 0 0-1 1v9.06A3.48 3.48 0 0 0 12 12.7c-1.93 0-3.5 1.41-3.5 3.15S10.07 19 12 19s3.5-1.41 3.5-3.15V8.5h4V12a3.48 3.48 0 0 0-1.5-.3c-1.93 0-3.5 1.41-3.5 3.15S16.07 18 18 18s3.5-1.41 3.5-3.15V4a1 1 0 0 0-1-1h-6Z" />
  </svg>
);

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 5.1v13.8c0 .78.85 1.26 1.52.86l10.74-6.9a1 1 0 0 0 0-1.68L9.52 4.24A1 1 0 0 0 8 5.1Z" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm7 0h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
  </svg>
);

const EditIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M15.7 4.3a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L10.4 17.6a1 1 0 0 1-.46.27l-4 1a1 1 0 0 1-1.2-1.2l1-4a1 1 0 0 1 .27-.46L15.7 4.3ZM14.3 6 7.6 12.7l-.64 2.54L9.5 14.6 16.2 8 14.3 6Z" />
  </svg>
);

const DeleteIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 3a1 1 0 0 0-1 1v1H5a1 1 0 1 0 0 2h.6l.8 11a3 3 0 0 0 3 2.8h5.2a3 3 0 0 0 3-2.8l.8-11H19a1 1 0 1 0 0-2h-3V4a1 1 0 0 0-1-1H9Zm1 2h4v1h-4V5Zm-1.6 4a1 1 0 0 1 1 .93l.35 7a1 1 0 1 1-2 .1l-.35-7a1 1 0 0 1 .93-1.03H8.4Zm7.2 0a1 1 0 0 1 .93 1.03l-.35 7a1 1 0 0 1-2-.1l.35-7a1 1 0 0 1 1.03-.93h.04Z" />
  </svg>
);

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read image file."));
    };
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });

const loadImageElement = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image."));
    image.src = src;
  });

const createOptimizedThumbnailDataUrl = async (file) => {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(sourceDataUrl);

  const sourceWidth = image.naturalWidth || image.width || 1;
  const sourceHeight = image.naturalHeight || image.height || 1;
  const maxSide = Math.max(sourceWidth, sourceHeight);
  const scaleFactor = maxSide > THUMBNAIL_MAX_SIDE_PX ? THUMBNAIL_MAX_SIDE_PX / maxSide : 1;
  const width = Math.max(1, Math.round(sourceWidth * scaleFactor));
  const height = Math.max(1, Math.round(sourceHeight * scaleFactor));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return sourceDataUrl;
  }

  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", THUMBNAIL_JPEG_QUALITY);
};

const withActionTimeout = (promise, timeoutMs, timeoutMessage) =>
  Promise.race([
    promise,
    new Promise((resolve) => {
      window.setTimeout(
        () => resolve({ success: false, addedCount: 0, message: timeoutMessage }),
        timeoutMs
      );
    }),
  ]);

const Playlist = () => {
  const {
    playlists,
    playbackPlaylist,
    currentTrackIndex,
    nowPlayingTrack,
    isPlaying,
    audioRef,
    setCurrentPlaylist,
    playTrack,
    addTemporaryLocalFile,
    supportsPersistentLocalFiles,
    hasConnectedMusicFolder,
    connectMusicFolder,
    syncMusicFolder,
    removeAllSyncedTracks,
    removeFromPlaylist,
    renamePlaylist,
    deletePlaylist,
    allTracksPlaylistName,
    recentSongsPlaylistName,
  } = useContext(PlayerContext);

  const [isSyncingMusicFolder, setIsSyncingMusicFolder] = useState(false);
  const [localImportStatus, setLocalImportStatus] = useState("");
  const [activeView, setActiveView] = useState(VIEW_ALL_TRACKS);
  const [selectedPlaylistFromList, setSelectedPlaylistFromList] = useState("");
  const [playlistThumbnails, setPlaylistThumbnails] = useState({});
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPlaylistName, setEditingPlaylistName] = useState("");
  const [editingPlaylistDraftName, setEditingPlaylistDraftName] = useState("");
  const [editingPlaylistThumbnail, setEditingPlaylistThumbnail] = useState("");
  const [editModalStatus, setEditModalStatus] = useState("");
  const thumbnailInputRef = useRef(null);
  const trackRowRefs = useRef({});
  const [pendingJumpTarget, setPendingJumpTarget] = useState(null);

  const playlistNames = Object.keys(playlists);
  const customPlaylistNames = playlistNames.filter(
    (playlistName) => playlistName !== allTracksPlaylistName
  );
  const orderedCustomPlaylistNames = [...customPlaylistNames].sort((left, right) => {
    if (left === recentSongsPlaylistName) {
      return -1;
    }
    if (right === recentSongsPlaylistName) {
      return 1;
    }
    return left.localeCompare(right);
  });
  const hasCustomPlaylists = customPlaylistNames.length > 0;

  const selectedPlaylistName =
    activeView === VIEW_ALL_TRACKS
      ? allTracksPlaylistName
      : customPlaylistNames.includes(selectedPlaylistFromList)
        ? selectedPlaylistFromList
        : "";

  const tracks = playlists[selectedPlaylistName] || [];
  const getPlaylistDisplayName = (playlistName) =>
    playlistName === recentSongsPlaylistName ? "Recent Songs" : playlistName;
  const getPlaylistDisplayThumbnail = (playlistName) => {
    if (playlistName === recentSongsPlaylistName) {
      const recentTracks = playlists[recentSongsPlaylistName] || [];
      const firstTrackWithThumbnail = recentTracks.find(
        (track) => typeof track?.trackThumbnail === "string" && track.trackThumbnail
      );
      return firstTrackWithThumbnail?.trackThumbnail || "";
    }
    return playlistThumbnails[playlistName] || "";
  };
  const viewTitle =
    activeView === VIEW_ALL_TRACKS
      ? "All Tracks"
      : selectedPlaylistName
        ? getPlaylistDisplayName(selectedPlaylistName)
      : hasCustomPlaylists
        ? "Playlists"
        : "No Playlists";

  useEffect(() => {
    const handleJumpToCurrentTrack = (event) => {
      const playlistName = event?.detail?.playlistName;
      const trackIndex = Number(event?.detail?.trackIndex);
      if (
        typeof playlistName !== "string" ||
        !Number.isInteger(trackIndex) ||
        trackIndex < 0
      ) {
        return;
      }

      if (!playlists[playlistName]) {
        return;
      }

      if (playlistName === allTracksPlaylistName) {
        setActiveView(VIEW_ALL_TRACKS);
      } else {
        setActiveView(VIEW_PLAYLISTS);
        setSelectedPlaylistFromList(playlistName);
      }
      setCurrentPlaylist(playlistName);
      setPendingJumpTarget({
        playlistName,
        trackIndex,
        stamp: Date.now(),
      });
    };

    window.addEventListener("player:jump-to-current-track", handleJumpToCurrentTrack);
    return () => {
      window.removeEventListener(
        "player:jump-to-current-track",
        handleJumpToCurrentTrack
      );
    };
  }, [allTracksPlaylistName, playlists, setCurrentPlaylist]);

  useEffect(() => {
    if (!pendingJumpTarget) {
      return;
    }

    if (selectedPlaylistName !== pendingJumpTarget.playlistName) {
      return;
    }

    const rowKey = `${pendingJumpTarget.playlistName}::${pendingJumpTarget.trackIndex}`;
    const targetRow = trackRowRefs.current[rowKey];
    if (!targetRow) {
      return;
    }

    targetRow.scrollIntoView({ behavior: "smooth", block: "center" });
    setPendingJumpTarget(null);
  }, [pendingJumpTarget, selectedPlaylistName, tracks.length]);

  useEffect(() => {
    const storedThumbnails = localStorage.getItem(PLAYLIST_THUMBNAILS_STORAGE_KEY);
    if (!storedThumbnails) {
      return;
    }

    try {
      const parsedThumbnails = JSON.parse(storedThumbnails);
      if (parsedThumbnails && typeof parsedThumbnails === "object") {
        const normalizedThumbnails = Object.fromEntries(
          Object.entries(parsedThumbnails).filter(
            ([playlistName, thumbnail]) =>
              typeof playlistName === "string" &&
              typeof thumbnail === "string" &&
              thumbnail.length > 0
          )
        );
        setPlaylistThumbnails(normalizedThumbnails);
      }
    } catch {
      // Keep UI usable even if local thumbnail data is corrupted.
    }
  }, []);

  const persistPlaylistThumbnails = (nextThumbnails) => {
    try {
      localStorage.setItem(
        PLAYLIST_THUMBNAILS_STORAGE_KEY,
        JSON.stringify(nextThumbnails)
      );
      return true;
    } catch {
      return false;
    }
  };

  const updatePlaylistThumbnails = (updater) => {
    const nextThumbnails =
      typeof updater === "function" ? updater(playlistThumbnails) : updater;
    if (!nextThumbnails || typeof nextThumbnails !== "object") {
      return false;
    }

    const persisted = persistPlaylistThumbnails(nextThumbnails);
    if (!persisted) {
      setEditModalStatus("Could not save thumbnail locally. Try a smaller image.");
      return false;
    }

    setPlaylistThumbnails(nextThumbnails);
    return true;
  };

  const handleFileUpload = (event) => {
    const files = event.target.files;
    Array.from(files).forEach((file) => {
      addTemporaryLocalFile(file, allTracksPlaylistName);
    });
    event.target.value = "";
  };

  const handleConnectMusicFolder = async () => {
    setIsSyncingMusicFolder(true);
    setLocalImportStatus("");
    try {
      const result = await withActionTimeout(
        connectMusicFolder(allTracksPlaylistName),
        FOLDER_ACTION_TIMEOUT_MS,
        "Folder import is taking too long. Try a smaller folder or sync again."
      );
      setLocalImportStatus(result?.message || "Could not connect the folder.");
    } catch {
      setLocalImportStatus("Could not connect the folder. Please try again.");
    } finally {
      setIsSyncingMusicFolder(false);
    }
  };

  const handleSyncMusicFolder = async () => {
    setIsSyncingMusicFolder(true);
    setLocalImportStatus("");
    try {
      const result = await withActionTimeout(
        syncMusicFolder(allTracksPlaylistName),
        FOLDER_ACTION_TIMEOUT_MS,
        "Folder sync is taking too long. Try syncing again."
      );
      setLocalImportStatus(result?.message || "Could not sync folder tracks.");
    } catch {
      setLocalImportStatus("Could not sync folder tracks. Please reconnect and try again.");
    } finally {
      setIsSyncingMusicFolder(false);
    }
  };

  const handleRemoveAllSyncedTracks = () => {
    const removedCount = removeAllSyncedTracks(allTracksPlaylistName);
    if (removedCount > 0) {
      setLocalImportStatus(`Removed ${removedCount} synced folder track(s).`);
      return;
    }

    setLocalImportStatus("No synced folder tracks found in All Tracks.");
  };

  const openAllTracksView = () => {
    setActiveView(VIEW_ALL_TRACKS);
  };

  const openPlaylistsView = () => {
    setActiveView(VIEW_PLAYLISTS);
    setSelectedPlaylistFromList("");
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditingPlaylistName("");
    setEditingPlaylistDraftName("");
    setEditingPlaylistThumbnail("");
    setEditModalStatus("");
  };

  const openEditModal = (playlistName) => {
    setEditingPlaylistName(playlistName);
    setEditingPlaylistDraftName(playlistName);
    setEditingPlaylistThumbnail(playlistThumbnails[playlistName] || "");
    setEditModalStatus("");
    setIsEditModalOpen(true);
  };

  const handleDeletePlaylist = (playlistName) => {
    const deleted = deletePlaylist(playlistName);
    if (!deleted) {
      return;
    }

    if (selectedPlaylistFromList === playlistName) {
      setSelectedPlaylistFromList("");
    }

    updatePlaylistThumbnails((previousThumbnails) => {
      if (!previousThumbnails[playlistName]) {
        return previousThumbnails;
      }
      const nextThumbnails = { ...previousThumbnails };
      delete nextThumbnails[playlistName];
      return nextThumbnails;
    });

    if (editingPlaylistName === playlistName) {
      closeEditModal();
    }
  };

  const handleSavePlaylistEdits = () => {
    if (!editingPlaylistName) {
      return;
    }

    const trimmedName = editingPlaylistDraftName.trim();
    if (!trimmedName) {
      setEditModalStatus("Playlist name cannot be empty.");
      return;
    }

    let finalPlaylistName = editingPlaylistName;
    if (trimmedName !== editingPlaylistName) {
      const renamed = renamePlaylist(editingPlaylistName, trimmedName);
      if (!renamed) {
        setEditModalStatus("Could not rename playlist. Name may already exist.");
        return;
      }
      finalPlaylistName = trimmedName;
    }

    const saved = updatePlaylistThumbnails((previousThumbnails) => {
      const nextThumbnails = { ...previousThumbnails };
      if (editingPlaylistName !== finalPlaylistName) {
        delete nextThumbnails[editingPlaylistName];
      }

      if (editingPlaylistThumbnail) {
        nextThumbnails[finalPlaylistName] = editingPlaylistThumbnail;
      } else {
        delete nextThumbnails[finalPlaylistName];
      }

      return nextThumbnails;
    });
    if (!saved) {
      return;
    }

    if (selectedPlaylistFromList === editingPlaylistName) {
      setSelectedPlaylistFromList(finalPlaylistName);
    }

    closeEditModal();
  };

  const handleThumbnailFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setEditModalStatus("Please choose an image file.");
      return;
    }

    try {
      const optimizedThumbnail = await createOptimizedThumbnailDataUrl(file);
      setEditingPlaylistThumbnail(optimizedThumbnail);
      setEditModalStatus("");
    } catch {
      setEditModalStatus("Could not process image. Please try another file.");
    }
  };

  return (
    <section className="panel playlist-panel" aria-label="Playlist Manager">
      <header className="panel-head panel-head-row">
        <div>
          <p className="panel-eyebrow">Current View</p>
          <h3 className="panel-title">{viewTitle}</h3>
        </div>

        <div className="view-pill-group" role="tablist" aria-label="Track views">
          <button
            type="button"
            className={`view-pill ${activeView === VIEW_ALL_TRACKS ? "view-pill-active" : ""}`}
            onClick={openAllTracksView}
            role="tab"
            aria-selected={activeView === VIEW_ALL_TRACKS}
          >
            All Tracks
          </button>
          <button
            type="button"
            className={`view-pill ${activeView === VIEW_PLAYLISTS ? "view-pill-active" : ""}`}
            onClick={openPlaylistsView}
            role="tab"
            aria-selected={activeView === VIEW_PLAYLISTS}
          >
            Playlists
          </button>
        </div>
      </header>

      {activeView === VIEW_PLAYLISTS && (
        <div className="playlist-browser" aria-label="Available playlists">
          {hasCustomPlaylists ? (
            <ul className="playlist-list">
              {orderedCustomPlaylistNames.map((name) => {
                const playlistTrackCount = (playlists[name] || []).length;
                const canPlayPlaylist = playlistTrackCount > 0;
                const isSystemRecentSongs = name === recentSongsPlaylistName;
                const playlistDisplayName = getPlaylistDisplayName(name);
                const playlistDisplayThumbnail = getPlaylistDisplayThumbnail(name);

                return (
                  <li key={name} className="playlist-list-row">
                    <button
                      type="button"
                      className="playlist-cover-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!canPlayPlaylist) {
                          return;
                        }

                        setSelectedPlaylistFromList(name);
                        setCurrentPlaylist(name);
                        void playTrack(0, name);
                      }}
                      disabled={!canPlayPlaylist}
                      aria-label={
                        canPlayPlaylist
                          ? `Play playlist ${playlistDisplayName}`
                          : `Playlist ${playlistDisplayName} has no tracks`
                      }
                    >
                      {playlistDisplayThumbnail ? (
                        <img
                          src={playlistDisplayThumbnail}
                          alt={`${playlistDisplayName} thumbnail`}
                          className="playlist-cover-image"
                        />
                      ) : (
                        <span className="playlist-icon playlist-icon-music">
                          <MusicNoteIcon />
                        </span>
                      )}
                      <span className="playlist-icon playlist-icon-play">
                        <PlayIcon />
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`playlist-list-item ${selectedPlaylistName === name ? "playlist-list-item-active" : ""}`}
                      onClick={() => {
                        setSelectedPlaylistFromList(name);
                        setCurrentPlaylist(name);
                      }}
                    >
                      {playlistDisplayName}
                    </button>
                    {!isSystemRecentSongs && (
                      <div className="playlist-row-actions">
                        <button
                          type="button"
                          className="playlist-action-btn"
                          onClick={() => openEditModal(name)}
                          aria-label={`Edit playlist ${playlistDisplayName}`}
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          className="playlist-action-btn playlist-action-btn-danger"
                          onClick={() => handleDeletePlaylist(name)}
                          aria-label={`Delete playlist ${playlistDisplayName}`}
                        >
                          <DeleteIcon />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="playlist-chip-empty">
              No custom playlists yet. Use the add-to-playlist control in the player.
            </p>
          )}
        </div>
      )}

      {isEditModalOpen && (
        <div className="playlist-modal-backdrop" onClick={closeEditModal}>
          <div
            className="playlist-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit playlist"
            onClick={(event) => event.stopPropagation()}
          >
            <h4>Edit Playlist</h4>
            <div className="playlist-modal-grid">
              <button
                type="button"
                className="playlist-thumbnail-picker"
                onClick={() => thumbnailInputRef.current?.click()}
                aria-label="Upload playlist thumbnail"
              >
                {editingPlaylistThumbnail ? (
                  <img
                    src={editingPlaylistThumbnail}
                    alt={`${editingPlaylistDraftName || editingPlaylistName} thumbnail`}
                    className="playlist-thumbnail-image"
                  />
                ) : (
                  <MusicNoteIcon />
                )}
              </button>
              <div className="playlist-modal-fields">
                <label htmlFor="playlist-rename-input">Playlist Name</label>
                <input
                  id="playlist-rename-input"
                  className="input"
                  value={editingPlaylistDraftName}
                  onChange={(event) => setEditingPlaylistDraftName(event.target.value)}
                  placeholder="Playlist name"
                />
              </div>
            </div>
            <input
              ref={thumbnailInputRef}
              type="file"
              accept="image/*"
              className="visually-hidden"
              onChange={handleThumbnailFileChange}
            />
            {editModalStatus && <p className="helper-text">{editModalStatus}</p>}
            <div className="playlist-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={closeEditModal}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSavePlaylistEdits}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <ul className="track-list">
        {tracks.length === 0 && activeView === VIEW_ALL_TRACKS && (
          <li className="empty-state">No tracks yet. Sync a music folder to populate All Tracks.</li>
        )}
        {tracks.length === 0 && activeView === VIEW_PLAYLISTS && hasCustomPlaylists && !selectedPlaylistName && (
          <li className="empty-state">Select a playlist from the list to view its tracks.</li>
        )}
        {tracks.length === 0 && activeView === VIEW_PLAYLISTS && hasCustomPlaylists && selectedPlaylistName && (
          <li className="empty-state">No tracks in this playlist yet.</li>
        )}
        {tracks.length === 0 && activeView === VIEW_PLAYLISTS && !hasCustomPlaylists && (
          <li className="empty-state">Create a playlist by adding the current song from player controls.</li>
        )}
        {tracks.map((track, index) => {
          const isActive =
            Boolean(nowPlayingTrack) &&
            selectedPlaylistName === playbackPlaylist &&
            index === currentTrackIndex;
          const rowKey = `${selectedPlaylistName}::${index}`;
          const overlayIsPause = isActive && isPlaying;
          const handleTrackThumbnailClick = () => {
            if (!isActive) {
              void playTrack(index, selectedPlaylistName);
              return;
            }

            if (!audioRef.current?.src) {
              void playTrack(index, selectedPlaylistName);
              return;
            }

            if (isPlaying) {
              audioRef.current.pause();
              return;
            }

            const playPromise = audioRef.current.play();
            if (playPromise?.catch) {
              playPromise.catch(() => undefined);
            }
          };

          return (
            <li
              className={`track-item ${isActive ? "track-item-active" : ""}`}
              key={`${track.title}-${index}`}
              ref={(node) => {
                if (node) {
                  trackRowRefs.current[rowKey] = node;
                } else {
                  delete trackRowRefs.current[rowKey];
                }
              }}
            >
              <div className="track-main">
                <button
                  type="button"
                  className="track-thumb-btn"
                  onClick={handleTrackThumbnailClick}
                  aria-label={`${overlayIsPause ? "Pause" : "Play"} ${track.title}`}
                >
                  {track.trackThumbnail ? (
                    <img
                      src={track.trackThumbnail}
                      alt=""
                      className="track-thumb-image"
                    />
                  ) : (
                    <span className="track-thumb-icon track-thumb-icon-music">
                      <MusicNoteIcon />
                    </span>
                  )}
                  <span className="track-thumb-icon track-thumb-icon-play">
                    {overlayIsPause ? <PauseIcon /> : <PlayIcon />}
                  </span>
                </button>
                <div className="track-text">
                  <p className="track-name">{track.title}</p>
                  <p className="track-meta">
                    {track.sourceType === "local-folder"
                      ? selectedPlaylistName === allTracksPlaylistName
                        ? track.sourceFolderName || "Unknown folder"
                        : "Folder track (persistent)"
                      : track.sourceType === "local-handle"
                        ? "Local file (legacy persistent)"
                      : track.sourceType === "temporary-local"
                        ? "Local file (session only)"
                      : "Online track"}
                  </p>
                </div>
              </div>
              <div className="track-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => removeFromPlaylist(index, selectedPlaylistName)}
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <section className="form-block">
        <h4>Upload Local Files</h4>
        {supportsPersistentLocalFiles ? (
          <>
            <div className="inline-actions">
              <button
                className="btn btn-ghost"
                onClick={handleConnectMusicFolder}
                disabled={isSyncingMusicFolder}
              >
                {isSyncingMusicFolder ? "Working..." : "Connect Music Folder"}
              </button>
              <button
                className="btn btn-ghost"
                onClick={handleSyncMusicFolder}
                disabled={isSyncingMusicFolder || !hasConnectedMusicFolder}
              >
                {isSyncingMusicFolder ? "Working..." : "Sync Folder Tracks"}
              </button>
              <button
                className="btn btn-danger"
                onClick={handleRemoveAllSyncedTracks}
                disabled={isSyncingMusicFolder}
              >
                Remove All Synced Tracks
              </button>
            </div>
            <p className="helper-text">
              Grant access once to a parent folder and the app can load tracks from subfolders into All Tracks.
            </p>
            {localImportStatus && <p className="helper-text">{localImportStatus}</p>}
          </>
        ) : (
          <>
            <label htmlFor="track-upload">Audio Files</label>
            <input
              id="track-upload"
              className="input"
              type="file"
              accept="audio/*"
              multiple
              onChange={handleFileUpload}
            />
            <p className="helper-text">
              Persistent local files are not supported in this browser. Uploads are
              session-only.
            </p>
            {localImportStatus && <p className="helper-text">{localImportStatus}</p>}
          </>
        )}
      </section>
    </section>
  );
};

export default Playlist;
