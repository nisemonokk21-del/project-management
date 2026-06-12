// 自宅から乗れる最寄り駅3つ
export const STATIONS = [
  { name: '新桜台', walkMin: 5, line: '西武有楽町線' },
  { name: '江古田', walkMin: 10, line: '西武池袋線' },
  { name: '新江古田', walkMin: 20, line: '都営大江戸線' },
];

export const DEFAULT_STATION = STATIONS[0].name;

// Yahoo!乗換案内（到着時刻＝集合時刻で検索）
// m1/m2 は「分」の十の位・一の位、type=4 は到着時刻指定
export function yahooTransitUrl(originStation, destination, dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-');
  const [hh, mm] = timeStr.split(':');
  const params = new URLSearchParams({
    from: originStation,
    to: destination,
    y,
    m,
    d,
    hh,
    m1: mm[0],
    m2: mm[1],
    type: '4',
  });
  return `https://transit.yahoo.co.jp/search/result?${params}`;
}

// Googleマップ（電車モード。到着時刻のURL指定は非対応のため経路のみ）
export function googleMapsTransitUrl(originStation, destination) {
  const params = new URLSearchParams({
    api: '1',
    origin: `${originStation}駅`,
    destination,
    travelmode: 'transit',
  });
  return `https://www.google.com/maps/dir/?${params}`;
}
