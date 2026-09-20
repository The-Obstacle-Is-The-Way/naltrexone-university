# DEBT-475 — promotion review of partial signal failures

Date: 2026-09-20. Source tree: `c1463bd611decc2d0e86f17e62b4ee53e8f374aa`. Review: [#940 comment 4057497971](https://github.com/The-Obstacle-Is-The-Way/naltrexone-university/pull/940#discussion_r4057497971).

## Adjudication

| Claim | Verdict | Receipt |
| --- | --- | --- |
| A non-`ESRCH` failure skips later owned groups | CONFIRMED | `scripts/e2e-local-orchestrator.ts:216-230`; the initial-error probe below records only the root-group call and a surviving detached child. |
| Existing OS-error tests prove remaining-group cleanup | REFUTED | `scripts/e2e-local-orchestrator-failure.test.ts:136-155` asserts failure identity; its `finally` independently kills fixture children (`:57-63`). No mixed-group cleanup assertion exists there. |
| Collecting the first error and finishing the loop fully fixes the initial-error path | OVERSTATED | `scripts/e2e-local-orchestrator.ts:264-269` still calls `cleanup()`, which clears escalation at `:206-208`. A detached child that ignores SIGTERM still needs SIGKILL after the grace period. |
| A real OS permission denial has occurred in ordinary same-user local/CI execution | UNPROVEN | The probe deliberately injects EPERM for one owned group; it is not evidence of a spontaneous kernel permission failure. |
| A detached child always terminates after interruption | OVERSTATED | The existing normal-interruption process tests pass, but the partial-failure probes leave the independently signalable detached child alive. A group whose OS permissions reject every signal cannot be guaranteed to terminate. |

## Reproduction and real output

Run from the repository root on macOS/Linux. Save the following TypeScript block as `/tmp/debt-pr-series/signal-failure-probe.mts` (create that temporary directory if needed), then run:

```sh
pnpm exec tsx /tmp/debt-pr-series/signal-failure-probe.mts
```

The fixture starts only its own disposable Node parent and detached child. Both ignore SIGTERM. It injects a failure only at the root group, uses the real OS operation for the detached group, and inspects liveness 250 ms after rejection with a 100 ms grace period. `finally` restores the real function and kills only the recorded fixture PIDs. No app port, provider, or database is touched. The actual output at the source tree above was:

```text
[local-e2e] fault injection at SIGTERM
{"failedSignal":"SIGTERM","errorIdentityPreserved":true,"calls":[{"group":"root","signal":"SIGTERM"}],"rootAlive":true,"detachedAlive":true,"signalListeners":0}
[local-e2e] fault injection at SIGKILL
{"failedSignal":"SIGKILL","errorIdentityPreserved":true,"calls":[{"group":"root","signal":"SIGTERM"},{"group":"detached","signal":"SIGTERM"},{"group":"root","signal":"SIGKILL"}],"rootAlive":true,"detachedAlive":true,"signalListeners":0}
```

```typescript
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
const { spawnCommand } = await import(pathToFileURL(path.join(process.cwd(), 'scripts/e2e-local-orchestrator.ts')).href);
const realKill = process.kill.bind(process);
for (const failedSignal of ['SIGTERM', 'SIGKILL'] as const) {
  const directory = await mkdtemp(path.join(tmpdir(), 'promotion-signal-proof-'));
  const ready = path.join(directory, 'ready.json');
  const signals = new EventEmitter();
  const calls: {group: string, signal: string | number | undefined}[] = [];
  let pids: number[] = [];
  const failure = Object.assign(new Error('injected root-group permission failure'), {code: 'EPERM'});
  const descendant = `process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000);`;
  const parent = `process.on('SIGTERM', () => {}); const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {detached:true, stdio:['ignore','ignore','ignore','ipc']}); child.on('message', () => require('node:fs').writeFileSync(${JSON.stringify(ready)}, JSON.stringify([process.pid, child.pid])));`;
  const result = spawnCommand({label:`fault injection at ${failedSignal}`, command:process.execPath,args:['-e',parent],env:{}}, signals, 100).catch(error=>error);
  try {
    for(let attempts=0;attempts<100;attempts++) {
      try {pids=JSON.parse(await readFile(ready,'utf8'));break;} catch {await delay(20);}
    }
    if(pids.length!==2) throw new Error('fixture did not become ready');
    process.kill = ((pid: number, signal?: NodeJS.Signals | number) => {
      if(pid<0) calls.push({group:pid===-pids[0]?'root':pid===-pids[1]?'detached':'unexpected',signal});
      if(pid===-pids[0] && signal===failedSignal) throw failure;
      return realKill(pid,signal);
    }) as typeof process.kill;
    signals.emit('SIGTERM');
    const error = await result;
    await delay(250);
    const alive = pids.map(pid=> {try {realKill(pid,0);return true;} catch {return false;}});
    console.log(JSON.stringify({failedSignal, errorIdentityPreserved:error===failure,calls,rootAlive:alive[0],detachedAlive:alive[1],signalListeners:signals.listenerCount('SIGTERM')+signals.listenerCount('SIGINT')}));
  } finally {
    process.kill = realKill;
    for(const pid of pids) {try {realKill(pid,'SIGKILL');} catch {}}
    await rm(directory,{recursive:true,force:true});
  }
}
```

## Required red proof before a runtime fix

Extend the existing process fixtures with a separately detached, SIGTERM-ignoring child and a live unrelated child. Inject a root-group-only error separately on initial SIGTERM and escalated SIGKILL. Assert that the later owned group receives the relevant signal, that the detached child terminates, that the original error is returned, and that unrelated processes and listener cleanup retain their existing behavior. These cleanup assertions must fail on the current tree as the receipt above demonstrates; error identity alone already passes and adds no proof.

After repair, mutate the group loop back to throwing immediately: both remaining-group signal assertions must fail. Separately restore `cleanup(); reject(error)` in the initial-signal catch: the initial-error case must fail its escalation/descendant-termination assertion even if the loop continues. Also exercise an initial failure followed by a different escalation failure to prove the original error wins after all cleanup attempts. Never assert successful termination of the deliberately unsignalable root. Retain normal SIGINT/SIGTERM, ESRCH, early-parent-exit, unrelated-process, discovery-failure, and documented Windows-boundary coverage. These are required future proofs, not tests claimed to have shipped in this docs-only change.
