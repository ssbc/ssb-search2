const regenerate = require('regenerate');
const codePoints = require('@unicode/unicode-13.0.0/General_Category/Letter/code-points.js');

const set = regenerate(codePoints);
console.log(new RegExp(`(${set.toString()})+`, 'gi'));
