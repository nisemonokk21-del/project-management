const ORIGIN = '新桜台駅';

// Maps JavaScript API のパスは `/maps/api/js`。
// `/maps/api/javascript` は404が返り、script の onerror（＝「読み込みに失敗しました」）になる。
const MAPS_BASE = 'https://maps.googleapis.com/maps/api/js';

// 読み込みは1回だけ。Promise を使い回して、連打しても二重に script を挿さないようにする。
let loadPromise = null;

function injectScript() {
  if (window.google?.maps) return Promise.resolve();

  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return Promise.reject(
      new Error('Google Maps の APIキーが未設定です（VITE_GOOGLE_MAPS_API_KEY）')
    );
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const params = new URLSearchParams({
      key,
      // loading=async を付けないとコンソールに警告が出る（推奨の読み込み方式）
      loading: 'async',
      libraries: 'routes',
      language: 'ja',
      region: 'JP',
    });
    script.src = `${MAPS_BASE}?${params}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Maps の読み込みに失敗しました'));
    document.head.appendChild(script);
  });
}

async function loadMaps() {
  if (!loadPromise) {
    // 失敗したら次回もう一度やり直せるように、reject 時はキャッシュを捨てる
    loadPromise = injectScript().catch((e) => {
      loadPromise = null;
      throw e;
    });
  }
  await loadPromise;

  // loading=async では google.maps が段階的に構築されるため、
  // DirectionsService を使う前に routes ライブラリの読み込みを待つ。
  if (!window.google?.maps?.DirectionsService && window.google?.maps?.importLibrary) {
    await window.google.maps.importLibrary('routes');
  }
  if (!window.google?.maps?.DirectionsService) {
    throw new Error('Google Maps の初期化に失敗しました');
  }
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
  await loadMaps();

  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const arrivalTime = new Date(year, month - 1, day, hour, minute);

  const service = new window.google.maps.DirectionsService();
  return new Promise((resolve, reject) => {
    service.route(
      {
        origin: ORIGIN,
        destination,
        travelMode: window.google.maps.TravelMode.TRANSIT,
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
