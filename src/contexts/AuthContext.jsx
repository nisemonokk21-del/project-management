import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../services/firebase';
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
} from 'firebase/auth';

const AuthContext = createContext(null);

// Mobile browsers (notably iOS Safari) frequently fail to complete
// signInWithPopup — the popup gets treated as a top-level navigation and
// Firebase can't match the returned auth result, surfacing as
// "auth/popup-closed-by-user" or "The requested action is invalid." on the
// /__/auth/handler page. Redirect-based sign-in avoids that failure mode.
const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const createGoogleProvider = () => {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/calendar');
  return provider;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [googleToken, setGoogleToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (!result) return;
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) setGoogleToken(credential.accessToken);
      })
      .catch((err) => {
        console.error('リダイレクトログインの結果取得に失敗しました', err);
      });

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async () => {
    const provider = createGoogleProvider();
    if (isMobileDevice()) {
      await signInWithRedirect(auth, provider);
      return;
    }
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) setGoogleToken(credential.accessToken);
  };

  const logout = async () => {
    await signOut(auth);
    setGoogleToken(null);
  };

  const reauth = async () => {
    const provider = createGoogleProvider();
    if (isMobileDevice()) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || null;
    if (token) setGoogleToken(token);
    return token;
  };

  return (
    <AuthContext.Provider value={{ user, googleToken, login, logout, reauth, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
