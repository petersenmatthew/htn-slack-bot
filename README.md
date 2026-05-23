# Slack Recap Bot

An MVP Slack recap bot built with Slack Bolt, TypeScript, Socket Mode, and OpenRouter.

Typing `/recap` in Slack asks the bot to fetch recent channel messages and summarize them with OpenRouter. You can optionally pass a message count:

```text
/recap 75
```

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
```

`OPENROUTER_MODEL` is optional. If omitted, the bot uses OpenRouter's free router: `openrouter/free`.

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
```

Install the app to your workspace, then copy the bot user OAuth token into `.env` as `SLACK_BOT_TOKEN`.

### 3. Copy Signing Secret

Go to **Basic Information** and copy the app signing secret into `.env` as `SLACK_SIGNING_SECRET`.

### 4. Create the `/recap` Slash Command

1. Go to **Slash Commands**.
2. Click **Create New Command**.
3. Set **Command** to `/recap`.
4. For **Request URL**, enter any valid placeholder URL, such as `https://example.com/slack/events`.
5. Add a short description, such as `Summarize recent channel activity`.
6. Save the command.
7. Reinstall the Slack app if Slack prompts you to do so.

In Socket Mode, Slack Bolt receives the command over the WebSocket connection, so the placeholder Request URL is not used for local development.

## Project Structure

```text
src/app.ts              # Creates and starts the Slack Bolt app.
src/commands/recap.ts   # Handles the /recap slash command.
src/services/           # Calls OpenRouter for recap summaries.
src/utils/env.ts        # Validates required environment variables.
src/types/              # Reserved for shared TypeScript types.
.env.example            # Documents required local environment variables.
.gitignore              # Keeps dependencies, secrets, and build output out of git.
package.json            # Defines dependencies and npm scripts.
tsconfig.json           # Configures the TypeScript compiler.
```
