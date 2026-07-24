import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../services/firebase';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
} from 'firebase/auth';

const AuthContext = createContext(null);

// Googleカレンダー用アクセストークンの保存キーと有効期限。
// Firebaseのログイン自体はブラウザに永続化されるが、カレンダーAPIを叩く
// アクセストークンは signInWithPopup の結果にしか含まれず、メモリに置くと
// ページを開き直すたびに消えて「ログイン済みなのに再ログインを促される」
// 状態になっていた。そこでトークンをブラウザに保存して復元する。
// アクセストークンは約1時間で失効するため、少し早め（55分）で失効扱いにする。
const TOKEN_KEY = 'googleCalendarToken';
const TOKEN_TTL_MS = 55 * 60 * 1000;

function loadStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const { token, exp } = JSON.parse(raw);
    if (token && exp && Date.now() < exp) return token;
    localStorage.removeItem(TOKEN_KEY); // 失効済みは掃除
  } catch {
    // localStorage が使えない/壊れている場合は無視
  }
  return null;
}

function saveStoredToken(token) {
  try {
    localStorage.setItem(
      TOKEN_KEY,
      JSON.stringify({ token, exp: Date.now() + TOKEN_TTL_MS })
    );
  } catch {
    // 保存できなくても致命的ではない
  }
}

function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // 保存済みトークンがあれば初期値として復元する（開き直しても再ログイン不要にする）
  const [googleToken, setGoogleTokenState] = useState(() => loadStoredToken());
  const [loading, setLoading] = useState(true);

  // トークンの更新は必ずブラウザ保存とセットで行う
  const setGoogleToken = (token) => {
    setGoogleTokenState(token);
    if (token) saveStoredToken(token);
    else clearStoredToken();
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/calendar');
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) setGoogleToken(credential.accessToken);
  };

  const logout = async () => {
    await signOut(auth);
    setGoogleToken(null);
  };

  const reauth = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/calendar');
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
