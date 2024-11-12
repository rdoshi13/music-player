import React, { useContext } from 'react';
import { PlayerContext } from '../context/PlayerContext';

const Player = () => {
  const { playlist, currentTrackIndex, isPlaying, audioRef, playTrack } = useContext(PlayerContext);

  const togglePlayPause = () => {
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const skipTrack = (direction) => {
    const newIndex = (currentTrackIndex + direction + playlist.length) % playlist.length;
    playTrack(newIndex);
  };

  return (
    <div>
      <h2>Now Playing: {playlist[currentTrackIndex]?.title || 'No track selected'}</h2>
      <button onClick={togglePlayPause}>{isPlaying ? 'Pause' : 'Play'}</button>
      <button onClick={() => skipTrack(-1)}>Previous</button>
      <button onClick={() => skipTrack(1)}>Next</button>
    </div>
  );
};

export default Player;
