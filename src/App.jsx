import "./App.css";
import { useEffect, useRef, useState } from "react";
import { PlayerProvider } from "./context/PlayerContext";
import Player from "./components/Player";
import Playlist from "./components/Playlist";
import SettingsPanel from "./components/SettingsPanel";
import { useAuth } from "./context/useAuth";
import { useSettings } from "./context/useSettings";

const CENTER_VIEW_LIBRARY = "library";
const CENTER_VIEW_SETTINGS = "settings";

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
  const { settings, updateSettings } = useSettings();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [activeCenterView, setActiveCenterView] = useState(CENTER_VIEW_LIBRARY);
  const userMenuRef = useRef(null);

  const isDarkMode = settings.ui.theme === "dark";

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!userMenuRef.current) {
        return;
      }
      if (!userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

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
        <div className="auth-menu" ref={userMenuRef}>
          <button
            type="button"
            className="auth-avatar-trigger"
            aria-label="Account menu"
            onClick={() => {
              setIsUserMenuOpen((previous) => !previous);
            }}
            aria-expanded={isUserMenuOpen}
          >
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="auth-avatar" />
            ) : (
              <span className="auth-avatar auth-avatar-fallback" aria-hidden="true">
                {(user.displayName || user.email || "U").charAt(0).toUpperCase()}
              </span>
            )}
          </button>

          {isUserMenuOpen && (
            <div className="auth-menu-dropdown">
              <div className="auth-menu-profile">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" className="auth-avatar auth-avatar-lg" />
                ) : (
                  <span
                    className="auth-avatar auth-avatar-fallback auth-avatar-lg"
                    aria-hidden="true"
                  >
                    {(user.displayName || user.email || "U").charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="auth-user-meta">
                  <p className="auth-user-name">{user.displayName || "Google User"}</p>
                  <p className="auth-user-email">{user.email || ""}</p>
                </div>
              </div>

              <button
                type="button"
                className="auth-menu-btn"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  setActiveCenterView(CENTER_VIEW_SETTINGS);
                }}
              >
                Settings
              </button>
              <button
                type="button"
                className="auth-menu-btn"
                onClick={() =>
                  updateSettings((previousSettings) => ({
                    ...previousSettings,
                    ui: {
                      ...previousSettings.ui,
                      theme: previousSettings.ui.theme === "dark" ? "light" : "dark",
                    },
                  }))
                }
              >
                {isDarkMode ? "Dark mode: On" : "Dark mode: Off"}
              </button>
              <button
                type="button"
                className="auth-menu-btn auth-menu-btn-danger"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  void signOut();
                }}
              >
                Sign out
              </button>

              {authError && <p className="helper-text auth-menu-status">{authError}</p>}
            </div>
          )}
        </div>

        <header className="hero">
          <p className="hero-kicker">Local Audio Control</p>
          <h1>My Music Player</h1>
          <p className="hero-subtitle">
            Queue tracks, manage playlists, and control playback from the bottom dock.
          </p>
        </header>

        <section
          className={`app-grid ${activeCenterView === CENTER_VIEW_SETTINGS ? "app-grid-settings" : ""}`}
          aria-label="Music Player Dashboard"
        >
          {activeCenterView === CENTER_VIEW_SETTINGS ? (
            <SettingsPanel
              user={user}
              onBackToLibrary={() => setActiveCenterView(CENTER_VIEW_LIBRARY)}
              onSignOut={signOut}
            />
          ) : (
            <Playlist />
          )}
        </section>
      </main>
      <Player />
    </PlayerProvider>
  );
}

export default App;
