Vercel app - [Link](https://music-player-one-sepia.vercel.app/)

Current behavior:

- Local tracks can display embedded artwork thumbnails from file metadata.
- If artwork is missing, the UI shows a music-note fallback icon.
- `Recent Songs` is a dynamic playlist that auto-updates from playback history
  (last 25 unique tracks).
- Google auth is enabled through Firebase Authentication.

To do:

- Add queue.
- Add settings
- Add accounts - mostly google auth
- Add equalizer in settings
- Add crossplay in settings
- Add more hotkeys in settings

Google Auth setup (Firebase):

1. Create a Firebase project.
2. Enable `Authentication -> Sign-in method -> Google`.
3. In Firebase Auth settings, add authorized domains:
   - `localhost` (for local dev)
   - your deployed domain (for production)
4. Create `.env.local` in the project root using `.env.example`.
5. Fill:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`

To build and run this app locally:

1. Clone this repository
2. cd to music-player directory
3. npm install
4. npm run dev
