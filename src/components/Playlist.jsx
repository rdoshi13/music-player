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

  const handleFileUpload = (event) => {
    const files = event.target.files;
    Array.from(files).forEach((file) => {
      const fileURL = URL.createObjectURL(file);
      addToPlaylist({ title: file.name, url: fileURL });
    });
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

      <div>
        <input
          type="file"
          accept="audio/*"
          multiple
          onChange={handleFileUpload}
        />
        <p>Select audio files to add them to the playlist.</p>
      </div>
    </div>
  );
};

export default Playlist;
