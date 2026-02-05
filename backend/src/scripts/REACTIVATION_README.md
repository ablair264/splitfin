# Product Reactivation Scripts

## ⚠️ Authentication Error?

If you're getting an authentication error (16 UNAUTHENTICATED), try these steps:

### 1. First, diagnose the issue:
```bash
cd SplitWeb/server
npm run diagnose-firebase
```

This will show you what's wrong with your Firebase configuration.

### 2. If authentication fails, try the emergency script:
```bash
npm run emergency-reactivate
```

This bypasses the shared configuration and directly uses your service account key.

### 3. If both fail, you need a new service account key:

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Click the gear icon → Project Settings
4. Go to "Service Accounts" tab
5. Click "Generate New Private Key"
6. Save the downloaded file as `serviceAccountKey.json` in the `SplitWeb/server` directory
7. Run the emergency script again: `npm run emergency-reactivate`

---

## Available Scripts

### 1. Quick Reactivation (Recommended)
```bash
cd SplitWeb/server
npm run reactivate-products:quick
```
- Only processes inactive items
- Very fast execution
- No confirmation wait

### 2. Full Reactivation
```bash
npm run reactivate-products
```
- Processes all items
- Shows detailed logging
- 5-second confirmation delay

### 3. Emergency Reactivation
```bash
npm run emergency-reactivate
```
- Bypasses shared Firebase config
- Direct initialization
- Use when other scripts fail

### 4. Diagnose Firebase
```bash
npm run diagnose-firebase
```
- Tests Firebase connection
- Shows configuration details
- Helps troubleshoot issues

## What These Scripts Do:

1. **Set status to 'active'** for products
2. **Remove deactivation metadata:**
   - `_deactivated_reason`
   - `_deactivated_at`
3. **Add reactivation timestamp**
4. **Process in batches** to respect Firestore limits

## Troubleshooting

### Common Issues:

1. **16 UNAUTHENTICATED Error**
   - Your service account key is invalid or expired
   - Download a fresh key from Firebase Console

2. **Permission Denied**
   - Service account lacks Firestore permissions
   - Check IAM roles in Google Cloud Console

3. **Project Not Found**
   - Service account key is from wrong project
   - Verify project ID matches your Firebase project

### Need Help?

If scripts still fail after trying the emergency reactivation:
1. Check that `serviceAccountKey.json` exists in server directory
2. Verify the file contains valid JSON
3. Ensure the project ID in the file matches your Firebase project
4. Contact support with the error message from diagnose-firebase
