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

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

// ログイン用のプロバイダ。必ずGoogleのアカウント選択画面を出す。
// prompt を指定しないと、ブラウザにGoogleのセッションが1つしか無い場合
// （ホーム画面ショートカットのように単独のブラウザ扱いになる環境では特に）
// 選択画面がスキップされ、そのアカウントで自動的にログインしてしまう。
// そのため「ログアウト→ログイン」しても毎回同じアカウントに戻ってしまい、
// 別アカウントに切り替えられなかった。
function selectAccountProvider() {
  const provider = new GoogleAuthProvider();
  provider.addScope(CALENDAR_SCOPE);
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

// カレンダー用トークンを取り直すだけのプロバイダ。
// 今ログイン中のアカウントを login_hint で指定して、
// 毎回アカウントを選び直さずに済むようにする（別アカウントに化けるのも防げる）。
// ログイン中のアカウントが分からない場合だけ選択画面を出す。
function reauthProvider(email) {
  const provider = new GoogleAuthProvider();
  provider.addScope(CALENDAR_SCOPE);
  provider.setCustomParameters(email ? { login_hint: email } : { prompt: 'select_account' });
  return provider;
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
    const result = await signInWithPopup(auth, selectAccountProvider());
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) setGoogleToken(credential.accessToken);
  };

  const logout = async () => {
    await signOut(auth);
    setGoogleToken(null);
  };

  // 別のアカウントに切り替える。
  // 先に前のアカウントのトークンを捨ててから、アカウント選択画面付きでログインし直す。
  // （ログアウトしてログインし直す手間なく切り替えられるようにするためのもの）
  const switchAccount = async () => {
    await signOut(auth);
    setGoogleToken(null);
    const result = await signInWithPopup(auth, selectAccountProvider());
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) setGoogleToken(credential.accessToken);
  };

  const reauth = async () => {
    const provider = reauthProvider(auth.currentUser?.email);
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || null;
    if (token) setGoogleToken(token);
    return token;
  };

  return (
    <AuthContext.Provider
      value={{ user, googleToken, login, logout, switchAccount, reauth, loading }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
