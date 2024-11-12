import React, { createContext, useState, useRef } from 'react';

export const PlayerContext = createContext();

export const PlayerProvider = ({ children }) => {
  const [playlist, setPlaylist] = useState([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(new Audio());

  const playTrack = (index) => {
    setCurrentTrackIndex(index);
    audioRef.current.src = playlist[index].url;
    audioRef.current.play();
    setIsPlaying(true);
  };

  const addToPlaylist = (track) => {
    setPlaylist([...playlist, track]);
  };

  const removeFromPlaylist = (index) => {
    setPlaylist(playlist.filter((_, i) => i !== index));
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
