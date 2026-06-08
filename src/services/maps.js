// Fixed departure: 江古田エリア最寄り駅（徒歩5分）
const HOME = '新桜台駅';

let mapsLoaded = false;
let mapsLoadPromise = null;

export function loadMapsAPI() {
  if (mapsLoaded) return Promise.resolve(window.google.maps);
  if (mapsLoadPromise) return mapsLoadPromise;

  mapsLoadPromise = new Promise((resolve, reject) => {
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!key) {
      reject(new Error('Google Maps APIキーが設定されていません'));
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&language=ja&region=JP`;
    script.async = true;
    script.onload = () => {
      mapsLoaded = true;
      resolve(window.google.maps);
    };
    script.onerror = () => reject(new Error('Google Maps APIの読み込みに失敗しました'));
    document.head.appendChild(script);
  });

  return mapsLoadPromise;
}

function searchRoute(service, maps, destination, departureTime) {
  return new Promise((resolve, reject) => {
    service.route(
      {
        origin: HOME,
        destination,
        travelMode: maps.TravelMode.TRANSIT,
        transitOptions: { departureTime },
        region: 'JP',
      },
      (result, status) => {
        if (status === maps.DirectionsStatus.OK) {
          resolve(result);
        } else {
          reject(new Error(`経路検索エラー: ${status}`));
        }
      }
    );
  });
}

export async function findTrainSchedule(destination, collectionTime) {
  const maps = await loadMapsAPI();
  const service = new maps.DirectionsService();

  // 集合時刻の2時間前を基点に、出発時刻で3本分検索する
  const base = new Date(collectionTime.getTime() - 2 * 60 * 60 * 1000);

  // Train 0: 基点から出発
  const r0 = await searchRoute(service, maps, destination, base);
  const leg0 = r0.routes[0].legs[0];
  const dep0 = new Date(leg0.departure_time.value * 1000);

  // Train 1: 1本後
  const r1 = await searchRoute(service, maps, destination, new Date(dep0.getTime() + 2 * 60 * 1000));
  const leg1 = r1.routes[0].legs[0];
  const dep1 = new Date(leg1.departure_time.value * 1000);

  // Train 2: さらに1本後
  const r2 = await searchRoute(service, maps, destination, new Date(dep1.getTime() + 2 * 60 * 1000));
  const leg2 = r2.routes[0].legs[0];
  const dep2 = new Date(leg2.departure_time.value * 1000);
  const arr2 = new Date(leg2.arrival_time.value * 1000);

  // 集合時刻に間に合う最後の電車を特定
  // arr2が集合時刻を超えたらleg1、さらに超えたらleg0を使う
  let usedLeg = leg2;
  let usedDep = dep2;
  let usedArr = arr2;

  if (arr2 > collectionTime) {
    usedLeg = leg1;
    usedDep = dep1;
    usedArr = new Date(leg1.arrival_time.value * 1000);
    if (usedArr > collectionTime) {
      usedLeg = leg0;
      usedDep = dep0;
      usedArr = new Date(leg0.arrival_time.value * 1000);
    }
  }

  // 実際に乗る電車（間に合う電車の2本前）
  const boardingTime = new Date(base.getTime()); // baseを乗車時刻として使用
  const wakeUpTime = new Date(boardingTime.getTime() - 40 * 60 * 1000);
  const bedTime = new Date(wakeUpTime.getTime() - 8 * 60 * 60 * 1000);

  const steps = usedLeg.steps
    .filter((s) => s.transit)
    .map((s) => ({
      line: s.transit.line.short_name || s.transit.line.name,
      headsign: s.transit.headsign,
      departure: new Date(s.transit.departure_time.value * 1000),
      arrival: new Date(s.transit.arrival_time.value * 1000),
      depStop: s.transit.departure_stop.name,
      arrStop: s.transit.arrival_stop.name,
      numStops: s.transit.num_stops,
      vehicle: s.transit.line.vehicle?.name || '電車',
    }));

  return {
    boardingTime: usedDep,
    arrivalTime: usedArr,
    wakeUpTime,
    bedTime,
    steps,
    duration: usedLeg.duration.text,
    startAddress: usedLeg.start_address,
    endAddress: usedLeg.end_address,
  };
}
