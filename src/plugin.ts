import {AAOLRecord, AddListener, CB} from './types';
import stopWords from './stop-words';
const Plugin = require('ssb-db2/indexes/plugin');
const {seqs} = require('ssb-db2/operators');
const bipf = require('bipf');
const pull = require('pull-stream');
const pl = require('pull-level');
const Ref = require('ssb-ref');
const getUnicodeWordRegex = require('unicode-word-regex');

const B_0 = Buffer.alloc(0);
const BIPF_CONTENT = bipf.allocAndEncode('content');
const BIPF_TYPE = bipf.allocAndEncode('type');
const BIPF_TEXT = bipf.allocAndEncode('text');
const BIPF_START_DATE_TIME = bipf.allocAndEncode('startDateTime');
const BIPF_TITLE = bipf.allocAndEncode('title');
const BIPF_DESCRIPTION = bipf.allocAndEncode('description');

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

function getPostText(buf: Buffer, pValueContent: number): string {
  const pValueContentText = bipf.seekKey2(buf, pValueContent, BIPF_TEXT, 0);
  if (pValueContentText < 0) return '';
  const text = bipf.decode(buf, pValueContentText);
  if (typeof text !== 'string') return '';
  if (!text) return '';
  return text;
}

function hasStartdatetime(buf: Buffer, pValueContent: number): boolean {
  const pValueContentStartdatetime = bipf.seekKey2(
    buf,
    pValueContent,
    BIPF_START_DATE_TIME,
    0,
  );
  return pValueContentStartdatetime >= 0;
}

function getGatheringText(buf: Buffer, pValueContent: number): string {
  const pValueContentTitle = bipf.seekKey2(buf, pValueContent, BIPF_TITLE, 0);
  const pValueContentDescription = bipf.seekKey2(
    buf,
    pValueContent,
    BIPF_DESCRIPTION,
    0,
  );
  if (pValueContentTitle < 0 && pValueContentDescription < 0) return '';
  const title =
    pValueContentTitle >= 0 ? bipf.decode(buf, pValueContentTitle) : '';
  const description =
    pValueContentDescription >= 0
      ? bipf.decode(buf, pValueContentDescription)
      : '';
  return title + ' ' + description;
}

function findMsgText(buf: Buffer, pValue: number): string {
  const pValueContent = bipf.seekKey2(buf, pValue, BIPF_CONTENT, 0);
  if (pValueContent < 0) return '';
  const pValueContentType = bipf.seekKey2(buf, pValueContent, BIPF_TYPE, 0);
  if (pValueContentType < 0) return '';
  const type = bipf.decode(buf, pValueContentType);
  if (type === 'post') {
    return getPostText(buf, pValueContent);
  } else if (type === 'about' && hasStartdatetime(buf, pValueContent)) {
    return getGatheringText(buf, pValueContent);
  } else {
    return '';
  }
}

class WordsIndex extends Plugin {
  constructor(log: any, dir: any) {
    super(log, dir, 'search2', 1, 'json', 'binary');
  }

  processRecord(record: AAOLRecord, seq: number, pValue: number) {
    let text = findMsgText(record.value, pValue);
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

  query(text: string, cb: CB<any>, onAbort: AddListener) {
    const terms = [...text.toLocaleLowerCase().matchAll(unicodeWordRegex)].map(
      (result) => result[0],
    );

    let drainers: Array<{abort: CallableFunction}>;

    onAbort(() => {
      while (drainers && drainers.length) drainers.shift()?.abort();
    });

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
