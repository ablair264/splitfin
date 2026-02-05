#!/bin/bash
# Quick script to stop the backfill process on Render

# Find and kill node processes running backfill
echo "Looking for backfill processes..."
ps aux | grep -E "backfillSalesOrders|backfill-orders" | grep -v grep

# Get the PIDs
PIDS=$(ps aux | grep -E "backfillSalesOrders|backfill-orders" | grep -v grep | awk '{print $2}')

if [ -z "$PIDS" ]; then
    echo "No backfill processes found running."
else
    echo "Found backfill processes with PIDs: $PIDS"
    echo "Killing processes..."
    for PID in $PIDS; do
        kill -9 $PID
        echo "Killed process $PID"
    done
    echo "All backfill processes terminated."
fi

# Also set kill switch in Firebase (if you have firebase-admin CLI installed)
echo ""
echo "To prevent future runs, you should also run:"
echo "curl -X DELETE https://splitfin-zoho-api.onrender.com/api/admin/backfill-orders -H 'Authorization: Bearer YOUR_TOKEN'"
