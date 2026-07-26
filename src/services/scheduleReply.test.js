// 返信生成ロジックの単体テスト。`npm test`（= node --test）で実行。
// 被り判定・返信文は過去に何度も壊れたので、仕様をここで固定して再発を防ぐ。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fixParsedYear,
  isShootConflict,
  isProvisionalShoot,
  initItemOk,
  dayStatus,
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

const conf = (summary, cal) => ({ summary, calName: cal });

// 便利関数: conflicts から初期 dateResult を作る
const mk = (date, conflicts, overrides = {}) => ({
  date,
  conflicts,
  itemOk: initItemOk(conflicts),
  dayNg: false,
  ...overrides,
});

// --- 被りの種別判定 ---
test('種別判定: 撮影案件（仮撮影/決定撮影）と仮案件', () => {
  assert.equal(isShootConflict(conf('A', '仮撮影')), true);
  assert.equal(isShootConflict(conf('B', '決定撮影')), true);
  assert.equal(isShootConflict(conf('歯医者', 'プライベート')), false);
  assert.equal(isProvisionalShoot(conf('A', '仮撮影')), true);
  assert.equal(isProvisionalShoot(conf('B', '決定撮影')), false);
});

test('initItemOk: 撮影案件は既定OK(true)、個人予定は既定NG(false)', () => {
  assert.deepEqual(
    initItemOk([conf('B', '決定撮影'), conf('歯医者', 'プライベート')]),
    [true, false]
  );
});

test('initItemOk: 仮案件がある日は他の予定も既定OK', () => {
  assert.deepEqual(
    initItemOk([conf('A', '仮撮影'), conf('歯医者', 'プライベート'), conf('会議', '仕事')]),
    [true, true, true]
  );
});

// --- dayStatus / replyLabelFor: 被りなし ---
test('被りなし: OK。dayNgを立てるとNG', () => {
  assert.equal(replyLabelFor(mk('2026-07-16', [])), 'OK');
  assert.equal(replyLabelFor(mk('2026-07-16', [], { dayNg: true })), 'NG');
});

// --- 撮影案件の被り: 既定OKで、案件名を返信に載せる ---
test('撮影案件のみ被り: 既定OKで案件名を載せる', () => {
  assert.equal(replyLabelFor(mk('2026-07-16', [conf('A映画', '仮撮影')])), 'A映画');
  assert.equal(replyLabelFor(mk('2026-07-16', [conf('Bドラマ', '決定撮影')])), 'Bドラマ');
  assert.equal(
    replyLabelFor(mk('2026-07-16', [conf('A映画', '仮撮影'), conf('Bドラマ', '決定撮影')])),
    'A映画、Bドラマ'
  );
});

test('撮影案件をNGに切り替えたらその日はNG', () => {
  const r = mk('2026-07-16', [conf('A映画', '仮撮影')]);
  r.itemOk = [false];
  assert.equal(dayStatus(r), 'ng');
  assert.equal(replyLabelFor(r), 'NG');
});

// --- 仮案件がある日は他の予定も既定OK ---
test('仮案件＋個人予定: 個人も既定OKになり、案件名を載せる', () => {
  const r = mk('2026-07-16', [conf('A映画', '仮撮影'), conf('歯医者', 'プライベート')]);
  assert.deepEqual(r.itemOk, [true, true]);
  assert.equal(dayStatus(r), 'other');
  assert.equal(replyLabelFor(r), 'A映画');
});

test('決定撮影＋個人予定: 個人は既定NGなのでその日はNG', () => {
  const r = mk('2026-07-16', [conf('Bドラマ', '決定撮影'), conf('歯医者', 'プライベート')]);
  assert.deepEqual(r.itemOk, [true, false]);
  assert.equal(replyLabelFor(r), 'NG');
});

test('撮影の被り: dayNgを立てればNG', () => {
  assert.equal(
    replyLabelFor(mk('2026-07-16', [conf('A映画', '仮撮影')], { dayNg: true })),
    'NG'
  );
});

// --- 個人予定の被り: 1件ずつOK/NG ---
test('個人予定の被り: 既定はNG（未判断はNG扱い）', () => {
  assert.equal(replyLabelFor(mk('2026-07-16', [conf('歯医者', 'プライベート')])), 'NG');
});

test('個人予定の被り: OKに切り替えるとOK', () => {
  const r = mk('2026-07-16', [conf('歯医者', 'プライベート')]);
  r.itemOk = [true];
  assert.equal(replyLabelFor(r), 'OK');
});

test('複数の個人被り: 1件でもNGならその日はNG', () => {
  const r = mk('2026-07-16', [conf('歯医者', 'プライベート'), conf('会議', '仕事')]);
  r.itemOk = [true, false]; // 会議がNG
  assert.equal(dayStatus(r), 'ng');
  assert.equal(replyLabelFor(r), 'NG');
});

test('複数の個人被り: 全部OKならOK', () => {
  const r = mk('2026-07-16', [conf('歯医者', 'プライベート'), conf('会議', '仕事')]);
  r.itemOk = [true, true];
  assert.equal(replyLabelFor(r), 'OK');
});

// --- 決定撮影＋個人予定が混在 ---
test('決定撮影＋個人: 個人が1件でもNGならNG', () => {
  const r = mk('2026-07-16', [conf('歯医者', 'プライベート'), conf('Bドラマ', '決定撮影')]);
  // 既定: 歯医者=false(NG), Bドラマ=true → その日はNG
  assert.equal(replyLabelFor(r), 'NG');
});

test('決定撮影＋個人: 個人を全部OKにすれば案件名を載せる', () => {
  const r = mk('2026-07-16', [conf('歯医者', 'プライベート'), conf('Bドラマ', '決定撮影')]);
  r.itemOk = [true, true];
  assert.equal(replyLabelFor(r), 'Bドラマ');
});

// --- generateReply: 連続日のまとめと全体の文面 ---
test('generateReply: 連続OKはまとめ、NG理由が違えば分ける', () => {
  const reply = generateReply([
    mk('2026-07-16', []),
    mk('2026-07-17', []),
    mk('2026-07-18', [conf('Bドラマ', '決定撮影')]),
    mk('2026-07-19', [conf('歯医者', 'プライベート')]), // 既定NG
  ]);
  assert.match(reply, /7\/16,17 OK/);
  assert.match(reply, /7\/18 Bドラマ/);
  assert.match(reply, /7\/19 NG/);
});

test('generateReply: 同ラベルでも日付が飛んでいれば別行にする', () => {
  const reply = generateReply([mk('2026-07-16', []), mk('2026-07-20', [])]);
  assert.match(reply, /7\/16 OK/);
  assert.match(reply, /7\/20 OK/);
});
