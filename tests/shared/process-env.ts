export type ProcessEnvSnapshot = Record<string, string | undefined>;

export function snapshotProcessEnv(): ProcessEnvSnapshot {
  return { ...process.env };
}

export function restoreProcessEnv(snapshot: ProcessEnvSnapshot) {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(snapshot)) {
    process.env[key] = value;
  }
}
