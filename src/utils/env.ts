const requiredEnvVars = [
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "SLACK_APP_TOKEN"
] as const;

type Env = Record<(typeof requiredEnvVars)[number], string>;

// Keep environment validation in one place so startup fails with a useful
// message when a required Slack credential is missing.
const loadEnv = (): Env => {
  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return requiredEnvVars.reduce((values, key) => {
    values[key] = process.env[key] as string;
    return values;
  }, {} as Env);
};

export const env = loadEnv();
