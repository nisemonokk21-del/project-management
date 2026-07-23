// 返信生成ロジックの単体テスト。`npm test`（= node --test）で実行。
// 被り判定・返信文は過去に何度も壊れたので、仕様をここで固定して再発を防ぐ。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fixParsedYear,
  autoStatus,
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

const shoot = (summary, cal) => ({ summary, calName: cal });

// --- autoStatus: 被り状況からの初期ステータス自動判定 ---
test('autoStatus: 被りなしは ok', () => {
  assert.equal(autoStatus([]), 'ok');
  assert.equal(autoStatus(undefined), 'ok');
});

test('autoStatus: 撮影案件が被れば other（他案件）', () => {
  assert.equal(autoStatus([shoot('A映画', '仮撮影')]), 'other');
  assert.equal(autoStatus([shoot('B案件', '決定撮影')]), 'other');
  // 撮影＋個人が混在しても撮影がある限り other
  assert.equal(
    autoStatus([shoot('歯医者', 'プライベート'), shoot('A映画', '仮撮影')]),
    'other'
  );
});

test('autoStatus: 個人の予定だけ被れば ng', () => {
  assert.equal(autoStatus([shoot('歯医者', 'プライベート')]), 'ng');
});

// --- replyLabelFor: 返信文の1日ぶんのラベル（3ステータス制）---
test('replyLabelFor: ok は OK', () => {
  assert.equal(replyLabelFor({ status: 'ok', conflicts: [] }), 'OK');
  // 個人の予定が被っていても被りOK扱いなら OK（名前は出さない）
  assert.equal(
    replyLabelFor({ status: 'ok', conflicts: [shoot('歯医者', 'プライベート')] }),
    'OK'
  );
});

test('replyLabelFor: ng は NG', () => {
  assert.equal(
    replyLabelFor({ status: 'ng', conflicts: [shoot('歯医者', 'プライベート')] }),
    'NG'
  );
});

test('replyLabelFor: other は撮影案件名を出す', () => {
  assert.equal(
    replyLabelFor({ status: 'other', conflicts: [shoot('A映画', '仮撮影')] }),
    'A映画'
  );
  assert.equal(
    replyLabelFor({ status: 'other', conflicts: [shoot('B案件', '決定撮影')] }),
    'B案件'
  );
});

test('replyLabelFor: other で撮影が複数被ったら全部並べる', () => {
  assert.equal(
    replyLabelFor({
      status: 'other',
      conflicts: [shoot('A映画', '仮撮影'), shoot('Bドラマ', '決定撮影')],
    }),
    'A映画、Bドラマ'
  );
});

test('replyLabelFor: other で撮影と個人が両方被ったら撮影案件だけ出す', () => {
  assert.equal(
    replyLabelFor({
      status: 'other',
      conflicts: [shoot('筋トレ', '筋トレ'), shoot('A映画', '仮撮影')],
    }),
    'A映画'
  );
});

test('replyLabelFor: other で同じ案件名の重複は1つにまとめる', () => {
  assert.equal(
    replyLabelFor({
      status: 'other',
      conflicts: [shoot('A映画', '仮撮影'), shoot('A映画', '決定撮影')],
    }),
    'A映画'
  );
});

test('replyLabelFor: other で撮影案件名がなければ被り予定名で代替', () => {
  assert.equal(
    replyLabelFor({ status: 'other', conflicts: [shoot('会議', '仕事')] }),
    '会議'
  );
});

// --- generateReply: 連続日のまとめと全体の文面 ---
test('generateReply: 連続OKはまとめ、NG理由が違えば分ける', () => {
  const reply = generateReply([
    { date: '2026-07-16', status: 'ok', conflicts: [] },
    { date: '2026-07-17', status: 'ok', conflicts: [] },
    { date: '2026-07-18', status: 'other', conflicts: [shoot('A映画', '仮撮影')] },
    { date: '2026-07-19', status: 'ng', conflicts: [shoot('歯医者', 'プライベート')] },
  ]);
  assert.match(reply, /7\/16,17 OK/);
  assert.match(reply, /7\/18 A映画/);
  assert.match(reply, /7\/19 NG/);
});

test('generateReply: 同ラベルでも日付が飛んでいれば別行にする', () => {
  const reply = generateReply([
    { date: '2026-07-16', status: 'ok', conflicts: [] },
    { date: '2026-07-20', status: 'ok', conflicts: [] },
  ]);
  assert.match(reply, /7\/16 OK/);
  assert.match(reply, /7\/20 OK/);
});
