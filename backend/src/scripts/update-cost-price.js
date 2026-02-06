#!/usr/bin/env node
/**
 * Update product cost_price from CSV file
 * Usage: node scripts/update-cost-price.js /path/to/csv
 *
 * The CSV should have zoho_item_id and rrp columns (rrp in CSV = cost price)
 */

import fs from 'fs';
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

  const zohoIdIndex = header.findIndex(h => h.trim().toLowerCase() === 'item id');
  const costIndex = header.findIndex(h => h.trim().toLowerCase() === 'cost_price');

  if (zohoIdIndex === -1 || costIndex === -1) {
    throw new Error('CSV must have "Item ID" and "cost_price" columns');
  }

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const zohoId = cols[zohoIdIndex]?.trim();
    const costPrice = parseFloat(cols[costIndex]?.trim());

    if (zohoId && !isNaN(costPrice)) {
      records.push({ zohoId, costPrice });
    }
  }

  return records;
}

async function updateCostPrice(records) {
  const client = await pool.connect();

  try {
    console.log(`Updating ${records.length} products...`);

    let updated = 0;
    let notFound = 0;
    const batchSize = 100;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      await client.query('BEGIN');

      for (const { zohoId, costPrice } of batch) {
        const result = await client.query(
          'UPDATE products SET cost_price = $1, updated_at = NOW() WHERE zoho_item_id = $2',
          [costPrice, zohoId]
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
  records.slice(0, 3).forEach(r => console.log(`  ${r.zohoId} -> Cost Price: ${r.costPrice}`));
  console.log('');

  await updateCostPrice(records);

  // Verify a few
  console.log('\nVerifying updates...');
  const { rows } = await pool.query(
    'SELECT zoho_item_id, sku, name, cost_price, rate FROM products WHERE zoho_item_id = ANY($1) LIMIT 5',
    [records.slice(0, 5).map(r => r.zohoId)]
  );
  rows.forEach(r => console.log(`  ${r.sku}: ${r.name} -> Cost: ${r.cost_price}, Rate: ${r.rate}`));

  await pool.end();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
