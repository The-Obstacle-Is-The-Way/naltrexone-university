import type { Gh } from '../lib/github-cli.mts';

// Endpoint fixtures describe API response shapes. Only mutations needed by the
// command contracts have state: PR bodies, comments and head-bound merges.
// This is not a simulator of GitHub's protection or review policy.
export class ReviewHost {
  constructor(readonly events: Array<{ file: string; args: string[] }> = []) {}
  readonly prs = new Map<string, Record<string, unknown>>();
  readonly api = new Map<string, unknown>();
  readonly bodies = new Map<string, string>();
  readonly calls: Array<{ args: string[]; input: string | undefined }> = [];
  readonly comments: Array<{ number: string; body: string }> = [];
  readonly merges: Array<{ number: string; head: string; body: string }> = [];
  ignoreEdits = false;
  afterEdit?: (number: string) => void;

  gh: Gh = (args, input) => {
    this.calls.push({ args: [...args], input });
    this.events.push({ file: 'gh', args: [...args] });
    if (args[0] === 'api') {
      if (args[1] === 'graphql') {
        const number = args.find((arg) => arg.startsWith('number='))?.slice(7);
        if (!number || !this.prs.has(number))
          throw new Error(`Unexpected PR read: ${number}`);
        return JSON.stringify({
          data: { repository: { pullRequest: this.prs.get(number) } },
        });
      }
      const endpoint = args[1] === '--paginate' ? args[3] : args[1];
      if (!endpoint || !this.api.has(endpoint))
        throw new Error(`Unexpected API request: ${endpoint}`);
      return JSON.stringify(this.api.get(endpoint));
    }
    const number = args[2];
    if (args[0] !== 'pr' || !number)
      throw new Error(`Unexpected command: ${args.join(' ')}`);
    if (args[1] === 'view') return this.bodies.get(number) ?? '';
    if (args[1] === 'edit') {
      if (!this.ignoreEdits) this.bodies.set(number, input ?? '');
      this.afterEdit?.(number);
      return '';
    }
    if (args[1] === 'comment') {
      this.comments.push({ number, body: input ?? '' });
      return '';
    }
    if (args[1] === 'merge') {
      const head = args[args.indexOf('--match-head-commit') + 1];
      if (
        !head ||
        !args.includes('--match-head-commit') ||
        head !== this.prs.get(number)?.headRefOid
      )
        throw new Error('Head changed');
      this.merges.push({ number, head, body: this.bodies.get(number) ?? '' });
      return 'merged\n';
    }
    throw new Error(`Unexpected command: ${args.join(' ')}`);
  };
}

export class GitHistory {
  constructor(readonly events: Array<{ file: string; args: string[] }> = []) {}
  readonly calls: string[][] = [];
  readonly replies = new Map<string, string>();
  ancestryError?: Error;
  run = (args: string[]): string => {
    this.calls.push([...args]);
    this.events.push({ file: 'git', args: [...args] });
    if (args.join(' ') === 'fetch --quiet origin') return '';
    if (args[1] === 'merge-base' && args[2] === '--is-ancestor') {
      if (this.ancestryError) throw this.ancestryError;
      return '';
    }
    const reply = this.replies.get(args.join(' '));
    if (reply === undefined)
      throw new Error(`Unexpected Git command: ${args.join(' ')}`);
    return reply;
  };
}
