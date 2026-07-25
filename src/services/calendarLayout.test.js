// 月表示カレンダーの連日バー配置ロジックの単体テスト。`npm test` で実行。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prevDay, expandDays, weekSegments, laneCount } from './calendarLayout.js';

// 2026-07-05(日) 〜 2026-07-11(土) の週
const WEEK = [
  '2026-07-05',
  '2026-07-06',
  '2026-07-07',
  '2026-07-08',
  '2026-07-09',
  '2026-07-10',
  '2026-07-11',
];

const ev = (title, startDay, endDay = startDay) => ({ title, startDay, endDay });

test('prevDay: 前日を返す（月跨ぎ・年跨ぎも正しい）', () => {
  assert.equal(prevDay('2026-07-10'), '2026-07-09');
  assert.equal(prevDay('2026-07-01'), '2026-06-30');
  assert.equal(prevDay('2026-01-01'), '2025-12-31');
});

test('expandDays: 両端を含めて列挙する', () => {
  assert.deepEqual(expandDays('2026-07-05', '2026-07-07'), [
    '2026-07-05',
    '2026-07-06',
    '2026-07-07',
  ]);
  assert.deepEqual(expandDays('2026-07-05', '2026-07-05'), ['2026-07-05']);
  // 月跨ぎ
  assert.deepEqual(expandDays('2026-07-31', '2026-08-01'), ['2026-07-31', '2026-08-01']);
});

test('単日の予定は span=1', () => {
  const segs = weekSegments(WEEK, [ev('単発', '2026-07-07')]);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].col, 2);
  assert.equal(segs[0].span, 1);
  assert.equal(segs[0].continuesLeft, false);
  assert.equal(segs[0].continuesRight, false);
});

test('連日の予定は1本のバーに繋がる（span>1）', () => {
  const segs = weekSegments(WEEK, [ev('連日撮影', '2026-07-07', '2026-07-09')]);
  assert.equal(segs.length, 1, '3日間でもバーは1本');
  assert.equal(segs[0].col, 2);
  assert.equal(segs[0].span, 3);
});

test('週をまたぐ予定はその週の範囲で切られ、continues フラグが立つ', () => {
  // 前の週(7/3)から次の週(7/14)まで続く予定
  const segs = weekSegments(WEEK, [ev('長期', '2026-07-03', '2026-07-14')]);
  assert.equal(segs[0].col, 0);
  assert.equal(segs[0].span, 7);
  assert.equal(segs[0].continuesLeft, true);
  assert.equal(segs[0].continuesRight, true);
});

test('この週にかからない予定は除外される', () => {
  const segs = weekSegments(WEEK, [ev('来週', '2026-07-20', '2026-07-21')]);
  assert.equal(segs.length, 0);
});

test('重なる予定は別の段（lane）に積まれる', () => {
  const segs = weekSegments(WEEK, [
    ev('A', '2026-07-06', '2026-07-08'),
    ev('B', '2026-07-07', '2026-07-09'),
  ]);
  const a = segs.find((s) => s.ev.title === 'A');
  const b = segs.find((s) => s.ev.title === 'B');
  assert.notEqual(a.lane, b.lane, '重なっているので同じ段には置かない');
  assert.equal(laneCount(segs), 2);
});

test('重ならない予定は同じ段に詰められる', () => {
  const segs = weekSegments(WEEK, [
    ev('前半', '2026-07-05', '2026-07-06'),
    ev('後半', '2026-07-09', '2026-07-10'),
  ]);
  assert.equal(segs[0].lane, 0);
  assert.equal(segs[1].lane, 0);
  assert.equal(laneCount(segs), 1);
});

test('連日の予定が単日より上の段に来る', () => {
  const segs = weekSegments(WEEK, [
    ev('単日', '2026-07-07'),
    ev('連日', '2026-07-06', '2026-07-09'),
  ]);
  const long = segs.find((s) => s.ev.title === '連日');
  const short = segs.find((s) => s.ev.title === '単日');
  assert.equal(long.lane, 0);
  assert.ok(short.lane > long.lane);
});

test('月初の空白セル(null)があっても正しく配置される', () => {
  // 水曜(1日)始まりの週: 前3日は前月ぶんで null
  const week = [null, null, null, '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04'];
  const segs = weekSegments(week, [ev('月初連日', '2026-07-01', '2026-07-03')]);
  assert.equal(segs[0].col, 3);
  assert.equal(segs[0].span, 3);
  assert.equal(segs[0].continuesLeft, false);
});
