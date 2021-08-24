const {deferred} = require('ssb-db2/operators');
import WordsIndex = require('./plugin');
import {AddListener, CB, SSB} from './types';

export = {
  name: 'search2',
  init(ssb: Required<SSB>, _config: unknown) {
    ssb.db.registerIndex(WordsIndex);

    return {
      operator(text: string) {
        return deferred((meta: any, cb: CB<any>, onAbort: AddListener) => {
          meta.db.onDrain('search2', () => {
            const plugin = meta.db.getIndex('search2') as WordsIndex;
            plugin.query(text, cb, onAbort);
          });
        });
      },
    };
  },
};
