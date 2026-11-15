# Enable Google sign-in

1. Open https://console.cloud.google.com/ and select or create a project.
2. Open **Google Auth Platform**. Set up Branding (app name and support/contact email) and Audience. For a personal test project choose External and add your Google account under Test users while in Testing.
3. In **Clients**, create an OAuth client. Choose **Web application**.
4. Add this exact **Authorized redirect URI** for the current local app:

   `http://localhost:5173/api/auth/google/callback`

   If you also open the API directly, optionally add `http://localhost:3001/api/auth/google/callback`. Use localhost consistently, not 127.0.0.1 in the browser.
5. Copy the client ID and client secret into the root `.env` file:

   ```dotenv
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:5173/api/auth/google/callback
   ```

   Do not share the secret in chat or commit it. No `VITE_` prefix is needed. This is Google OAuth, separate from the Gemini API key.
6. Restart the app server (or stop/restart `npm run dev`). Open http://localhost:5173 in your normal browser, select **Continue with Google**, and choose an allowed test account. A first-time patient completes date of birth, sex, and optional phone before intake.

## Vercel

Add `https://YOUR-DEPLOYED-DOMAIN/api/auth/google/callback` to the same client's authorized redirect URIs. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in the Vercel project's environment, with that HTTPS callback as the latter value, then redeploy. Use the stable deployed domain to start sign-in. The redirect URI must match exactly, including scheme, hostname, port, and path.

This app uses Google's server redirect flow with openid/email/profile scopes and a browser-bound, one-use state cookie. It does not use a Supabase OAuth callback. The Google user must return email_verified=true and a subject identifier. Sign-in failures return to the login page; credentials are never returned to the browser. The app session token returns in a URL fragment and is removed immediately by the frontend.

Google's official instructions:
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/openid-connect/openid-connect

Real Google consent/sign-in needs your credentials and account interaction and has not been verified yet.
