import "dotenv/config";

import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import { google } from "googleapis";

const scopes = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/presentations"
];

const requiredEnvVars = [
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI"
] as const;

const missing = requiredEnvVars.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(`Missing required OAuth setup environment variables: ${missing.join(", ")}`);
}

const oauthClient = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  process.env.GOOGLE_OAUTH_REDIRECT_URI
);

const authUrl = oauthClient.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: scopes
});

const extractCode = (value: string): string => {
  const trimmed = value.trim();

  try {
    const url = new URL(trimmed);
    return url.searchParams.get("code") ?? trimmed;
  } catch {
    return trimmed;
  }
};

const main = async (): Promise<void> => {
  const rl = createInterface({ input, output });

  try {
    console.log("Open this URL and approve access:");
    console.log(authUrl);
    console.log("");
    console.log("If the browser ends on a localhost error page, copy the full URL from the address bar.");

    const codeInput = await rl.question("Paste the code or redirected URL here: ");
    const { tokens } = await oauthClient.getToken(extractCode(codeInput));

    if (!tokens.refresh_token) {
      throw new Error("Google did not return a refresh token. Re-run this script and approve the consent prompt again.");
    }

    console.log("");
    console.log("Add this to your .env:");
    console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
  } finally {
    rl.close();
  }
};

void main();
