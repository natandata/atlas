#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const a = process.argv.slice(2), log = process.env.FAKE_RCLONE_LOG;
if (a[0] === 'listremotes') console.log('gdrive:');
else if (a[0] === 'copyto') { appendFileSync(log, `copyto ${a[1].split('/').pop()} -> ${a[2]}\n`); }
else if (a[0] === 'link') console.log('https://drive.google.com/file/d/FAKE/view');
else process.exit(1);
