// 出発駅: 江古田エリア最寄り（自宅から徒歩5分）
export const ORIGIN_STATION = '新桜台';

// Yahoo!乗換案内（到着時刻＝集合時刻で検索）
// m1/m2 は「分」の十の位・一の位、type=4 は到着時刻指定
export function yahooTransitUrl(destination, dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-');
  const [hh, mm] = timeStr.split(':');
  const params = new URLSearchParams({
    from: ORIGIN_STATION,
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
export function googleMapsTransitUrl(destination) {
  const params = new URLSearchParams({
    api: '1',
    origin: `${ORIGIN_STATION}駅`,
    destination,
    travelmode: 'transit',
  });
  return `https://www.google.com/maps/dir/?${params}`;
}
