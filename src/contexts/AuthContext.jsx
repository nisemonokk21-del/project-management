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

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function makeProvider() {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/calendar');
  return provider;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [googleToken, setGoogleToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // リダイレクトログイン後のトークン取得
    getRedirectResult(auth).then((result) => {
      if (result) {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) setGoogleToken(credential.accessToken);
      }
    }).catch(() => {});

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async () => {
    const provider = makeProvider();
    if (isMobile) {
      await signInWithRedirect(auth, provider);
    } else {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) setGoogleToken(credential.accessToken);
    }
  };

  const logout = async () => {
    await signOut(auth);
    setGoogleToken(null);
  };

  const reauth = async () => {
    const provider = makeProvider();
    if (isMobile) {
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
