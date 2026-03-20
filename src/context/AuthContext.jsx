import { useEffect, useMemo, useState } from "react";
import {
  firebaseConfigMissingKeys,
  isFirebaseConfigured,
  signInWithGooglePopup,
  signOutCurrentUser,
  subscribeToAuthState,
} from "../lib/firebaseAuth";
import { AuthContext } from "./AppAuthContext";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsLoading(false);
      return undefined;
    }

    const unsubscribe = subscribeToAuthState((nextUser) => {
      setUser(nextUser || null);
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    if (!isFirebaseConfigured) {
      setAuthError("Google auth is not configured in environment variables.");
      return false;
    }

    try {
      setAuthError("");
      await signInWithGooglePopup();
      return true;
    } catch (error) {
      if (error?.code === "auth/popup-closed-by-user") {
        setAuthError("Google sign-in was cancelled.");
      } else if (error?.code === "auth/popup-blocked") {
        setAuthError("Popup blocked by browser. Allow popups and try again.");
      } else {
        setAuthError("Could not sign in with Google. Please try again.");
      }
      return false;
    }
  };

  const signOut = async () => {
    if (!isFirebaseConfigured) {
      setUser(null);
      return;
    }

    try {
      await signOutCurrentUser();
      setAuthError("");
    } catch {
      setAuthError("Could not sign out. Please try again.");
    }
  };

  const contextValue = useMemo(
    () => ({
      user,
      isLoading,
      authError,
      signInWithGoogle,
      signOut,
      isFirebaseConfigured,
      firebaseConfigMissingKeys,
    }),
    [authError, isLoading, user]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};
