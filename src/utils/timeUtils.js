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

// JST基準で今日からn日後の日付を YYYY-MM-DD で返す
// （toISOString()はUTC基準のため深夜0〜9時に日付がずれる問題を回避）
export function jstDateString(daysFromToday = 0) {
  const jst = new Date(Date.now() + (9 * 60 + daysFromToday * 24 * 60) * 60 * 1000);
  return jst.toISOString().split('T')[0];
}

// 乗車時刻から起床・就寝時刻を逆算
// 起床 = 乗車40分前（支度＋駅まで徒歩5分込み）、就寝 = 起床の8時間前
export function buildSchedule(boardingTime) {
  const wakeUpTime = new Date(boardingTime.getTime() - 40 * 60 * 1000);
  const bedTime = new Date(wakeUpTime.getTime() - 8 * 60 * 60 * 1000);
  return { boardingTime, wakeUpTime, bedTime };
}
