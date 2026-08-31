// Exit 0 when dependencies are installed, non-zero when npm install is needed.
const fs = require('fs');
const path = require('path');
const ok = ['express', '@supabase/supabase-js', 'qrcode', 'dotenv'].every((m) =>
  fs.existsSync(path.join('node_modules', m)),
);
process.exit(ok ? 0 : 42);
