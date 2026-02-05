# Customer Orders Sub-collection Sync

This implementation adds functionality to automatically sync sales orders to customer sub-collections in Firebase.

## Overview

The system now automatically adds each sales order to a `customers_orders` sub-collection under the corresponding customer document. This provides:

1. Better query performance when fetching orders for a specific customer
2. Easier access to customer-specific order history
3. Improved data organization

## Structure

```
customers/
  └── {customer_id}/
      ├── (customer fields)
      └── customers_orders/
          └── {salesorder_id}/
              └── (all order fields)
```

## Implementation Details

### 1. Automatic Sync (cronDataSyncService.js)

The `cronDataSyncService.js` has been updated to automatically add orders to customer sub-collections during:

- **High Frequency Sync** (every 15 minutes): New/modified orders
- **Medium Frequency Sync** (every 2 hours): Last 24 hours of orders
- **Low Frequency Sync** (daily at 2 AM): Last 7 days of orders

The new method `addOrdersToCustomerSubcollections()` handles this process with:
- Batch processing (400 documents per batch)
- Error handling and logging
- Progress tracking

### 2. Backfill Script

For existing orders, use the backfill script to populate the sub-collections.

## Usage

### Running the Backfill

1. **Dry Run** (check what would be processed):
   ```bash
   cd SplitWeb/server
   node src/scripts/backfillCustomerOrders.js --dry-run
   ```

2. **Execute Backfill**:
   ```bash
   cd SplitWeb/server
   node src/scripts/backfillCustomerOrders.js
   ```

3. **Backfill with Verification**:
   ```bash
   cd SplitWeb/server
   node src/scripts/backfillCustomerOrders.js --verify
   ```

### Verifying the Results

Run the verification script to check if orders are properly synced:

```bash
cd SplitWeb/server
node src/scripts/verifyCustomerOrders.js
```

This will:
- Compare counts between main collection and sub-collections
- Check recent orders
- Identify any mismatches
- Show orders without customer_id

## Features

### Backfill Script Features:
- **Progress Tracking**: Shows real-time progress with percentage, rate, and ETA
- **Pagination**: Processes orders in pages of 1000 to handle large datasets
- **Batch Processing**: Commits in batches of 400 for efficiency
- **Error Handling**: Continues processing even if individual orders fail
- **Statistics**: Tracks processed, skipped, and failed orders
- **Customer Tracking**: Shows unique customers processed

### Added Fields:
Each order in the sub-collection includes:
- `_addedToCustomer`: Timestamp when added to sub-collection
- `_syncSource`: Source of the sync ('cron_sync' or 'backfill')
- `_backfilled`: Boolean flag for backfilled orders
- `_backfillDate`: Date when backfilled (for backfill script only)

## Performance Considerations

1. **Batch Size**: Set to 400 documents per batch (Firestore limit is 500)
2. **Rate Limiting**: 500ms delay between batches to avoid overwhelming the system
3. **Pagination**: Processes 1000 orders at a time to manage memory usage

## Monitoring

The cron sync will log:
```
📝 Adding X orders to customer sub-collections...
✅ Added Y orders to customer sub-collections (Z errors)
```

## Error Handling

- Orders without `customer_id` are skipped and logged
- Individual order failures don't stop the entire process
- All errors are logged with order ID and customer ID
- Failed batches are reported but processing continues

## Future Enhancements

Consider adding:
1. Webhook to update sub-collection in real-time when orders are created
2. Cloud Function triggers for automatic updates
3. Periodic verification job to ensure consistency
4. Cleanup job for deleted orders

## Troubleshooting

If orders are missing from sub-collections:

1. Check if the order has a `customer_id`
2. Run the verification script to identify gaps
3. Re-run the backfill for specific date ranges if needed
4. Check logs for any errors during sync

## Notes

- The sub-collection uses the same document ID as the order (salesorder_id)
- All order fields are copied to the sub-collection
- Updates are merged, so existing data won't be overwritten
- The system handles both new orders and updates to existing orders
