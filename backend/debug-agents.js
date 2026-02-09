// Quick diagnostic script - run with: node debug-agents.js
import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    // 1. Total orders
    const { rows: [{ total }] } = await pool.query('SELECT COUNT(*) as total FROM orders');
    console.log(`\n📦 Total orders in DB: ${total}\n`);

    // 2. Orders table columns
    const { rows: cols } = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'orders'
      ORDER BY ordinal_position
    `);
    console.log('📋 Orders table columns:');
    cols.forEach(c => console.log(`   ${c.column_name} (${c.data_type})`));

    // 3. Agents
    const { rows: agents } = await pool.query(`
      SELECT id, name, zoho_id, is_admin, active FROM agents ORDER BY name
    `);
    console.log('\n👥 Agents:');
    agents.forEach(a => console.log(`   ${a.name} | zoho_id: ${a.zoho_id} | admin: ${a.is_admin} | active: ${a.active}`));

    // 4. Salesperson breakdown in orders
    const { rows: spBreakdown } = await pool.query(`
      SELECT
        salesperson_id,
        salesperson_name,
        COUNT(*) as order_count,
        COALESCE(SUM(total), 0)::numeric(12,2) as revenue
      FROM orders
      GROUP BY salesperson_id, salesperson_name
      ORDER BY order_count DESC
    `);

    const agentZohoIds = new Set(agents.map(a => a.zoho_id).filter(Boolean));

    console.log('\n🔗 Salesperson ID breakdown in orders:');
    let matchedTotal = 0, unmatchedTotal = 0, nullTotal = 0;
    for (const r of spBreakdown) {
      const matched = agentZohoIds.has(r.salesperson_id);
      const isNull = !r.salesperson_id;
      const tag = isNull ? '⚪ NULL' : matched ? '✅ MATCHED' : '❌ NO MATCH';
      console.log(`   ${tag} | sp_id: ${r.salesperson_id || 'NULL'} | name: ${r.salesperson_name || 'NULL'} | orders: ${r.order_count} | revenue: £${r.revenue}`);
      if (isNull) nullTotal += parseInt(r.order_count);
      else if (matched) matchedTotal += parseInt(r.order_count);
      else unmatchedTotal += parseInt(r.order_count);
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Matched to agents: ${matchedTotal} orders`);
    console.log(`   ❌ Unmatched sp_id:   ${unmatchedTotal} orders`);
    console.log(`   ⚪ NULL sp_id:        ${nullTotal} orders`);
    console.log(`   📦 Total:             ${total} orders`);

    // 5. Sample orders
    const { rows: samples } = await pool.query(`
      SELECT id, salesorder_number, salesperson_id, salesperson_name, date, total
      FROM orders ORDER BY date DESC LIMIT 5
    `);
    console.log('\n🔍 Sample recent orders:');
    samples.forEach(o => console.log(`   ${o.salesorder_number} | sp_id: ${o.salesperson_id} | sp_name: ${o.salesperson_name} | date: ${o.date} | £${o.total}`));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
