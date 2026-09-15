const path = require('node:path');
module.exports = {
  content: [
    path.resolve(__dirname, '../upstream/index.html'),
    path.resolve(__dirname, '../upstream/game.js'),
    path.resolve(__dirname, '../upstream/src/**/*.js'),
  ],
  // Some status/category classes are concatenated at runtime. Explicitly
  // compile their finite color palette; no browser compiler/CDN is shipped.
  safelist: [
    { pattern: /^(bg|text|border)-(gray|slate|red|orange|amber|yellow|green|emerald|cyan|blue|indigo|violet|purple|fuchsia|pink|rose|teal|lime|stone)-(100|200|300|400|500|600|700|800|900)$/, variants: ['hover'] },
    'hidden', 'block', 'flex', 'opacity-40', 'opacity-50', 'cursor-not-allowed',
  ],
  theme: { extend: {} },
  plugins: [],
};
