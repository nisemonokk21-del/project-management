const ORIGIN = '新桜台駅';

// Maps JavaScript API のパスは `/maps/api/js`。
// `/maps/api/javascript` は404が返り、script の onerror になる。
const MAPS_BASE = 'https://maps.googleapis.com/maps/api/js';

// callback が来ないまま固まるのを防ぐ（電波が悪い / ブロックされている場合）
const LOAD_TIMEOUT_MS = 20000;

// 読み込みは1回だけ。Promise を使い回して、連打しても二重に script を挿さないようにする。
let loadPromise = null;

function bootstrap() {
  // 既にブートストラップ済みなら何もしない
  if (window.google?.maps?.importLibrary || window.google?.maps?.DirectionsService) {
    return Promise.resolve();
  }

  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return Promise.reject(
      new Error('Google Maps の APIキーが未設定です（VITE_GOOGLE_MAPS_API_KEY）')
    );
  }

  return new Promise((resolve, reject) => {
    const cbName = '__initGoogleMaps';
    let timer = null;
    const done = (fn, arg) => {
      if (timer) clearTimeout(timer);
      delete window[cbName];
      fn(arg);
    };

    // ここが要点。/maps/api/js が返すのは13KB程度の小さなローダーで、
    // 本体（main.js / routes.js）はその後さらに非同期で読み込まれる。
    // そのため script.onload の時点では DirectionsService も importLibrary
    // もまだ存在せず、onload で解決すると「初期化に失敗」になる。
    // callback が呼ばれた時点が「API 準備完了」なので、そちらで解決する。
    window[cbName] = () => done(resolve);

    const params = new URLSearchParams({
      key,
      // 推奨の読み込み方式。付けないとコンソールに警告が出る
      loading: 'async',
      callback: cbName,
      // DirectionsService は routes に入っている。先に読ませておくと
      // callback 時点で google.maps 直下から使える。
      libraries: 'routes',
      language: 'ja',
      region: 'JP',
    });

    const script = document.createElement('script');
    script.src = `${MAPS_BASE}?${params}`;
    script.async = true;
    script.onerror = () =>
      done(reject, new Error('Google Maps の読み込みに失敗しました'));
    timer = setTimeout(
      () => done(reject, new Error('Google Maps の読み込みがタイムアウトしました')),
      LOAD_TIMEOUT_MS
    );
    document.head.appendChild(script);
  });
}

// DirectionsService を取り出す。
// loading=async ではクラスが google.maps 直下に生えるとは限らないため、
// importLibrary の「戻り値」から受け取るのが正しい。グローバルは後方互換の保険。
async function getDirectionsService() {
  if (!loadPromise) {
    // 失敗したら次回やり直せるように、reject 時はキャッシュを捨てる
    loadPromise = bootstrap().catch((e) => {
      loadPromise = null;
      throw e;
    });
  }
  await loadPromise;

  if (window.google?.maps?.importLibrary) {
    const routes = await window.google.maps.importLibrary('routes');
    if (routes?.DirectionsService) return new routes.DirectionsService();
  }
  if (window.google?.maps?.DirectionsService) {
    return new window.google.maps.DirectionsService();
  }
  throw new Error('Google Maps の初期化に失敗しました');
}

// status ごとに原因が分かるメッセージを返す（キー制限やAPI未有効化に気付けるように）
function messageForStatus(status) {
  switch (status) {
    case 'ZERO_RESULTS':
      return '経路が見つかりませんでした。場所の書き方を変えてみてください';
    case 'NOT_FOUND':
      return '場所が特定できませんでした。駅名や住所で入力してください';
    case 'REQUEST_DENIED':
      return 'Google に拒否されました。APIキーの制限か Directions API の有効化を確認してください';
    case 'OVER_QUERY_LIMIT':
      return 'Google の利用上限に達しました。しばらく待って再試行してください';
    default:
      return `経路が見つかりませんでした (${status})`;
  }
}

export async function fetchDepartureTime(destination, dateStr, timeStr) {
  const service = await getDirectionsService();

  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const arrivalTime = new Date(year, month - 1, day, hour, minute);

  return new Promise((resolve, reject) => {
    service.route(
      {
        origin: ORIGIN,
        destination,
        // google.maps.TravelMode が未定義でも動くよう文字列で指定する
        travelMode: 'TRANSIT',
        transitOptions: { arrivalTime },
      },
      (result, status) => {
        if (status !== 'OK') {
          reject(new Error(messageForStatus(status)));
          return;
        }
        const leg = result.routes?.[0]?.legs?.[0];
        const depTs = leg?.departure_time?.value;
        if (!depTs) {
          reject(new Error('出発時刻を取得できませんでした（電車の経路が見つかりません）'));
          return;
        }
        // JS API の departure_time.value は Date オブジェクト。
        // （Webサービス版のJSONだと秒数なので、念のため両方に対応する）
        const dep = depTs instanceof Date ? depTs : new Date(depTs * 1000);
        resolve(
          dep.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Asia/Tokyo',
          })
        );
      }
    );
  });
}
