import { useContext, useState } from "react";
import { PlayerContext } from "../context/AppPlayerContext";

const Playlist = () => {
  const {
    playlists,
    currentPlaylist,
    playbackPlaylist,
    currentTrackIndex,
    nowPlayingTrack,
    setCurrentPlaylist,
    playTrack,
    addTemporaryLocalFile,
    supportsPersistentLocalFiles,
    hasConnectedMusicFolder,
    connectMusicFolder,
    syncMusicFolder,
    removeAllSyncedTracks,
    removeFromPlaylist,
  } = useContext(PlayerContext);

  const [isSyncingMusicFolder, setIsSyncingMusicFolder] = useState(false);
  const [localImportStatus, setLocalImportStatus] = useState("");
  const tracks = playlists[currentPlaylist] || [];

  const handleFileUpload = (event) => {
    const files = event.target.files;
    Array.from(files).forEach((file) => {
      addTemporaryLocalFile(file);
    });
    event.target.value = "";
  };

  const handleConnectMusicFolder = async () => {
    setIsSyncingMusicFolder(true);
    setLocalImportStatus("");
    const result = await connectMusicFolder(currentPlaylist);
    setLocalImportStatus(result.message);
    setIsSyncingMusicFolder(false);
  };

  const handleSyncMusicFolder = async () => {
    setIsSyncingMusicFolder(true);
    setLocalImportStatus("");
    const result = await syncMusicFolder(currentPlaylist);
    setLocalImportStatus(result.message);
    setIsSyncingMusicFolder(false);
  };

  const handleRemoveAllSyncedTracks = () => {
    const removedCount = removeAllSyncedTracks(currentPlaylist);
    if (removedCount > 0) {
      setLocalImportStatus(`Removed ${removedCount} synced folder track(s).`);
      return;
    }

    setLocalImportStatus("No synced folder tracks found in this playlist.");
  };

  return (
    <section className="panel playlist-panel" aria-label="Playlist Manager">
      <header className="panel-head panel-head-row">
        <div>
          <p className="panel-eyebrow">Current Playlist</p>
          <h3 className="panel-title">{currentPlaylist}</h3>
        </div>

        <div className="select-wrap">
          <label htmlFor="playlist-switch">Switch</label>
          <select
            id="playlist-switch"
            className="input select"
            onChange={(e) => setCurrentPlaylist(e.target.value)}
            value={currentPlaylist}
          >
            {Object.keys(playlists).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <ul className="track-list">
        {tracks.length === 0 && (
          <li className="empty-state">No tracks yet. Add a URL or upload files.</li>
        )}
        {tracks.map((track, index) => {
          const isActive =
            Boolean(nowPlayingTrack) &&
            currentPlaylist === playbackPlaylist &&
            index === currentTrackIndex;

          return (
            <li
              className={`track-item ${isActive ? "track-item-active" : ""}`}
              key={`${track.title}-${index}`}
            >
              <div className="track-text">
                <p className="track-name">{track.title}</p>
                <p className="track-meta">
                  {track.sourceType === "local-folder"
                    ? "Folder track (persistent)"
                    : track.sourceType === "local-handle"
                      ? "Local file (legacy persistent)"
                    : track.sourceType === "temporary-local"
                      ? "Local file (session only)"
                      : "Online track"}
                </p>
              </div>
              <div className="track-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => playTrack(index, currentPlaylist)}
                >
                  Play
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => removeFromPlaylist(index)}
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
              Grant access once to a parent folder and the app can load tracks from
              subfolders.
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
