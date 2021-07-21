# ssb-search2

> An SSB secret-stack plugin for \*_full-text search_ using ssb-db2

This is a similar to [ssb-search](https://github.com/ssbc/ssb-search), built with ssb-db2. The differences with ssb-search are:

- Supports only `ssb-db2`
- Supports Unicode, i.e. can search for "Smörgås" or Chinese
- ssb-search ignores small words (2 characters long, e.g. "to", "of"), which hurts the search for terms like "EU" or "VR" as well as Chinese words with one character, but ssb-search2 ignores only lowercase ASCII letters of length 1 or 2, which means it can index "VR" and "EU" and Chinese

## Install

```
npm install ssb-search2
```

## Usage

- Requires **Node.js 12** or higher
- Requires `secret-stack@^6.2.0`
- Requires `ssb-db2@>=2`

```diff
 SecretStack({appKey: require('ssb-caps').shs})
   .use(require('ssb-master'))
+  .use(require('ssb-db2'))
+  .use(require('ssb-search2'))
   .use(require('ssb-conn'))
   .use(require('ssb-blobs'))
   .call(null, config)
```

Now, just pluck the ssb-db2 operator at `ssb.search2.operator` and use it like this:

```js
// Pluck the operator and name it whatever you want, e.g. `containsWords`
const containsWords = sbot.search2.operator;

sbot.db.query(
  where(containsWords('secure scuttlebutt')),
  toCallback((err, msgs) => {
    console.log(msgs) // all messages containing "secure scuttlebutt"
                      // inside `msg.value.content.text`
  })
),
```

## License

LGPL-3.0
