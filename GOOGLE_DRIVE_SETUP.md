# Google Drive OAuth Setup Guide

## Error: "Access blocked: Authorization Error" / "Error 400: invalid_request"

This error occurs when your Google OAuth app doesn't comply with Google's OAuth 2.0 policy. Here's how to fix it:

## Step 1: Configure OAuth Consent Screen

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services** → **OAuth consent screen**

### For Testing/Development:

1. **User Type**: Select "External" (unless you have a Google Workspace account)
2. **App Information**:
   - App name: `gravitate-agent-web` (or your app name)
   - User support email: Your email
   - Developer contact information: Your email
3. **Scopes**: Click "Add or Remove Scopes" and add:
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
4. **Test Users**: 
   - **CRITICAL**: Add your email (`qthomas110@gmail.com`) to the "Test users" list
   - Click "Add Users" and enter your email
   - Save changes
5. **Publishing Status**: Keep it as "Testing" for development

### For Production:

1. Complete all the above steps
2. Fill out the OAuth consent screen completely:
   - App logo (optional but recommended)
   - App domain (your production domain)
   - Authorized domains
   - Privacy policy URL
   - Terms of service URL
3. Submit for verification (if using sensitive scopes)
4. Once verified, you can publish the app

## Step 2: Create OAuth 2.0 Credentials

1. Navigate to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. **Application type**: Web application
4. **Name**: `gravitate-agent-web` (or your preferred name)
5. **Authorized redirect URIs**: Add these URIs:
   - For local development: `http://localhost:3000/api/google-drive/callback`
   - For production: `https://yourdomain.com/api/google-drive/callback`
   - **Important**: The URI must match exactly (including trailing slashes, http vs https, etc.)
6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

## Step 3: Configure Environment Variables

Add these to your `.env` file:

```env
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
NEXT_PUBLIC_APP_URL=http://localhost:3000  # or your production URL
```

## Step 4: Enable Required APIs

1. Navigate to **APIs & Services** → **Library**
2. Enable these APIs:
   - **Google Drive API**
   - **Google+ API** (for userinfo endpoints)

## Common Issues and Solutions

### Issue: "Access blocked" error persists

**Solution**: 
- Make sure your email is added to "Test users" in OAuth consent screen
- Check that the redirect URI matches exactly (no trailing slashes, correct protocol)
- Verify that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correctly set

### Issue: Redirect URI mismatch

**Solution**:
- Check the exact redirect URI in your code: `${NEXT_PUBLIC_APP_URL}/api/google-drive/callback`
- Ensure it matches exactly in Google Cloud Console (including protocol, domain, and path)
- For localhost, use `http://localhost:3000` (not `http://127.0.0.1:3000`)

### Issue: Scopes not approved

**Solution**:
- For testing: Add scopes in OAuth consent screen and add yourself as a test user
- For production: Submit your app for verification if using sensitive scopes

### Issue: App verification required

**Solution**:
- Complete all required fields in OAuth consent screen
- Add privacy policy and terms of service URLs
- Submit for verification (can take several days)
- Or keep app in "Testing" mode and add all users as test users

## Testing

1. Make sure your environment variables are set
2. Start your development server: `npm run dev` or `pnpm dev`
3. Navigate to Settings page
4. Click "Connect Google Drive"
5. You should be redirected to Google's consent screen
6. Sign in with your test user email
7. Grant permissions
8. You should be redirected back to your app

## Production Checklist

- [ ] OAuth consent screen is fully configured
- [ ] App is published (or in testing with all users added)
- [ ] Redirect URIs are configured for production domain
- [ ] Environment variables are set in production
- [ ] Required APIs are enabled
- [ ] Privacy policy and terms of service URLs are provided (if required)

## Additional Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [OAuth Consent Screen Guide](https://support.google.com/cloud/answer/10311615)
- [Google Drive API Documentation](https://developers.google.com/drive/api)

