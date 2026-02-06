#!/usr/bin/env node
/**
 * Update product RRP from CSV file
 * Usage: node scripts/update-rrp.js /path/to/csv
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

// Get CSV path from args or use default
const csvPath = process.argv[2] || '/Users/blair/Downloads/Item (1).csv';

// Database connection
const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_6MRDgiTIG1Xc@ep-solitary-recipe-afg5cgms-pooler.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const header = lines[0].split(',');

  const zohoIdIndex = header.findIndex(h => h.trim().toLowerCase() === 'zoho_item_id');
  const rrpIndex = header.findIndex(h => h.trim().toLowerCase() === 'rrp');

  if (zohoIdIndex === -1 || rrpIndex === -1) {
    throw new Error('CSV must have zoho_item_id and rrp columns');
  }

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const zohoId = cols[zohoIdIndex]?.trim();
    const rrp = parseFloat(cols[rrpIndex]?.trim());

    if (zohoId && !isNaN(rrp)) {
      records.push({ zohoId, rrp });
    }
  }

  return records;
}

async function updateRRP(records) {
  const client = await pool.connect();

  try {
    console.log(`Updating ${records.length} products...`);

    let updated = 0;
    let notFound = 0;
    const batchSize = 100;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      await client.query('BEGIN');

      for (const { zohoId, rrp } of batch) {
        const result = await client.query(
          'UPDATE products SET rrp = $1, updated_at = NOW() WHERE zoho_item_id = $2',
          [rrp, zohoId]
        );

        if (result.rowCount > 0) {
          updated++;
        } else {
          notFound++;
        }
      }

      await client.query('COMMIT');

      // Progress
      const progress = Math.min(i + batchSize, records.length);
      process.stdout.write(`\rProcessed ${progress}/${records.length} (${updated} updated, ${notFound} not found)`);
    }

    console.log('\n');
    console.log(`Done! Updated: ${updated}, Not found: ${notFound}`);

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  console.log(`Reading CSV: ${csvPath}`);

  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  const records = await parseCSV(csvPath);
  console.log(`Found ${records.length} records to update`);

  // Show sample
  console.log('\nSample data:');
  records.slice(0, 3).forEach(r => console.log(`  ${r.zohoId} -> RRP: ${r.rrp}`));
  console.log('');

  await updateRRP(records);

  // Verify a few
  console.log('\nVerifying updates...');
  const { rows } = await pool.query(
    'SELECT zoho_item_id, sku, name, rrp FROM products WHERE zoho_item_id = ANY($1) LIMIT 5',
    [records.slice(0, 5).map(r => r.zohoId)]
  );
  rows.forEach(r => console.log(`  ${r.sku}: ${r.name} -> RRP: ${r.rrp}`));

  await pool.end();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
