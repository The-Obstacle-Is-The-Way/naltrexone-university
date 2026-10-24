// DEBT-515: how a CodeRabbit reply shows that it recorded a learning. The merge
// command and the weekly review job read replies with the same marker, so they
// agree on what counts. Replies that only cite learnings CodeRabbit already
// holds say "Learnings used" instead. With `approval_delay` set, CodeRabbit
// labels a held one "Learnings added — pending approval".
export const LEARNING_RECORDED =
  /<summary>[^<]*Learnings added[^<]*<\/summary>/;

// The text of each learning a reply records, on one line.
export function recordedLearnings(body: string): string[] {
  const start = body.search(LEARNING_RECORDED);
  if (start < 0) return [];
  const section = body.slice(start).split('</details>')[0] ?? '';
  return [
    ...section.matchAll(/^Learning:\s*([\s\S]*?)\s*(?=^```|^Learnt from:)/gm),
  ]
    .map((match) => (match[1] ?? '').replace(/\s+/g, ' ').trim())
    .filter((learning) => learning.length > 0);
}
