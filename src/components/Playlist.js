import React, { useContext, useState } from 'react';
import { PlayerContext } from '../context/PlayerContext';

const Playlist = () => {
  const { playlist, playTrack, addToPlaylist, removeFromPlaylist } = useContext(PlayerContext);
  const [trackTitle, setTrackTitle] = useState('');
  const [trackURL, setTrackURL] = useState('');

  const handleAddTrack = () => {
    if (trackTitle && trackURL) {
      addToPlaylist({ title: trackTitle, url: trackURL });
      setTrackTitle('');
      setTrackURL('');
    }
  };

  return (
    <div>
      <h3>Playlist</h3>
      <ul>
        {playlist.map((track, index) => (
          <li key={index}>
            {track.title}
            <button onClick={() => playTrack(index)}>Play</button>
            <button onClick={() => removeFromPlaylist(index)}>Remove</button>
          </li>
        ))}
      </ul>
      <input
        type="text"
        placeholder="Track Title"
        value={trackTitle}
        onChange={(e) => setTrackTitle(e.target.value)}
      />
      <input
        type="text"
        placeholder="Track URL"
        value={trackURL}
        onChange={(e) => setTrackURL(e.target.value)}
      />
      <button onClick={handleAddTrack}>Add to Playlist</button>
    </div>
  );
};

export default Playlist;
