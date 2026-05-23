const requiredEnvVars = [
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "SLACK_APP_TOKEN",
  "OPENROUTER_API_KEY",
  "GOOGLE_DRIVE_UPLOAD_FOLDER_ID"
] as const;

type RequiredEnv = Record<(typeof requiredEnvVars)[number], string>;

type Env = RequiredEnv & {
  GOOGLE_AUTH_MODE: "service_account" | "oauth";
  GOOGLE_SERVICE_ACCOUNT_KEY_FILE?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_REDIRECT_URI?: string;
  GOOGLE_OAUTH_REFRESH_TOKEN?: string;
  OPENROUTER_MODEL: string;
};

const defaultEnv = {
  GOOGLE_AUTH_MODE: "service_account",
  OPENROUTER_MODEL: "openrouter/free"
} as const;

const getGoogleAuthMode = (): Env["GOOGLE_AUTH_MODE"] => {
  const mode = process.env.GOOGLE_AUTH_MODE || defaultEnv.GOOGLE_AUTH_MODE;

  if (mode !== "service_account" && mode !== "oauth") {
    throw new Error("GOOGLE_AUTH_MODE must be either service_account or oauth.");
  }

  return mode;
};

// Keep environment validation in one place so startup fails with a useful
// message when a required credential is missing.
const loadEnv = (): Env => {
  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const googleAuthMode = getGoogleAuthMode();
  const googleAuthRequired =
    googleAuthMode === "oauth"
      ? [
          "GOOGLE_OAUTH_CLIENT_ID",
          "GOOGLE_OAUTH_CLIENT_SECRET",
          "GOOGLE_OAUTH_REDIRECT_URI",
          "GOOGLE_OAUTH_REFRESH_TOKEN"
        ]
      : ["GOOGLE_SERVICE_ACCOUNT_KEY_FILE"];

  const missingGoogleAuth = googleAuthRequired.filter((key) => !process.env[key]);

  if (missingGoogleAuth.length > 0) {
    throw new Error(`Missing required Google auth environment variables: ${missingGoogleAuth.join(", ")}`);
  }

  const values = requiredEnvVars.reduce((envValues, key) => {
    envValues[key] = process.env[key] as string;
    return envValues;
  }, {} as RequiredEnv);

  return {
    ...values,
    GOOGLE_AUTH_MODE: googleAuthMode,
    GOOGLE_SERVICE_ACCOUNT_KEY_FILE: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI,
    GOOGLE_OAUTH_REFRESH_TOKEN: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || defaultEnv.OPENROUTER_MODEL
  };
};

export const env = loadEnv();
