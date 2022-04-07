const test = require('tape');
const fs = require('fs');
const path = require('path');
const generateFixture = require('ssb-fixtures');
const SecretStack = require('secret-stack');
const caps = require('ssb-caps');
const ssbKeys = require('ssb-keys');
const pull = require('pull-stream');
const {where, toPullStream} = require('ssb-db2/operators');

const dir = '/tmp/ssb-search2';
const oldLogPath = path.join(dir, 'flume', 'log.offset');
const newLogPath = path.join(dir, 'db2', 'log.bipf');

const SEED = 'tiny';
const MESSAGES = 10000;
const AUTHORS = 500;

test('generate fixture', (t) => {
  if (fs.existsSync(oldLogPath)) {
    t.end();
    return;
  }

  generateFixture({
    outputDir: dir,
    seed: SEED,
    messages: MESSAGES,
    authors: AUTHORS,
    slim: true,
  }).then(() => {
    t.true(fs.existsSync(oldLogPath), 'fixture was created');

    const keys = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'));
    const sbot = SecretStack({appKey: caps.shs})
      .use(require('ssb-db2'))
      .call(null, {keys, path: dir, db2: {automigrate: true}});

    pull(
      sbot.db2migrate.progress(),
      pull.filter((progress) => progress === 1),
      pull.take(1),
      pull.drain(() => {
        setTimeout(() => {
          t.true(fs.existsSync(newLogPath), 'ssb-db2 migration completed');

          sbot.db.onDrain('search', () => {
            sbot.close(true, t.end);
          });
        }, 1000);
      }),
    );
  });
});

test('exact chain-of-words', (t) => {
  const keys = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'));
  const sbot = SecretStack({appKey: caps.shs})
    .use(require('ssb-db2'))
    .use(require('../lib/index'))
    .call(null, {keys, path: dir});

  const containsWords = sbot.search2.operator;

  const INPUT = 'labore officia exercitation';

  pull(
    sbot.db.query(where(containsWords(INPUT)), toPullStream()),
    pull.filter((msg) => msg.value.content.text.toLowerCase().includes(INPUT)),
    pull.collect((err, msgs) => {
      t.error(err, 'no error');
      t.equals(msgs.length, 4, 'four posts');
      sbot.close(true, t.end);
    }),
  );
});

test('word prefix', (t) => {
  const keys = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'));
  const sbot = SecretStack({appKey: caps.shs})
    .use(require('ssb-db2'))
    .use(require('../lib/index'))
    .call(null, {keys, path: dir});

  const containsWords = sbot.search2.operator;

  pull(
    sbot.db.query(where(containsWords('labo')), toPullStream()),
    pull.take(1),
    pull.drain((msg) => {
      t.false(/\blabo\b/i.test(msg.value.content.text), 'labo is not found');
      const matches = [...msg.value.content.text.matchAll(/labo/gi)];
      t.true(msg.value.content.text.includes('labo'), 'labo prefix is found');
      t.equals(matches.length, 3, '3 matches');
      const matchPositions = matches.map((m) => m.index);
      t.deepEquals(matchPositions, [47, 55, 168], 'labo positions found');
      sbot.close(true, t.end);
    }),
  );
});
