// scripts/migrateCountersToEnhanced.js
// Migration script to enhance existing counters with new metrics

import admin from 'firebase-admin';
import salesAgentSyncService from '../src/services/salesAgentSyncService.js';

/**
 * Migrate existing counters to enhanced format
 * This preserves existing data while adding new metrics
 */
async function migrateCountersToEnhanced() {
  const db = admin.firestore();
  
  console.log('🔄 Starting counters migration to enhanced format...');
  
  try {
    // Get all sales agents
    const salesAgentsSnapshot = await db.collection('sales_agents').get();
    console.log(`Found ${salesAgentsSnapshot.size} sales agents to migrate`);
    
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const agentDoc of salesAgentsSnapshot.docs) {
      const salesAgentId = agentDoc.id;
      
      try {
        console.log(`\nMigrating agent ${salesAgentId}...`);
        
        // Get all existing counters for this agent
        const countersSnapshot = await db
          .collection('sales_agents')
          .doc(salesAgentId)
          .collection('counters')
          .get();
        
        console.log(`  Found ${countersSnapshot.size} counter documents`);
        
        // Check if already migrated by looking for new fields
        let needsMigration = false;
        for (const counterDoc of countersSnapshot.docs) {
          const data = counterDoc.data();
          if (!data.average_order_value || !data.customer_segments) {
            needsMigration = true;
            break;
          }
        }
        
        if (!needsMigration) {
          console.log(`  ✓ Agent ${salesAgentId} already migrated, skipping...`);
          continue;
        }
        
        // Recalculate all date ranges with enhanced metrics
        const batch = db.batch();
        const dateRanges = [
          '7_days', '30_days', '90_days',
          'this_week', 'last_week',
          'this_month', 'last_month',
          'this_quarter', 'last_quarter',
          'this_year', 'last_year'
        ];
        
        for (const dateRange of dateRanges) {
          console.log(`  Calculating enhanced metrics for ${dateRange}...`);
          
          try {
            // Calculate enhanced metrics
            const enhancedMetrics = await salesAgentSyncService.calculateMetricsForAgent(
              salesAgentId,
              dateRange
            );
            
            // Get existing counter doc
            const counterRef = db
              .collection('sales_agents')
              .doc(salesAgentId)
              .collection('counters')
              .doc(dateRange);
            
            const existingDoc = await counterRef.get();
            
            if (existingDoc.exists) {
              // Merge with existing data
              const existingData = existingDoc.data();
              const mergedData = {
                ...existingData,
                ...enhancedMetrics,
                migrated_at: admin.firestore.FieldValue.serverTimestamp()
              };
              
              batch.set(counterRef, mergedData, { merge: true });
            } else {
              // Create new counter doc
              batch.set(counterRef, {
                ...enhancedMetrics,
                migrated_at: admin.firestore.FieldValue.serverTimestamp()
              });
            }
            
          } catch (rangeError) {
            console.error(`    Error calculating ${dateRange}:`, rangeError.message);
          }
        }
        
        // Commit batch
        await batch.commit();
        migratedCount++;
        
        console.log(`  ✅ Migrated agent ${salesAgentId} successfully`);
        
        // Small delay to avoid overloading Firestore
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (agentError) {
        console.error(`❌ Error migrating agent ${salesAgentId}:`, agentError);
        errorCount++;
      }
    }
    
    console.log('\n✅ Migration completed:');
    console.log(`   - Migrated: ${migratedCount} agents`);
    console.log(`   - Errors: ${errorCount} agents`);
    console.log(`   - Already migrated: ${salesAgentsSnapshot.size - migratedCount - errorCount} agents`);
    
    return {
      success: true,
      migrated: migratedCount,
      errors: errorCount,
      total: salesAgentsSnapshot.size
    };
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run migration if this script is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  // Initialize Firebase Admin if not already initialized
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  
  migrateCountersToEnhanced()
    .then(result => {
      console.log('\nMigration result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Migration error:', error);
      process.exit(1);
    });
}

export default migrateCountersToEnhanced;