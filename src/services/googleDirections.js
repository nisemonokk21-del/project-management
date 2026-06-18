const ORIGIN = '新桜台駅';
let scriptLoaded = false;

function loadScript() {
  if (scriptLoaded || window.google?.maps?.DirectionsService) {
    scriptLoaded = true;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/javascript?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`;
    script.async = true;
    script.onload = () => { scriptLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Google Maps の読み込みに失敗しました'));
    document.head.appendChild(script);
  });
}

export async function fetchDepartureTime(destination, dateStr, timeStr) {
  await loadScript();

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
          reject(new Error(`経路が見つかりませんでした (${status})`));
          return;
        }
        const depTs = result.routes[0].legs[0].departure_time.value;
        const dep = new Date(depTs * 1000);
        const hh = String(dep.getHours()).padStart(2, '0');
        const mm = String(dep.getMinutes()).padStart(2, '0');
        resolve(`${hh}:${mm}`);
      }
    );
  });
}
