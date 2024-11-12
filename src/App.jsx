import React from 'react';
import { PlayerProvider } from './context/PlayerContext';
import Player from './components/Player';
import Playlist from './components/Playlist';
import SleepTimer from './components/SleepTimer';

function App() {
  return (
    <PlayerProvider>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h1>My Music Player</h1>
        <Player />
        <Playlist />
        <SleepTimer />
      </div>
    </PlayerProvider>
  );
}

export default App;
