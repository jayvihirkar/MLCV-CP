# Run the local demo on a phone

1. Connect the laptop and phone to the same Wi-Fi (not an isolated guest network).
2. Stop the existing `npm run dev` with Ctrl+C in its terminal.
3. From the repository run `npm run dev:lan`. It starts Vite on all interfaces
   on port 5173, plus the existing API and document worker. The fixed port avoids
   silently moving away from the local Google callback.
4. If Windows asks, allow Node.js access on your trusted private network.
5. Open `http://LAPTOP-WIFI-IP:5173` on the phone. At setup time the laptop's
   Wi-Fi address was `192.168.1.2`, so use `http://192.168.1.2:5173`.
   The address can change after reconnecting. Run `ipconfig` and look under
   Wireless LAN adapter Wi-Fi for the current IPv4 address.

Use email/password login for this HTTP LAN path. The browser's `localhost` is
the phone itself, not the laptop. All app API requests use the same host through
Vite's proxy, so the phone does not need the API or worker port in its URL.

## Voice and Google login

Phone microphone recording requires a secure context. The laptop's HTTP LAN IP
does not count as localhost on the phone. Google login's current callback also
points to localhost. Therefore the LAN URL is suitable for checking mobile layout,
typed intake, uploads, and the doctor interface, but not a full voice/Google demo.

For the complete flow, expose the **frontend** over HTTPS with a tunnel, while
keeping the app and worker running on the laptop. With Cloudflare's `cloudflared`
installed, use a separate terminal:

```powershell
cloudflared tunnel --url http://localhost:5173
```

Copy its HTTPS origin, e.g. `https://EXAMPLE.trycloudflare.com`. Add that hostname
to Vite's allowed hosts by setting `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` in the
terminal that starts the app, then restart the app:

```powershell
$env:__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS='EXAMPLE.trycloudflare.com'
npm run dev:lan
```

Set `GOOGLE_REDIRECT_URI=https://EXAMPLE.trycloudflare.com/api/auth/google/callback`
in the laptop's ignored `.env`, and register that exact callback in your Google
OAuth web client. Restart the app after changing `.env`. Open the HTTPS tunnel
URL on both phone and laptop when testing this callback; do not start login on
one origin and return to another. Keep the worker URL local in `.env`:
`DOCUMENT_PIPELINE_URL=http://127.0.0.1:8000`.

The temporary tunnel URL changes when restarted. Update the allowed hostname,
Google callback registration, and `.env` to match it. To return to ordinary laptop
login, restore `GOOGLE_REDIRECT_URI=http://localhost:5173/api/auth/google/callback`
and restart the app. No Vercel or Supabase setup is required for this tunnel.

References:
- https://vite.dev/config/server-options
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
