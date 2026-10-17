import { parse } from 'yaml';
import { workflowImages } from './workflow-files';

type Env = Record<string, string>;
type Step = { run?: string; env?: Env; 'timeout-minutes'?: number };
type Workflow = {
  env?: Env;
  jobs?: Record<string, { env?: Env; steps?: Step[] }>;
};
type Service = {
  image?: string;
  depends_on?: Record<string, unknown> | string[];
};

// These guards deliberately support the repository's explicit shell commands,
// not arbitrary shell evaluation. Keep image names and repository lists literal.
// Join continued lines before inspecting each command, including chained ones.
export function shellCommands(source: string): string[] {
  return source
    .replace(/\\\r?\n/g, ' ')
    .split(/\n|&&|\|\||;/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function words(command: string): string[] {
  return (command.match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? []).map((word) =>
    word.replace(/^(["'])(.*)\1$/, '$2'),
  );
}

export function helperRepositoryErrors(source: string): string[] {
  return shellCommands(source).flatMap((command) => {
    const tokens = words(command);
    const cli = tokens.indexOf('scripts/ci/pull-image.sh');
    const sourced = tokens.indexOf('pull_image');
    if (cli < 0 && sourced < 0) return [];
    const args = tokens.slice(cli >= 0 ? cli + 1 : sourced + 1);
    if (cli >= 0 && args[0] !== '--env')
      return [`Explicit --env required: ${command}`];
    const repositories = args.slice(cli >= 0 ? 4 : 2);
    const literal = repositories.every((repo) =>
      /^[a-z0-9.-]+(?::\d+)?\/[a-z0-9._/-]+$/.test(repo),
    );
    return literal &&
      new Set(repositories.map((repo) => repo.split('/')[0])).size >= 2
      ? []
      : [`At least two literal registry repositories required: ${command}`];
  });
}

export function workflowImageErrors(source: string, composeSource: string) {
  const errors = {
    direct: [] as string[],
    pullPolicy: [] as string[],
    compose: [] as string[],
    repositories: [] as string[],
  };
  const workflow = parse(source) as Workflow;
  const services = (
    parse(composeSource) as { services: Record<string, Service> }
  ).services;
  // Declarative containers pull before steps can run the helper.
  errors.direct.push(
    ...workflowImages(source).map(
      (image) => `Declarative image bypasses failover: ${image}`,
    ),
  );
  for (const job of Object.values(workflow.jobs ?? {})) {
    const pulled = new Map<string, string>();
    for (const step of job.steps ?? []) {
      const env = { ...workflow.env, ...job.env, ...step.env };
      errors.repositories.push(...helperRepositoryErrors(step.run ?? ''));
      for (const command of shellCommands(step.run ?? '')) {
        if (
          /\bdocker\s+(pull|run|create)\b|\bdocker\s+compose\b[^\n]*\bpull\b(?!\s+never)/.test(
            command.replace(/--pull(?:=|\s+)never/g, ''),
          )
        ) {
          errors.direct.push(command);
        }
        const tokens = words(command);
        const helper = tokens.indexOf('scripts/ci/pull-image.sh');
        if (helper >= 0) {
          const [flag, name, , digest] = tokens.slice(helper + 1);
          const variable = digest?.match(/^\$\{?(\w+)\}?$/)?.[1];
          const resolved = variable ? env[variable] : digest;
          if (
            flag === '--env' &&
            name &&
            resolved &&
            /^sha256:[0-9a-f]{64}$/.test(resolved) &&
            (step['timeout-minutes'] ?? 0) > 0
          )
            pulled.set(name, resolved);
        }
        const docker = tokens.indexOf('docker');
        if (
          docker >= 0 &&
          (tokens[docker + 1]?.startsWith('-') ||
            (tokens[docker + 1] === 'compose' &&
              tokens[docker + 2]?.startsWith('-')))
        ) {
          errors.direct.push(
            `Unsupported Docker form; use explicit audited commands: ${command}`,
          );
        }
        if (docker < 0 || tokens[docker + 1] !== 'compose') continue;
        const action = tokens[docker + 2];
        if (!['up', 'create', 'run'].includes(action ?? '')) continue;
        if (
          !tokens.includes('--pull=never') &&
          !tokens.some(
            (token, i) => token === '--pull' && tokens[i + 1] === 'never',
          )
        )
          errors.pullPolicy.push(command);
        // Select services from explicit operands. No operands means all services.
        const named = tokens
          .slice(docker + 3)
          .filter((token) => token in services);
        const selected = new Set(named.length ? named : Object.keys(services));
        if (!tokens.includes('--no-deps')) {
          for (const name of selected) {
            const deps = services[name]?.depends_on ?? {};
            for (const dependency of Array.isArray(deps)
              ? deps
              : Object.keys(deps))
              selected.add(dependency);
          }
        }
        for (const name of selected) {
          const image = services[name]?.image ?? '';
          const match = image.match(
            /^\$\{([A-Z][A-Z0-9_]*_IMAGE_REPOSITORY):-([^@\s}]+)\}@(sha256:[0-9a-f]{64})$/,
          );
          if (!match?.[1] || pulled.get(match[1]) !== match[3])
            errors.compose.push(
              `${name}: ${image} has no preceding bounded helper pull with matching repository variable and digest`,
            );
        }
      }
    }
  }
  return errors;
}
