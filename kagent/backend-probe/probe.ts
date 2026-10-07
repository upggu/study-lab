// kagent-lab 7장 — backend walking skeleton.
// 관리 경로: Kubernetes API에 Agent를 server-side apply하고 Accepted·Ready condition을 읽는다.
// 호출 경로: kagent-controller 8083의 /api/a2a/{namespace}/{agent}/ route에 Agent Card 조회와
//            raw A2A message/send를 보낸다.
// 실습 code라 현재 kubeconfig를 읽는다. production Pod에서는 loadFromCluster()와 전용 ServiceAccount로 바꾼다.
import { randomUUID } from 'node:crypto';
import {
  KubeConfig,
  KubernetesObjectApi,
  PatchStrategy,
  type KubernetesObject,
} from '@kubernetes/client-node';

const namespace = 'kagent';
const agentName = 'backend-reader';
const a2aBaseUrl = process.env.KAGENT_A2A_URL ??
  `http://localhost:8083/api/a2a/${namespace}/${agentName}/`;

const kc = new KubeConfig();
kc.loadFromDefault(); // production Pod에서는 loadFromCluster()

if (kc.getCurrentContext() !== 'kind-kagent-lab') {
  throw new Error(`refusing context: ${kc.getCurrentContext()}`);
}

const objects = KubernetesObjectApi.makeApiClient(kc);

function buildManifest(): KubernetesObject {
  return {
    apiVersion: 'kagent.dev/v1alpha2',
    kind: 'Agent',
    metadata: {
      name: agentName,
      namespace,
      labels: {
        'study.upggu.com/managed-by': 'backend-probe',
      },
    },
    spec: {
      description: 'Read-only Agent managed by the backend walking skeleton.',
      type: 'Declarative',
      declarative: {
        runtime: 'go',
        modelConfig: 'default-model-config',
        systemMessage: [
          'You are a read-only Kubernetes assistant.',
          'Use a tool for current cluster facts and never mutate resources.',
        ].join('\n'),
        tools: [{
          type: 'McpServer',
          mcpServer: {
            apiGroup: 'kagent.dev',
            kind: 'RemoteMCPServer',
            name: 'kagent-tool-server',
            toolNames: [
              'k8s_get_available_api_resources',
              'k8s_get_resources',
            ],
          },
        }],
      },
    },
  };
}

// force=false: 다른 field manager가 소유한 필드를 조용히 빼앗지 않는다. 충돌(409)은 사용자에게 보여 줄 실패다.
async function applyAgent() {
  return objects.patch(
    buildManifest(),
    undefined,
    undefined,
    'kagent-lab-backend',
    false,
    PatchStrategy.ServerSideApply,
  );
}

async function waitReady(timeoutMs = 180_000) {
  const ref = {
    apiVersion: 'kagent.dev/v1alpha2',
    kind: 'Agent',
    metadata: { name: agentName, namespace },
  };
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const current = await objects.read(ref) as KubernetesObject & {
      status?: { conditions?: Array<{ type: string; status: string; reason?: string }> };
    };
    const conditions = current.status?.conditions ?? [];
    const accepted = conditions.find((item) => item.type === 'Accepted');
    const ready = conditions.find((item) => item.type === 'Ready');

    if (accepted?.status === 'False') {
      throw new Error(`Agent rejected: ${accepted.reason ?? 'unknown reason'}`);
    }
    if (ready?.status === 'True') return current;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error('Agent Ready timeout');
}

// Card의 url은 port-forward 환경에서 127.0.0.1일 수 있다. 무검증으로 따라가지 말고 capability·skill 검증에만 쓴다.
async function readAgentCard() {
  const response = await fetch(new URL('.well-known/agent.json', a2aBaseUrl));
  if (!response.ok) throw new Error(`Agent Card HTTP ${response.status}`);
  return response.json() as Promise<{ name: string; capabilities?: { streaming?: boolean } }>;
}

async function invoke(text: string) {
  const requestId = randomUUID();
  const response = await fetch(a2aBaseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method: 'message/send',
      params: {
        id: requestId,
        message: {
          role: 'user',
          parts: [{ kind: 'text', text }],
        },
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`A2A HTTP ${response.status}`);

  const payload = await response.json() as {
    error?: { code: number; message: string };
    result?: { status?: { state?: string }; artifacts?: Array<{
      parts?: Array<{ kind?: string; text?: string }>;
    }> };
  };
  if (payload.error) throw new Error(`A2A ${payload.error.code}: ${payload.error.message}`);
  return payload.result;
}

await applyAgent();
const ready = await waitReady();
const card = await readAgentCard();
const result = await invoke(
  'List the Services in the kagent namespace. Use a tool and cite the evidence.',
);

console.log(JSON.stringify({
  agentUid: ready.metadata?.uid,
  cardName: card.name,
  streaming: card.capabilities?.streaming,
  taskState: result?.status?.state,
  artifacts: result?.artifacts,
}, null, 2));
