import "./App.css";
import { PlayerProvider } from './context/PlayerContext';
import Player from './components/Player';
import Playlist from './components/Playlist';

function App() {
  return (
    <PlayerProvider>
      <main className="app-shell">
        <header className="hero">
          <p className="hero-kicker">Local Audio Control</p>
          <h1>My Music Player</h1>
          <p className="hero-subtitle">
            Queue tracks, manage playlists, and control playback from the bottom dock.
          </p>
        </header>

        <section className="app-grid" aria-label="Music Player Dashboard">
          <Playlist />
        </section>
      </main>
      <Player />
    </PlayerProvider>
  );
}

export default App;
