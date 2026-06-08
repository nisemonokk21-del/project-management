export function formatTime(date) {
  return date.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  });
}

export function formatDate(date) {
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: 'Asia/Tokyo',
  });
}

export function formatDateTime(date) {
  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  });
}

export function combineDateAndTime(dateStr, timeStr) {
  // Safari-safe: タイムゾーン文字列を使わず手動でUTC変換
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  // JST = UTC+9 なので UTC時刻 = 入力時刻 - 9時間
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0));
}
