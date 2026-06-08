// Fixed departure: 練馬区栄町16-3 (江古田エリア)
const HOME = '東京都練馬区栄町16-3';

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

async function getDirections(service, maps, destination, arrivalTime) {
  return new Promise((resolve, reject) => {
    service.route(
      {
        origin: HOME,
        destination,
        travelMode: maps.TravelMode.TRANSIT,
        transitOptions: {
          arrivalTime,
          modes: [maps.TransitMode.TRAIN, maps.TransitMode.SUBWAY],
          routingPreference: maps.TransitRoutePreference.FEWER_TRANSFERS,
        },
        region: 'JP',
      },
      (result, status) => {
        if (status === maps.DirectionsStatus.OK) {
          resolve(result);
        } else {
          reject(new Error(`経路検索エラー: ${status} — 目的地を正しく入力してください`));
        }
      }
    );
  });
}

export async function findTrainSchedule(destination, collectionTime) {
  const maps = await loadMapsAPI();
  const service = new maps.DirectionsService();

  // Train 0: the latest train that still arrives by collection time
  const r0 = await getDirections(service, maps, destination, collectionTime);
  const leg0 = r0.routes[0].legs[0];
  const dep0 = new Date(leg0.departure_time.value * 1000);

  // Train -1: one departure before
  const r1 = await getDirections(service, maps, destination, new Date(dep0.getTime() - 120_000));
  const leg1 = r1.routes[0].legs[0];
  const dep1 = new Date(leg1.departure_time.value * 1000);

  // Train -2: two departures before — the one we actually take
  const r2 = await getDirections(service, maps, destination, new Date(dep1.getTime() - 120_000));
  const leg2 = r2.routes[0].legs[0];
  const dep2 = new Date(leg2.departure_time.value * 1000);
  const arr2 = new Date(leg2.arrival_time.value * 1000);

  // 起床 = 乗車 - 40分, 就寝 = 起床 - 8時間
  const wakeUpTime = new Date(dep2.getTime() - 40 * 60 * 1000);
  const bedTime = new Date(wakeUpTime.getTime() - 8 * 60 * 60 * 1000);

  const steps = leg2.steps
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
    boardingTime: dep2,
    arrivalTime: arr2,
    wakeUpTime,
    bedTime,
    steps,
    duration: leg2.duration.text,
    startAddress: leg2.start_address,
    endAddress: leg2.end_address,
    // For reference: the on-time train departure
    onTimeDep: dep0,
  };
}
