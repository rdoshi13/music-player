import React, { createContext, useState, useRef, useEffect } from 'react';

export const PlayerContext = createContext();

export const PlayerProvider = ({ children }) => {
  const [playlist, setPlaylist] = useState([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(new Audio());

  // Load playlist from localStorage on initial render
  useEffect(() => {
    const savedPlaylist = JSON.parse(localStorage.getItem('playlist'));
    if (savedPlaylist) {
      setPlaylist(savedPlaylist);
    }
  }, []);

  // Save playlist metadata (without URLs) to localStorage whenever it changes
  useEffect(() => {
    const playlistMetadata = playlist.map((track) => ({
      title: track.title,
      fileName: track.fileName,
    }));
    localStorage.setItem('playlist', JSON.stringify(playlistMetadata));
  }, [playlist]);

  const playTrack = (index) => {
    setCurrentTrackIndex(index);
    audioRef.current.src = playlist[index].url;
    audioRef.current.play();
    setIsPlaying(true);
  };

  const addToPlaylist = (track) => {
    const updatedPlaylist = [...playlist, track];
    setPlaylist(updatedPlaylist);
  };

  const removeFromPlaylist = (index) => {
    const updatedPlaylist = playlist.filter((_, i) => i !== index);
    setPlaylist(updatedPlaylist);
  };

  const contextValue = {
    playlist,
    currentTrackIndex,
    isPlaying,
    audioRef,
    playTrack,
    addToPlaylist,
    removeFromPlaylist,
  };

  return (
    <PlayerContext.Provider value={contextValue}>
      {children}
    </PlayerContext.Provider>
  );
};
