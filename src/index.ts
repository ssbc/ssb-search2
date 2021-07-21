const {deferred} = require('ssb-db2/operators');
const WordsIndex = require('./plugin');
import {CB, SSB} from './types';

export = {
  name: 'search2',
  init(ssb: Required<SSB>, _config: unknown) {
    ssb.db.registerIndex(WordsIndex);

    return {
      operator(text: string) {
        return deferred((meta: any, cb: CB<any>) => {
          meta.db.onDrain('search2', () => {
            meta.db.getIndex('search2').query(text, cb);
          });
        });
      },
    };
  },
};
