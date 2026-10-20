import type { AlertIssue, AlertIssues } from './github-alert-issues';

// An in-memory issue tracker for the alert jobs' tests. Its search, like
// GitHub's, matches more than the exact title.
export class MemoryIssues implements AlertIssues {
  issues: AlertIssue[] = [];
  comments: string[] = [];
  writes = 0;
  async find(title: string) {
    return this.issues.filter((issue) => issue.title.includes(title));
  }
  async create(title: string, body: string) {
    this.issues.push({
      number: this.issues.length + 1,
      title,
      body,
      state: 'OPEN',
    });
    this.writes++;
  }
  async update(number: number, body: string) {
    const issue = this.issue(number);
    issue.body = body;
    issue.state = 'OPEN';
    this.writes++;
  }
  async comment(number: number, body: string) {
    this.issue(number);
    this.comments.push(body);
    this.writes++;
  }
  async close(number: number, comment: string) {
    this.issue(number).state = 'CLOSED';
    this.comments.push(comment);
    this.writes++;
  }
  private issue(number: number): AlertIssue {
    const issue = this.issues.find((entry) => entry.number === number);
    if (!issue) throw new Error('Missing fixture issue');
    return issue;
  }
}
