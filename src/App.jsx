import "./App.css";
import { PlayerProvider } from "./context/PlayerContext";
import Player from "./components/Player";
import Playlist from "./components/Playlist";
import { useAuth } from "./context/useAuth";

function App() {
  const {
    user,
    isLoading,
    authError,
    signInWithGoogle,
    signOut,
    isFirebaseConfigured,
    firebaseConfigMissingKeys,
  } = useAuth();

  if (isLoading) {
    return (
      <main className="app-shell">
        <section className="panel auth-panel">
          <h2>Checking session...</h2>
        </section>
      </main>
    );
  }

  if (!isFirebaseConfigured) {
    return (
      <main className="app-shell">
        <section className="panel auth-panel">
          <p className="panel-eyebrow">Authentication Setup</p>
          <h2 className="panel-title">Google Auth is not configured</h2>
          <p className="helper-text">
            Add these env variables and restart the dev server:
          </p>
          <code className="auth-missing-keys">
            {firebaseConfigMissingKeys.join(", ")}
          </code>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="app-shell">
        <header className="hero">
          <p className="hero-kicker">Music Player</p>
          <h1>Sign in to continue</h1>
          <p className="hero-subtitle">
            Google sign-in enables a personal session for your playlists and player settings.
          </p>
        </header>
        <section className="panel auth-panel">
          <button type="button" className="btn btn-primary" onClick={signInWithGoogle}>
            Continue with Google
          </button>
          {authError && <p className="helper-text">{authError}</p>}
        </section>
      </main>
    );
  }

  return (
    <PlayerProvider>
      <main className="app-shell">
        <header className="hero hero-row">
          <div>
            <p className="hero-kicker">Local Audio Control</p>
            <h1>My Music Player</h1>
            <p className="hero-subtitle">
              Queue tracks, manage playlists, and control playback from the bottom dock.
            </p>
          </div>
          <div className="auth-user-chip">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="auth-avatar" />
            ) : (
              <span className="auth-avatar auth-avatar-fallback" aria-hidden="true">
                {(user.displayName || user.email || "U").charAt(0).toUpperCase()}
              </span>
            )}
            <div className="auth-user-meta">
              <p className="auth-user-name">{user.displayName || "Google User"}</p>
              <p className="auth-user-email">{user.email || ""}</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>
              Sign out
            </button>
          </div>
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
