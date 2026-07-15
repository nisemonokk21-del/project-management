// 返信生成ロジックの単体テスト。`npm test`（= node --test）で実行。
// 被り判定・返信文は過去に何度も壊れたので、仕様をここで固定して再発を防ぐ。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fixParsedYear,
  replyLabelFor,
  generateReply,
} from './scheduleReply.js';

// --- fixParsedYear: 候補日の年ずれ補正 ---
test('fixParsedYear: 過去の年は今日以降まで繰り上げる', () => {
  assert.equal(fixParsedYear('2025-07-16', '2026-07-15'), '2026-07-16');
  assert.equal(fixParsedYear('2024-07-16', '2026-07-15'), '2026-07-16'); // 2年ずれ
});

test('fixParsedYear: 今日以降の日付はそのまま', () => {
  assert.equal(fixParsedYear('2026-07-16', '2026-07-15'), '2026-07-16');
  assert.equal(fixParsedYear('2026-07-15', '2026-07-15'), '2026-07-15'); // 今日
  assert.equal(fixParsedYear('2027-03-01', '2026-07-15'), '2027-03-01'); // 未来
});

// --- replyLabelFor: 返信文の1日ぶんのラベル ---
const shoot = (summary, cal) => ({ summary, calName: cal });

test('replyLabelFor: OKはそのままOK', () => {
  assert.equal(replyLabelFor({ include: true, conflicts: [] }), 'OK');
});

test('replyLabelFor: 仮撮影/決定撮影が被ったら案件名を出す', () => {
  assert.equal(
    replyLabelFor({ include: false, conflicts: [shoot('A映画', '仮撮影')] }),
    'A映画'
  );
  assert.equal(
    replyLabelFor({ include: false, conflicts: [shoot('B案件', '決定撮影')] }),
    'B案件'
  );
});

test('replyLabelFor: 撮影が複数被ったら全部並べる（②）', () => {
  assert.equal(
    replyLabelFor({
      include: false,
      conflicts: [shoot('A映画', '仮撮影'), shoot('Bドラマ', '決定撮影')],
    }),
    'A映画、Bドラマ'
  );
});

test('replyLabelFor: 撮影以外だけが被ったらNGとだけ書く（③）', () => {
  assert.equal(
    replyLabelFor({ include: false, conflicts: [shoot('歯医者', 'プライベート')] }),
    'NG'
  );
});

test('replyLabelFor: 撮影と個人が両方被ったら撮影案件だけ出す（③）', () => {
  assert.equal(
    replyLabelFor({
      include: false,
      conflicts: [shoot('筋トレ', '筋トレ'), shoot('A映画', '仮撮影')],
    }),
    'A映画'
  );
});

test('replyLabelFor: 同じ案件名の重複は1つにまとめる', () => {
  assert.equal(
    replyLabelFor({
      include: false,
      conflicts: [shoot('A映画', '仮撮影'), shoot('A映画', '決定撮影')],
    }),
    'A映画'
  );
});

// --- generateReply: 連続日のまとめと全体の文面 ---
test('generateReply: 連続OKはまとめ、NG理由が違えば分ける', () => {
  const reply = generateReply([
    { date: '2026-07-16', include: true, conflicts: [] },
    { date: '2026-07-17', include: true, conflicts: [] },
    { date: '2026-07-18', include: false, conflicts: [shoot('A映画', '仮撮影')] },
    { date: '2026-07-19', include: false, conflicts: [shoot('歯医者', 'プライベート')] },
  ]);
  assert.match(reply, /7\/16,17 OK/);
  assert.match(reply, /7\/18 A映画/);
  assert.match(reply, /7\/19 NG/);
});

test('generateReply: 同ラベルでも日付が飛んでいれば別行にする', () => {
  const reply = generateReply([
    { date: '2026-07-16', include: true, conflicts: [] },
    { date: '2026-07-20', include: true, conflicts: [] },
  ]);
  assert.match(reply, /7\/16 OK/);
  assert.match(reply, /7\/20 OK/);
});
