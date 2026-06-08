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
  // dateStr: "2024-01-15", timeStr: "09:30" → Date in JST
  return new Date(`${dateStr}T${timeStr}:00+09:00`);
}
