import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalize, guessMatches, clueProblem, pickImposter, pickWord, tally, scoreRound, totals, nextState, shuffleSeeded, headline,
} from '../../src/engine.js';
import { PACKS, DEFAULT_PACKS } from '../../src/words.js';

test('word packs are well formed and have no duplicates', () => {
  assert.ok(PACKS.length >= 12);
  const all = PACKS.flatMap((p) => p.words.map((w) => w.toLowerCase()));
  assert.equal(new Set(all).size, all.length, 'no word in two packs');
  for (const p of PACKS) {
    assert.match(p.id, /^[a-z]+$/);
    assert.ok(p.words.length >= 30, p.id);
  }
  for (const d of DEFAULT_PACKS) assert.ok(PACKS.find((p) => p.id === d), d);
});

test('normalize and guess matching', () => {
  assert.equal(normalize('  Pancakes! '), 'pancake');
  assert.equal(normalize('Crème brûlée'), 'creme brulee');
  assert.equal(normalize('glass'), 'glass');
  assert.ok(guessMatches('pancakes', 'pancake'));
  assert.ok(guessMatches('PANCAKE', 'pancake'));
  assert.ok(guessMatches('pancak', 'pancake'), 'one typo allowed on long words');
  assert.ok(guessMatches('icecream', 'ice cream'));
  assert.ok(!guessMatches('cat', 'car'), 'short words must be exact');
  assert.ok(!guessMatches('', 'pancake'));
  assert.ok(!guessMatches(null, 'pancake'));
  assert.ok(!guessMatches('waffle', 'pancake'));
});

test('clue rules block giving the word away', () => {
  assert.equal(clueProblem('fluffy', 'pancake'), null);
  assert.equal(clueProblem('maple syrup', 'pancake'), null);
  assert.match(clueProblem('', 'pancake'), /Write a clue/);
  assert.match(clueProblem('a b c d', 'pancake'), /three words/);
  assert.match(clueProblem('Pancakes', 'pancake'), /gives the word away/);
  assert.match(clueProblem('pancakeday', 'pancake'), /gives the word away/);
  assert.match(clueProblem('cream', 'ice cream'), /gives the word away/);
  assert.match(clueProblem('pancak', 'pancake'), /gives the word away/);
  assert.equal(clueProblem('cold', 'ice cream'), null);
});

test('imposter is never the same twice in a row when avoidable', () => {
  for (let i = 0; i < 50; i++) assert.notEqual(pickImposter([1, 2, 3], 2), 2);
  assert.equal(pickImposter([7], 7), 7);
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(pickImposter([1, 2, 3, 4], null));
  assert.equal(seen.size, 4, 'everyone can be picked');
});

test('words are not repeated until a pack runs out', () => {
  const packs = [{ id: 'a', name: 'A', words: ['x', 'y'] }, { id: 'b', name: 'B', words: ['z'] }];
  assert.equal(pickWord(packs, ['a'], ['x']).word, 'y');
  assert.equal(pickWord(packs, ['a'], ['x']).category, 'A');
  assert.ok(['x', 'y'].includes(pickWord(packs, ['a'], ['x', 'y']).word), 'falls back when all are used');
  assert.ok(['x', 'y', 'z'].includes(pickWord(packs, ['nope'], []).word), 'unknown packs fall back to all');
});

const round = (over = {}) => ({ no: 1, players: [1, 2, 3, 4], imposter_id: 4, word: 'pancake', guess: null, state: 'reveal', ...over });
const v = (voter_id, target_id) => ({ voter_id, target_id });

test('tally: caught only with a clear plurality', () => {
  assert.equal(tally([1, 2, 3, 4], [v(1, 4), v(2, 4), v(3, 1), v(4, 1)], 4).caught, false, 'tie at the top escapes');
  const t = tally([1, 2, 3, 4], [v(1, 4), v(2, 4), v(3, 4), v(4, 1)], 4);
  assert.equal(t.caught, true);
  assert.equal(t.againstImposter, 3);
  assert.equal(tally([1, 2, 3], [], 3).caught, false, 'no votes, no catch');
  assert.equal(tally([1, 2, 3], [v(9, 3)], 3).againstImposter, 0, 'votes from people outside the round are ignored');
});

test('scoring', () => {
  let s = scoreRound(round(), [v(1, 4), v(2, 4), v(3, 1), v(4, 1)]);
  assert.equal(s.outcome, 'escaped');
  assert.deepEqual([...s.points.entries()], [[1, 1], [2, 1], [3, 0], [4, 2]]);
  s = scoreRound(round({ guess: 'Pancakes' }), [v(1, 4), v(2, 4), v(3, 4), v(4, 1)]);
  assert.equal(s.outcome, 'caught-guessed');
  assert.equal(s.points.get(4), 2);
  assert.equal(s.points.get(3), 1);
  s = scoreRound(round({ guess: 'waffle' }), [v(1, 4), v(2, 4), v(3, 4), v(4, 1)]);
  assert.equal(s.outcome, 'caught');
  assert.equal(s.points.get(4), 0);
  s = scoreRound(round({ guess: 'pancake' }), [v(1, 2), v(2, 1), v(3, 2)]);
  assert.equal(s.outcome, 'escaped-guessed');
  assert.equal(s.points.get(4), 4);
});

test('totals add up revealed rounds only', () => {
  const rounds = [round({ no: 1 }), round({ no: 2, imposter_id: 1, state: 'vote' }), round({ no: 3, imposter_id: 1 })];
  const votes = new Map([[1, [v(1, 4), v(2, 4), v(3, 4)]], [2, [v(2, 1)]], [3, [v(2, 1), v(3, 1), v(4, 1)]]]);
  const t = totals(rounds, votes);
  assert.equal(t.get(1), 1); // round 1 vote for imposter; round 3 caught as imposter
  assert.equal(t.get(2), 2);
  assert.equal(t.get(4), 1);
});

test('phases move on when everyone has acted, or at the deadline', () => {
  const r = { players: [1, 2, 3], state: 'clue', deadline: 1000 };
  assert.equal(nextState(r, [1, 2, 3], [1, 2], [], 10), null);
  assert.equal(nextState(r, [1, 2, 3], [1, 2, 3], [], 10), 'vote');
  assert.equal(nextState(r, [1, 2], [1, 2], [], 10), 'vote', 'a player who left does not block');
  assert.equal(nextState(r, [1, 2, 3], [1, 2], [], 1000), 'vote', 'deadline with two clues');
  assert.equal(nextState(r, [1, 2, 3], [1], [], 5000), null, 'one clue is not enough to vote on');
  assert.equal(nextState({ ...r, deadline: null }, [1, 2, 3], [1, 2], [], 1e12), null, 'no limit waits forever');
  const rv = { players: [1, 2, 3], state: 'vote', deadline: 1000 };
  assert.equal(nextState(rv, [1, 2, 3], [], [1, 2], 10), null);
  assert.equal(nextState(rv, [1, 2, 3], [], [1, 2, 3], 10), 'reveal');
  assert.equal(nextState(rv, [1, 2, 3], [], [1], 1000), 'reveal');
  assert.equal(nextState({ ...rv, state: 'reveal' }, [1, 2, 3], [], [1, 2, 3], 10), null);
});

test('seeded shuffle is stable and a permutation', () => {
  const a = shuffleSeeded([1, 2, 3, 4, 5], 'g1:2');
  assert.deepEqual(a, shuffleSeeded([1, 2, 3, 4, 5], 'g1:2'));
  assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5]);
});

test('headlines', () => {
  assert.match(headline('caught', 'Maya', 'pancake'), /Maya was the imposter, and got caught/);
  assert.match(headline('caught-guessed', 'Maya', 'pancake'), /guessed “pancake”/);
  assert.match(headline('escaped', 'Maya', 'pancake'), /got away/);
});

test('guesses for words that end in s', () => {
  assert.equal(guessMatches('Gymnastics', 'gymnastics'), true);
  assert.equal(guessMatches('gymnastic', 'gymnastics'), true);
  assert.equal(guessMatches('GYMNASTICSs', 'gymnastics'), false); // two letters off: not the word
  assert.equal(guessMatches('glasses', 'glasses'), true);
});
