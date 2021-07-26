import {AAOLRecord, CB} from './types';
import stopWords from './stop-words';
const Plugin = require('ssb-db2/indexes/plugin');
const {seqs} = require('ssb-db2/operators');
const bipf = require('bipf');
const pull = require('pull-stream');
const pl = require('pull-level');
const Ref = require('ssb-ref');
import {getUnicodeWordRegex} from './unicode-word-regex';

const B_0 = Buffer.alloc(0);
const B_VALUE = Buffer.from('value');
const B_CONTENT = Buffer.from('content');
const B_TEXT = Buffer.from('text');

const oneAsciiRegex = /^[a-zA-Z]{1}$/; // 1-char ascii
const twoLowerCaseAsciiRegex = /^[a-z]{2}$/; // lowercase 2-char ascii
const unicodeWordRegex = getUnicodeWordRegex();
const msgIdRegex = new RegExp(Ref.msgIdRegex.source.slice(1, -1), 'g');
const blobIdRegex = new RegExp(Ref.blobIdRegex.source.slice(1, -1), 'g');
const feedIdRegex = new RegExp(Ref.feedIdRegex.source.slice(1, -1), 'g');
const localhostUrlRegex =
  /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:[/?#][^\s"]*)?/g;
const urlRegex =
  /https?:\/\/(?:[a-zA-Z]*[-.]*[a-zA-Z0-9]*\.)?([a-zA-Z0-9]+)\.[a-zA-Z]{2,}(?:[/?#][^\s"]*)?/g;

function findValueContentText(buf: Buffer): string | undefined {
  let p = 0;
  p = bipf.seekKey(buf, p, B_VALUE);
  if (p < 0) return;
  p = bipf.seekKey(buf, p, B_CONTENT);
  if (p < 0) return;
  p = bipf.seekKey(buf, p, B_TEXT);
  if (p < 0) return;
  const text = bipf.decode(buf, p);
  if (typeof text !== 'string') return;
  if (!text) return;
  return text;
}

class WordsIndex extends Plugin {
  constructor(log: any, dir: any) {
    super(log, dir, 'search2', 1, 'json', 'binary');
  }

  processRecord(record: AAOLRecord, seq: number) {
    let text = findValueContentText(record.value);
    if (!text) return;
    text = text.replace(feedIdRegex, '');
    text = text.replace(msgIdRegex, '');
    text = text.replace(blobIdRegex, '');
    text = text.replace(localhostUrlRegex, '');
    text = text.replace(urlRegex, '$1'); // keep the domain, e.g. `github`

    const uniqueLowercaseWords = new Set<string>();
    for (const [word] of text.matchAll(unicodeWordRegex)) {
      if (oneAsciiRegex.test(word)) continue;
      if (twoLowerCaseAsciiRegex.test(word)) continue;
      if (stopWords['en'].includes(word.toLocaleLowerCase())) continue;
      uniqueLowercaseWords.add(word.toLocaleLowerCase());
    }

    for (const word of uniqueLowercaseWords) {
      this.batch.push({
        type: 'put',
        key: [word, seq],
        value: B_0,
      });
    }
    uniqueLowercaseWords.clear();
  }

  query(text: string, cb: CB<any>) {
    const terms = [...text.toLocaleLowerCase().matchAll(unicodeWordRegex)].map(
      (result) => result[0],
    );

    let drainers: Array<{abort: CallableFunction}>;

    // TODO: use this `abort` function when
    // https://github.com/ssb-ngi-pointer/jitdb/issues/163 is fixed
    const abort = () => {
      while (drainers && drainers.length) drainers.shift()?.abort();
    };

    const HIT_ALL = 2 ** terms.length - 1; // bit mask of all "hit" terms
    const hitsFor = new Map<number, number>();
    const seqArr = [] as Array<number>;
    let ended = 0;

    drainers = terms.map((term, i) => {
      let drainer;
      pull(
        pl.read(this.level, {
          gte: [term, ''],
          lte: [term + '~', undefined],
          keys: true,
          keyEncoding: this.keyEncoding,
          values: false,
        }),
        (drainer = pull.drain(
          ([_word, seq]: [string, number]) => {
            if (hitsFor.get(seq)! === HIT_ALL) return;

            const hits = hitsFor.get(seq)! | (1 << i);
            hitsFor.set(seq, hits);
            if (hits === HIT_ALL) {
              seqArr.push(seq);
            }
          },
          () => {
            if (++ended === terms.length) {
              cb(null, seqs(seqArr));
            }
          },
        )),
      );
      return drainer;
    });
  }
}

export = WordsIndex;
