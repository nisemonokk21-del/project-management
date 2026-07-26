// カレンダー判定ロジックの単体テスト。`node --test` で実行。
// バラシ（kei.imagawa.a の「バラシ」カレンダー）を被りチェックから確実に
// 除外できているか、逆に本番の共有カレンダーを取りこぼしていないかを固定する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTeardownCalendar,
  isHolidayCalendar,
  conflictCalendars,
} from './calendar.js';

// --- isTeardownCalendar: 「バラシ」カレンダー判定 ---
test('isTeardownCalendar: 名前が「バラシ」なら true', () => {
  assert.equal(isTeardownCalendar({ id: 'abc@group.calendar.google.com', summary: 'バラシ' }), true);
  assert.equal(isTeardownCalendar({ id: 'abc@group.calendar.google.com', summary: 'バラシ撮影' }), true);
});

test('isTeardownCalendar: リネーム(summaryOverride)も見る', () => {
  assert.equal(
    isTeardownCalendar({ id: 'x@group.calendar.google.com', summary: 'raw', summaryOverride: 'バラシ' }),
    true
  );
});

test('isTeardownCalendar: kei.imagawa.a のメインカレンダー(バラシ以外)は対象外', () => {
  // アカウント全体ではなく「バラシ」という名前のカレンダーだけが対象
  assert.equal(
    isTeardownCalendar({ id: 'kei.imagawa.a@gmail.com', summary: 'kei.imagawa.a@gmail.com' }),
    false
  );
});

test('isTeardownCalendar: 関係ないカレンダーは false', () => {
  assert.equal(isTeardownCalendar({ id: 'primary', summary: '仮撮影' }), false);
  assert.equal(isTeardownCalendar({ id: 'primary', summary: '決定撮影' }), false);
});

// --- isHolidayCalendar ---
test('isHolidayCalendar: 日本の祝日カレンダーを拾う', () => {
  assert.equal(
    isHolidayCalendar({ id: 'ja.japanese#holiday@group.v.calendar.google.com', summary: '日本の祝日' }),
    true
  );
  assert.equal(isHolidayCalendar({ id: 'x@group.calendar.google.com', summary: '祝日' }), true);
});

test('isHolidayCalendar: 通常カレンダーは false', () => {
  assert.equal(isHolidayCalendar({ id: 'primary', summary: '仮撮影' }), false);
});

// --- conflictCalendars: バラシと祝日を除外し、他は残す ---
test('conflictCalendars: バラシと祝日は除外、本番の共有カレンダーは残す', () => {
  const cals = [
    { id: 'primary', summary: '自分' },
    { id: 'kei.imagawa.a@gmail.com', summary: 'kei.imagawa.a@gmail.com' }, // 本番の共有 → 残す
    { id: 'barashi@group.calendar.google.com', summary: 'バラシ' }, // バラシ → 除外
    { id: 'ja.japanese#holiday@group.v.calendar.google.com', summary: '日本の祝日' }, // 祝日 → 除外
  ];
  const names = conflictCalendars(cals).map((c) => c.summary);
  assert.deepEqual(names, ['自分', 'kei.imagawa.a@gmail.com']);
});
