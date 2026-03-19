import { useContext, useEffect, useRef, useState } from "react";
import { PlayerContext } from "../context/AppPlayerContext";

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
};

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

const PreviousIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M18.72 5.25a1 1 0 0 0-1.53-.84L8.16 10.2a2.12 2.12 0 0 0 0 3.6l9.03 5.79a1 1 0 0 0 1.53-.84V5.25ZM5 4a1 1 0 0 1 1 1v14a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Z" />
  </svg>
);

const NextIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5.28 5.25a1 1 0 0 1 1.53-.84l9.03 5.79a2.12 2.12 0 0 1 0 3.6l-9.03 5.79a1 1 0 0 1-1.53-.84V5.25ZM19 4a1 1 0 0 0-1 1v14a1 1 0 1 0 2 0V5a1 1 0 0 0-1-1Z" />
  </svg>
);

const VolumeIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 10a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h3.25l4.1 3.73c.64.58 1.65.13 1.65-.73V7c0-.86-1.01-1.3-1.65-.72L7.25 10H4Zm12.12-1.95a1 1 0 0 1 1.4.12 5.8 5.8 0 0 1 0 7.66 1 1 0 1 1-1.52-1.3 3.8 3.8 0 0 0 0-5.06 1 1 0 0 1 .12-1.42ZM18.9 5.4a1 1 0 0 1 1.4.16 9.4 9.4 0 0 1 0 12.88 1 1 0 1 1-1.56-1.25 7.4 7.4 0 0 0 0-10.38 1 1 0 0 1 .16-1.4Z" />
  </svg>
);

const SleepIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12.1 3.2a8.8 8.8 0 1 0 8.7 10.3 1 1 0 0 0-1.46-1.03 6.8 6.8 0 1 1-8.2-9.9 1 1 0 0 0 .96-1.74Z" />
  </svg>
);

const AddToPlaylistIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 6a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm0 6a1 1 0 0 1 1-1h7a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm1 5a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H5Zm12-6a1 1 0 0 1 1 1v2h2a1 1 0 1 1 0 2h-2v2a1 1 0 1 1-2 0v-2h-2a1 1 0 1 1 0-2h2v-2a1 1 0 0 1 1-1Z" />
  </svg>
);

const Player = () => {
  const {
    playlists,
    playbackPlaylist,
    currentTrackIndex,
    nowPlayingTrack,
    isPlaying,
    volume,
    setVolume,
    ensurePlaylist,
    addTrackToPlaylist,
    audioRef,
    playTrack,
  } = useContext(PlayerContext);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [isSleepOpen, setIsSleepOpen] = useState(false);
  const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false);
  const [sleepSecondsRemaining, setSleepSecondsRemaining] = useState(0);
  const [customSleepMinutes, setCustomSleepMinutes] = useState("45");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [playlistActionStatus, setPlaylistActionStatus] = useState("");
  const volumePopoverRef = useRef(null);
  const sleepPopoverRef = useRef(null);
  const addToPlaylistPopoverRef = useRef(null);
  const playbackQueue = playlists[playbackPlaylist] || [];
  const hasPlaybackQueue = playbackQueue.length > 0;
  const currentTrack = nowPlayingTrack;
  const isSleepTimerActive = sleepSecondsRemaining > 0;

  useEffect(() => {
    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const handleDurationChange = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };

    const handleEmptied = () => {
      setCurrentTime(0);
      setDuration(0);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleDurationChange);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("emptied", handleEmptied);

    handleTimeUpdate();
    handleDurationChange();

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleDurationChange);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("emptied", handleEmptied);
    };
  }, [audioRef]);

  useEffect(() => {
    if (!isSleepTimerActive) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setSleepSecondsRemaining((previousSeconds) => {
        if (previousSeconds <= 1) {
          audioRef.current.pause();
          return 0;
        }
        return previousSeconds - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [audioRef, isSleepTimerActive]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const clickedInsideVolume =
        volumePopoverRef.current &&
        volumePopoverRef.current.contains(event.target);
      const clickedInsideSleep =
        sleepPopoverRef.current &&
        sleepPopoverRef.current.contains(event.target);
      const clickedInsideAddToPlaylist =
        addToPlaylistPopoverRef.current &&
        addToPlaylistPopoverRef.current.contains(event.target);

      if (clickedInsideVolume || clickedInsideSleep || clickedInsideAddToPlaylist) {
        return;
      }

      if (
        volumePopoverRef.current &&
        !volumePopoverRef.current.contains(event.target)
      ) {
        setIsVolumeOpen(false);
      }
      setIsSleepOpen(false);
      setIsAddToPlaylistOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const togglePlayPause = () => {
    if (!hasPlaybackQueue) {
      return;
    }

    if (!audioRef.current.src) {
      if (hasPlaybackQueue) {
        playTrack(currentTrackIndex, playbackPlaylist);
      }
      return;
    }

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      const playPromise = audioRef.current.play();
      if (playPromise?.catch) {
        playPromise.catch(() => undefined);
      }
    }
  };

  const skipTrack = (direction) => {
    if (!hasPlaybackQueue) {
      return;
    }

    const newIndex =
      (currentTrackIndex + direction + playbackQueue.length) %
      playbackQueue.length;
    playTrack(newIndex, playbackPlaylist);
  };

  const handleSeek = (event) => {
    const nextTime = Number(event.target.value);
    setCurrentTime(nextTime);
    if (audioRef.current.src) {
      audioRef.current.currentTime = nextTime;
    }
  };

  const seekMax = Number.isFinite(duration) ? duration : 0;
  const seekValue = Math.min(currentTime, seekMax || 0);
  const hasSleepTimer = sleepSecondsRemaining > 0;

  const startSleepTimer = (minutes) => {
    const totalSeconds = Math.max(1, Math.round(minutes * 60));
    setSleepSecondsRemaining(totalSeconds);
    setIsSleepOpen(false);
  };

  const startCustomSleepTimer = () => {
    const parsedMinutes = Number(customSleepMinutes);
    if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
      return;
    }

    startSleepTimer(parsedMinutes);
  };

  const cancelSleepTimer = () => {
    setSleepSecondsRemaining(0);
    setIsSleepOpen(false);
  };

  const addCurrentTrackToPlaylist = (playlistName) => {
    if (!currentTrack) {
      setPlaylistActionStatus("No track selected to add.");
      return;
    }

    const added = addTrackToPlaylist(currentTrack, playlistName);
    if (!added) {
      setPlaylistActionStatus("Could not add this track to playlist.");
      return;
    }

    setPlaylistActionStatus(`Added "${currentTrack.title}" to ${playlistName}.`);
  };

  const handleCreatePlaylist = () => {
    const trimmedName = newPlaylistName.trim();
    if (!trimmedName) {
      return;
    }

    const createdPlaylistName = ensurePlaylist(trimmedName);
    if (!createdPlaylistName) {
      setPlaylistActionStatus("Could not create playlist.");
      return;
    }

    setNewPlaylistName("");
    if (!currentTrack) {
      setPlaylistActionStatus(`Created playlist "${createdPlaylistName}".`);
      return;
    }

    const added = addTrackToPlaylist(currentTrack, createdPlaylistName);
    if (added) {
      setPlaylistActionStatus(
        `Created "${createdPlaylistName}" and added "${currentTrack.title}".`
      );
      return;
    }

    setPlaylistActionStatus(`Created playlist "${createdPlaylistName}".`);
  };

  return (
    <section className="bottom-player" aria-label="Now Playing Controls">
      <div className="bottom-player-main">
        <div className="track-summary">
          <p className="panel-eyebrow">Now Playing</p>
          <h2 className="track-summary-title" aria-live="polite">
            {currentTrack?.title || "No track selected"}
          </h2>
        </div>

        <div className="control-cluster">
          <button
            className="icon-btn"
            onClick={() => skipTrack(-1)}
            disabled={!hasPlaybackQueue}
            aria-label="Previous track"
          >
            <PreviousIcon />
          </button>

          <button
            className="icon-btn icon-btn-primary"
            onClick={togglePlayPause}
            disabled={!hasPlaybackQueue}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          <button
            className="icon-btn"
            onClick={() => skipTrack(1)}
            disabled={!hasPlaybackQueue}
            aria-label="Next track"
          >
            <NextIcon />
          </button>

          <div className="volume-wrap" ref={volumePopoverRef}>
            <button
              className="icon-btn"
              onClick={() =>
                setIsVolumeOpen((previous) => {
                  const nextValue = !previous;
                  if (nextValue) {
                    setIsSleepOpen(false);
                    setIsAddToPlaylistOpen(false);
                  }
                  return nextValue;
                })
              }
              aria-label="Volume controls"
            >
              <VolumeIcon />
            </button>

            {isVolumeOpen && (
              <div className="volume-popover">
                <input
                  className="volume-slider-vertical"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                  aria-label="Volume"
                />
              </div>
            )}
          </div>

          <div className="sleep-wrap" ref={sleepPopoverRef}>
            <button
              className={`icon-btn ${hasSleepTimer ? "icon-btn-timer" : ""}`}
              onClick={() =>
                setIsSleepOpen((previous) => {
                  const nextValue = !previous;
                  if (nextValue) {
                    setIsVolumeOpen(false);
                    setIsAddToPlaylistOpen(false);
                  }
                  return nextValue;
                })
              }
              aria-label="Sleep timer controls"
            >
              {hasSleepTimer ? (
                <span className="sleep-countdown">{formatTime(sleepSecondsRemaining)}</span>
              ) : (
                <SleepIcon />
              )}
            </button>

            {isSleepOpen && (
              <div className="sleep-popover">
                <p className="sleep-popover-title">Sleep Timer</p>
                <div className="sleep-options">
                  <button className="btn btn-ghost btn-sm" onClick={() => startSleepTimer(5)}>
                    5m
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => startSleepTimer(15)}>
                    15m
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => startSleepTimer(30)}>
                    30m
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => startSleepTimer(60)}>
                    60m
                  </button>
                </div>

                <div className="sleep-custom-row">
                  <label htmlFor="custom-sleep-minutes">Custom</label>
                  <input
                    id="custom-sleep-minutes"
                    className="input sleep-input"
                    type="number"
                    min="1"
                    step="1"
                    value={customSleepMinutes}
                    onChange={(event) => setCustomSleepMinutes(event.target.value)}
                  />
                  <button className="btn btn-primary btn-sm" onClick={startCustomSleepTimer}>
                    Set
                  </button>
                </div>

                {hasSleepTimer && (
                  <button className="btn btn-danger btn-sm" onClick={cancelSleepTimer}>
                    Cancel Timer
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="add-playlist-wrap" ref={addToPlaylistPopoverRef}>
            <button
              className="icon-btn"
              onClick={() =>
                setIsAddToPlaylistOpen((previous) => {
                  const nextValue = !previous;
                  if (nextValue) {
                    setIsVolumeOpen(false);
                    setIsSleepOpen(false);
                  }
                  return nextValue;
                })
              }
              aria-label="Add current track to playlist"
            >
              <AddToPlaylistIcon />
            </button>

            {isAddToPlaylistOpen && (
              <div className="add-playlist-popover">
                <p className="sleep-popover-title">Add to Playlist</p>
                <div className="add-playlist-options">
                  {Object.keys(playlists).map((playlistName) => (
                    <button
                      key={playlistName}
                      className="btn btn-ghost btn-sm add-playlist-option"
                      onClick={() => addCurrentTrackToPlaylist(playlistName)}
                      disabled={!currentTrack}
                    >
                      {playlistName}
                    </button>
                  ))}
                </div>

                <div className="add-playlist-create-row">
                  <input
                    className="input"
                    type="text"
                    placeholder="New playlist"
                    value={newPlaylistName}
                    onChange={(event) => setNewPlaylistName(event.target.value)}
                  />
                  <button className="btn btn-primary btn-sm" onClick={handleCreatePlaylist}>
                    Create
                  </button>
                </div>

                {playlistActionStatus && (
                  <p className="helper-text add-playlist-status">{playlistActionStatus}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="seek-row">
        <span className="seek-time">{formatTime(seekValue)}</span>
        <input
          className="seek-slider"
          type="range"
          min="0"
          max={seekMax || 0}
          step="0.1"
          value={seekValue}
          onChange={handleSeek}
          disabled={!hasPlaybackQueue || !audioRef.current.src}
          aria-label="Seek"
        />
        <span className="seek-time">{formatTime(duration)}</span>
      </div>
    </section>
  );
};

export default Player;
