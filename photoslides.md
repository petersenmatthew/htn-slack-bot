# Photo Slides Setup

## One-Time Google Setup

1. Get these shared values from the team:
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_DRIVE_UPLOAD_FOLDER_ID`
2. Make sure your Google account can access:
   - The Slides deck you want to update.
   - The shared temp Drive upload folder.
3. Add this to `.env`:

```bash
GOOGLE_AUTH_MODE=oauth
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost
GOOGLE_DRIVE_UPLOAD_FOLDER_ID=...
```

4. Generate your own refresh token:

```bash
npm run google:auth
```

5. Paste the printed token into `.env`:

```bash
GOOGLE_OAUTH_REFRESH_TOKEN=...
```

## Run

```bash
npm install
npm run dev
```

## Test In Slack

1. Run:

```text
/photoslides
```

2. Reply with:
   - Slack thread link.
   - Google Slides link.
   - Slide number, like `1`.

The bot should populate that slide with photos from the thread.
