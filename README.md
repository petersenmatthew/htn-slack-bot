# Slack Recap Bot

An MVP Slack recap bot built with Slack Bolt, TypeScript, Socket Mode, and OpenRouter.

Typing `/recap` in Slack asks the bot to fetch recent channel messages and summarize them with OpenRouter. You can optionally pass a message count:

```text
/recap 75
```

Typing `/photoslides` with a Slack thread link and Google Slides link asks the bot to collect PNG, JPEG, and GIF images from that thread and place them into the chosen deck:

```text
/photoslides https://your-workspace.slack.com/archives/C123/p1716400000000000?thread_ts=1716400000.000000&cid=C123 https://docs.google.com/presentation/d/SLIDES_ID/edit slide=3
```

`slide=N` is required so the command decides which slide to replace each time.

## Setup

Install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
cp .env.example .env
```

Fill in `.env`:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-level-token
OPENROUTER_API_KEY=your-openrouter-api-key
OPENROUTER_MODEL=openrouter/free
GOOGLE_DRIVE_UPLOAD_FOLDER_ID=your-google-drive-folder-id
GOOGLE_AUTH_MODE=oauth
GOOGLE_OAUTH_CLIENT_ID=your-google-oauth-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost
GOOGLE_OAUTH_REFRESH_TOKEN=your-generated-refresh-token
```

`OPENROUTER_MODEL` is optional. If omitted, the bot uses OpenRouter's free router: `openrouter/free`.

The Google variables are used by `/photoslides`. OAuth is recommended because service accounts cannot upload files into normal My Drive storage unless you use Shared Drives.

## Run Locally

Start the bot in development mode:

```bash
npm run dev
```

Build TypeScript:

```bash
npm run build
```

Run the compiled app:

```bash
npm start
```

When the bot starts successfully, you should see:

```text
⚡ Slack Recap Bot running
```

## Slack App Configuration

Create a Slack app at <https://api.slack.com/apps>.

### 1. Enable Socket Mode

1. Open your Slack app settings.
2. Go to **Socket Mode**.
3. Enable Socket Mode.
4. Create an app-level token with the `connections:write` scope.
5. Copy that token into `.env` as `SLACK_APP_TOKEN`.

Socket Mode lets the bot receive events locally without using ngrok.

### 2. Add Bot Token Scopes

Go to **OAuth & Permissions** and add these bot token scopes:

```text
commands
chat:write
channels:history
groups:history
files:read
users:read
im:history
im:read
```

Install the app to your workspace, then copy the bot user OAuth token into `.env` as `SLACK_BOT_TOKEN`.

### 2b. Subscribe to DM messages (required for `/upload`)

Under **Event Subscriptions** → **Subscribe to bot events**, add:

```text
message.im
```

Save and reinstall the app if prompted. This lets the bot receive the photo you send after `/upload`.

If you want to use the guided `/photoslides` flow in channels, also add:

```text
message.channels
message.groups
```

These let the bot read your follow-up answers after `/photoslides`.

### 3. Copy Signing Secret

Go to **Basic Information** and copy the app signing secret into `.env` as `SLACK_SIGNING_SECRET`.

### 4. Create Slash Commands

#### `/recap`

1. Go to **Slash Commands**.
2. Click **Create New Command**.
3. Set **Command** to `/recap`.
4. For **Request URL**, enter any valid placeholder URL, such as `https://example.com/slack/events`.
5. Add a short description, such as `Summarize recent channel activity`.
6. Save the command.
7. Reinstall the Slack app if Slack prompts you to do so.

In Socket Mode, Slack Bolt receives the command over the WebSocket connection, so the placeholder Request URL is not used for local development.

#### `/upload`

1. Create another slash command named `/upload`.
2. Use the same placeholder Request URL as `/recap`.
3. Description example: `Upload your yearly embarrassing photo`.

#### `/photoslides`

1. Create another slash command named `/photoslides`.
2. Use the same placeholder Request URL as `/recap`.
3. Description example: `Populate a Google Slides photo slide from a Slack thread`.
4. Reinstall the Slack app if Slack prompts you to do so.

**Usage** (DM with the bot only — not in channels)

1. Open a direct message with the bot (profile → **Message**).
2. Run `/upload`.
3. Send your photo as the next message in that DM (drag in an image or use **+**).
4. `/upload status` — list of who has uploaded (name, job title, dates, photo link).

Role is read from each person's Slack **job title** (`profile.title`). If it's blank, the tracker shows `—`.

If someone runs `/upload` in a channel, the bot replies with a private ephemeral note to use a DM instead.

Uploads are stored locally in `data/blackmail.json` (gitignored). Each record has: name, role, `dateUploaded`, `blackmailPhoto` URL, and optional `dateReleased`.

## Google Slides Photo Automation

Run `/photoslides` with no extra text to start a guided setup. The bot will ask for:

1. Slack thread link or bare thread timestamp.
2. Google Slides deck link or presentation ID.
3. Slide number.

You can also provide everything in one command. If you paste a copied Slack reply link, the bot uses the `thread_ts` query parameter so it still resolves to the parent thread.

```text
/photoslides <thread-link-or-thread-ts> <google-slides-link-or-id> slide=N
```

You can also pass the deck as a named argument:

```text
/photoslides <thread-link-or-thread-ts> deck=<google-slides-link-or-id> slide=N
```

The command:

1. Fetches the parent message and replies with `conversations.replies`.
2. Reads file metadata with `files.info`.
3. Downloads supported private Slack images using the bot token.
4. Temporarily uploads each image to Google Drive and makes it link-readable.
5. Deletes previously generated `weekly_photo_` elements on the target slide.
6. Inserts the new photo grid into the existing slide.
7. Deletes the temporary Drive files after Slides has copied the images.

Supported image types are PNG, JPEG, and GIF. HEIC, WebP, videos, and other file types are skipped and reported in the Slack response.

### Google Setup

OAuth setup is the easiest path for normal Google Drive folders:

1. Create or choose a Google Cloud project.
2. Enable the Google Slides API and Google Drive API.
3. Go to **APIs & Services** -> **OAuth consent screen** and configure the app for your own account.
4. Add yourself as a test user if the app is in testing mode.
5. Go to **Credentials** -> **Create Credentials** -> **OAuth client ID**.
6. Choose **Desktop app**.
7. Copy the client ID and client secret into `.env`.
8. Set `GOOGLE_OAUTH_REDIRECT_URI=http://localhost`.
9. Run `npm run google:auth`.
10. Open the printed URL, approve access, and paste the returned code or full redirected URL into the terminal.
11. Copy the printed `GOOGLE_OAUTH_REFRESH_TOKEN=...` line into `.env`.
12. Create or choose a Drive folder for temporary uploads and copy its folder ID into `GOOGLE_DRIVE_UPLOAD_FOLDER_ID`.
13. Paste the Google Slides deck link directly into `/photoslides` whenever you run the command.

If you use service-account auth instead, use `GOOGLE_AUTH_MODE=service_account` and `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=...`. That path generally needs a Google Shared Drive because service accounts do not have normal My Drive storage quota.

## Project Structure

```text
src/app.ts                       # Creates and starts the Slack Bolt app.
src/commands/photoslides.ts      # Handles the /photoslides slash command.
src/commands/recap.ts            # Handles the /recap slash command.
src/commands/upload.ts           # Handles the /upload slash command.
src/services/google-photo-slides.ts # Updates Google Drive and Slides.
src/services/openrouter.ts       # Calls OpenRouter for recap summaries.
src/services/slack-thread-photos.ts # Reads Slack thread photos.
src/services/blackmail-store.ts  # JSON persistence for upload records.
src/services/pending-upload.ts   # In-memory upload session state.
src/services/slack-user.ts       # Slack user display name helper.
src/services/upload-photo.ts     # Saves uploaded photos to the store.
src/utils/env.ts                 # Validates required environment variables.
src/utils/slack-channel.ts       # DM channel detection helper.
src/types/blackmail.ts           # Upload record types.
data/blackmail.json              # Local upload tracker (created at runtime).
.env.example                     # Documents required local environment variables.
.gitignore                       # Keeps dependencies, secrets, and build output out of git.
package.json                     # Defines dependencies and npm scripts.
tsconfig.json                    # Configures the TypeScript compiler.
```
