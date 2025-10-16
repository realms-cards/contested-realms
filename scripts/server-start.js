const fs = require('fs');
const path = require('path');

const entry = path.resolve(__dirname, '..', 'dist', 'server', 'index.js');

if (!fs.existsSync(entry)) {
  console.error('[server] Compiled entrypoint missing at', entry);
  console.error('Run `npm run server:build` before `npm run server:start`.');
  process.exit(1);
}

require(entry);
