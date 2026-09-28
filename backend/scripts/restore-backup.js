#!/usr/bin/env node
/**
 * Restores a backup written by the app's BackupModule (format "ario-app-backup/1").
 *
 *   node scripts/restore-backup.js <file.json.gz> --yes
 *
 * Every collection listed in the file is emptied and refilled. The file is read and checked
 * end to end before anything in the database is touched.
 */
const fs = require('fs');
const readline = require('readline');
const zlib = require('zlib');
const mongoose = require('mongoose');

const { EJSON } = mongoose.mongo.BSON;
const FORMAT = 'ario-app-backup/1';
const BATCH = 500;

const file = process.argv[2];
const confirmed = process.argv.includes('--yes') || process.env.ARIO_FORCE === '1';
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27019/ario_db';

function lines(path) {
  const input = fs.createReadStream(path).pipe(zlib.createGunzip());
  return readline.createInterface({ input, crlfDelay: Infinity });
}

async function verify(path) {
  let header = null;
  let footer = null;
  const counts = {};
  for await (const line of lines(path)) {
    if (!line) continue;
    const row = JSON.parse(line);
    if (!header) {
      if (row.format !== FORMAT) throw new Error(`Unsupported backup format: ${row.format}`);
      header = row;
    } else if (row.end) {
      footer = row;
    } else {
      counts[row.c] = (counts[row.c] || 0) + 1;
    }
  }
  if (!header) throw new Error('Empty backup file');
  if (!footer) throw new Error('Backup file is truncated (no end marker)');
  for (const [c, n] of Object.entries(footer.counts || {})) {
    if ((counts[c] || 0) !== n) throw new Error(`Collection ${c}: expected ${n} documents, found ${counts[c] || 0}`);
  }
  return { header, counts };
}

async function main() {
  if (!file || !fs.existsSync(file)) {
    console.error('Usage: node scripts/restore-backup.js <ario-backup-....json.gz> --yes');
    process.exit(1);
  }
  const { header, counts } = await verify(file);
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  console.log(`Backup from ${header.createdAt}: ${header.collections.length} collections, ${total} documents`);
  if (!confirmed) {
    console.error('This replaces the listed collections in the database. Re-run with --yes to continue.');
    process.exit(2);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  try {
    for (const c of header.collections) await db.collection(c).deleteMany({});

    let batch = [];
    let current = null;
    const flush = async () => {
      if (batch.length) await db.collection(current).insertMany(batch, { ordered: false });
      batch = [];
    };
    let first = true;
    for await (const line of lines(file)) {
      if (!line) continue;
      if (first) {
        first = false;
        continue;
      }
      const row = JSON.parse(line);
      if (row.end) break;
      if (row.c !== current) {
        await flush();
        current = row.c;
      }
      batch.push(EJSON.parse(JSON.stringify(row.d), { relaxed: false }));
      if (batch.length >= BATCH) await flush();
    }
    await flush();
    for (const [c, n] of Object.entries(counts)) console.log(`  ${c}: ${n}`);
    console.log('Restore finished.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
