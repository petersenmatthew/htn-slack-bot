const requiredEnvVars = [
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "SLACK_APP_TOKEN",
  "OPENROUTER_API_KEY"
] as const;

type RequiredEnv = Record<(typeof requiredEnvVars)[number], string>;

type Env = RequiredEnv & {
  OPENROUTER_MODEL: string;
};

const defaultEnv = {
  OPENROUTER_MODEL: "openrouter/free"
} as const;

// Keep environment validation in one place so startup fails with a useful
// message when a required credential is missing.
const loadEnv = (): Env => {
  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const values = requiredEnvVars.reduce((envValues, key) => {
    envValues[key] = process.env[key] as string;
    return envValues;
  }, {} as RequiredEnv);

  return {
    ...values,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || defaultEnv.OPENROUTER_MODEL
  };
};

export const env = loadEnv();
