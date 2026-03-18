import { pathToFileURL } from 'node:url';
import { clerkSetup } from '@clerk/testing/playwright';
import type { Browser } from '@playwright/test';
import { chromium } from '@playwright/test';
import dotenv from 'dotenv';

const DEFAULT_APP_URL = 'http://localhost:3000';
const DEFAULT_CDP_PORT = 9224;

type RequiredEnvVar = {
  key:
    | 'E2E_CLERK_USER_USERNAME'
    | 'E2E_CLERK_USER_PASSWORD'
    | 'CLERK_SECRET_KEY'
    | 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY';
  message: string;
  fix: string;
};

type EnvLike = Readonly<Record<string, string | undefined>>;

export type AgentBrowserCdpConfig = {
  username: string;
  password: string;
  clerkSecretKey: string;
  clerkPublishableKey: string;
  baseURL: string;
  dashboardUrl: string;
  practiceUrl: string;
  cdpPort: number;
};

export type AgentBrowserCdpInstructionInput = {
  cdpPort: number;
  authenticatedUrl: string;
  practiceUrl: string;
};

const REQUIRED_ENV_VARS: readonly RequiredEnvVar[] = [
  {
    key: 'E2E_CLERK_USER_USERNAME',
    message: 'E2E_CLERK_USER_USERNAME is missing.',
    fix: 'Set E2E_CLERK_USER_USERNAME to the Clerk E2E user email.',
  },
  {
    key: 'E2E_CLERK_USER_PASSWORD',
    message: 'E2E_CLERK_USER_PASSWORD is missing.',
    fix: 'Set E2E_CLERK_USER_PASSWORD to match the Clerk E2E user password.',
  },
  {
    key: 'CLERK_SECRET_KEY',
    message: 'CLERK_SECRET_KEY is missing.',
    fix: 'Set CLERK_SECRET_KEY in .env.local or .env.',
  },
  {
    key: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    message: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing.',
    fix: 'Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in .env.local or .env.',
  },
] as const;

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function requireEnv(env: EnvLike, requirement: RequiredEnvVar): string {
  const value = env[requirement.key];
  if (!value) {
    throw new Error(`${requirement.message} ${requirement.fix}`);
  }

  return value;
}

function parseCdpPort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_CDP_PORT;
  }

  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('AGENT_BROWSER_CDP_PORT must be a positive integer.');
  }

  return port;
}

export function resolveAgentBrowserCdpConfig(
  env: EnvLike,
): AgentBrowserCdpConfig {
  const username = requireEnv(env, REQUIRED_ENV_VARS[0]);
  const password = requireEnv(env, REQUIRED_ENV_VARS[1]);
  const clerkSecretKey = requireEnv(env, REQUIRED_ENV_VARS[2]);
  const clerkPublishableKey = requireEnv(env, REQUIRED_ENV_VARS[3]);
  const baseURL = stripTrailingSlash(
    env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL,
  );
  const cdpPort = parseCdpPort(env.AGENT_BROWSER_CDP_PORT);

  return {
    username,
    password,
    clerkSecretKey,
    clerkPublishableKey,
    baseURL,
    dashboardUrl: new URL('/app/dashboard', `${baseURL}/`).toString(),
    practiceUrl: new URL('/app/practice', `${baseURL}/`).toString(),
    cdpPort,
  };
}

export function formatAgentBrowserCdpInstructions(
  input: AgentBrowserCdpInstructionInput,
): string {
  return [
    'Agent-browser Clerk auth bridge is ready.',
    `CDP port: ${input.cdpPort}`,
    `Authenticated URL: ${input.authenticatedUrl}`,
    '',
    'Connect with:',
    `  agent-browser connect ${input.cdpPort}`,
    '',
    'Then open protected pages, for example:',
    `  agent-browser open ${input.practiceUrl}`,
    '',
    'Press Ctrl+C to close the authenticated browser.',
  ].join('\n');
}

function loadEnvironment(): void {
  dotenv.config({ path: '.env.local' });
  dotenv.config({ path: '.env' });
}

async function waitForShutdown(browser: Browser): Promise<void> {
  await new Promise<void>((resolve) => {
    let closing = false;

    const closeBrowser = async () => {
      if (closing) {
        return;
      }

      closing = true;
      clearInterval(keepAlive);
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigterm);

      try {
        await browser.close();
      } finally {
        resolve();
      }
    };

    const onSigint = () => {
      void closeBrowser();
    };

    const onSigterm = () => {
      void closeBrowser();
    };

    const keepAlive = setInterval(() => {}, 1_000);

    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);
  });
}

export async function runAgentBrowserCdpBridge(): Promise<void> {
  loadEnvironment();

  const config = resolveAgentBrowserCdpConfig(process.env);
  await clerkSetup();

  const { signInWithClerkPassword } = await import(
    '../tests/e2e/helpers/clerk-auth'
  );

  const browser = await chromium.launch({
    headless: true,
    args: [`--remote-debugging-port=${config.cdpPort}`],
  });

  const context = await browser.newContext({ baseURL: config.baseURL });
  const page = await context.newPage();

  try {
    await signInWithClerkPassword(page);
    await page.goto('/app/dashboard');
    await page.waitForLoadState('networkidle');

    const currentUrl = page.url();
    if (new URL(currentUrl).pathname !== '/app/dashboard') {
      throw new Error(
        `Clerk authentication did not reach /app/dashboard. Current URL: ${currentUrl}`,
      );
    }

    console.info(
      formatAgentBrowserCdpInstructions({
        cdpPort: config.cdpPort,
        authenticatedUrl: currentUrl,
        practiceUrl: config.practiceUrl,
      }),
    );

    await waitForShutdown(browser);
  } catch (error) {
    await browser.close();
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runAgentBrowserCdpBridge().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
