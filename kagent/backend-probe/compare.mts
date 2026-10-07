// kagent-lab 12장 — Agent와 SandboxAgent를 같은 A2A client로 호출해 latency·state를 비교한다.
// 이 code는 resource kind를 알지 못한다. TARGET 이름만 받아 같은 Agent Card와 message/send route를 쓴다.
//   TARGET=resident-echo npx tsx compare.mts
//   TARGET=sandbox-echo BURST=3 npx tsx compare.mts
import { randomUUID } from 'node:crypto';

const target = process.env.TARGET ?? 'resident-echo';
const burst = Number(process.env.BURST ?? '1');
const base = `http://localhost:8083/api/a2a/kagent/${target}/`;

async function invoke(index: number) {
  const id = randomUUID();
  const started = performance.now();
  const response = await fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'message/send',
      params: {
        id,
        message: {
          role: 'user',
          parts: [{ kind: 'text', text: `Reply with: runtime probe ${index}` }],
        },
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json() as {
    error?: { code: number; message: string };
    result?: { status?: { state?: string } };
  };
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (payload.error) throw new Error(`${payload.error.code}: ${payload.error.message}`);
  return {
    index,
    elapsedMs: Math.round(performance.now() - started),
    state: payload.result?.status?.state ?? 'unknown',
  };
}

const cardResponse = await fetch(new URL('.well-known/agent.json', base));
if (!cardResponse.ok) throw new Error(`Agent Card HTTP ${cardResponse.status}`);

const results = await Promise.all(
  Array.from({ length: burst }, (_, index) => invoke(index + 1)),
);
console.log(JSON.stringify({ target, burst, results }, null, 2));
