import { globSync } from 'node:fs';
import { parse } from 'yaml';

// GitHub Actions reads both extensions, so every workflow contract
// discovers both (#1444 review).
export function workflowFiles(directory = '.github/workflows'): string[] {
  return globSync(`${directory}/*.{yml,yaml}`).sort();
}

type WorkflowImageJob = {
  container?: string | { image?: string };
  services?: Record<string, { image?: string }>;
  steps?: { uses?: string }[];
};

// Every image a workflow runs: service images, job containers in both
// forms, and `docker://` step actions.
export function workflowImages(text: string): string[] {
  const jobs = Object.values(
    (parse(text) as { jobs?: Record<string, WorkflowImageJob> } | null)?.jobs ??
      {},
  );
  return jobs.flatMap((job) =>
    [
      ...Object.values(job.services ?? {}).map((service) => service.image),
      ...(job.steps ?? []).map((step) =>
        step.uses?.startsWith('docker://')
          ? step.uses.slice('docker://'.length)
          : undefined,
      ),
      typeof job.container === 'string' ? job.container : job.container?.image,
    ].filter((image): image is string => typeof image === 'string'),
  );
}
