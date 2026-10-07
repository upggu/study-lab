# kagent lab

[kagent 실습 덱](https://study.upggu.com/kagent-lab/)이 인용하는 manifest와 backend probe code다.
실행 순서·기대 상태·실패 시 볼 곳은 덱의 각 장이 설명하고, 이 폴더는 파일의 정본만 둔다.

전제: 전용 kind cluster `kagent-lab`, context `kind-kagent-lab`, namespace `kagent`,
kagent `0.9.9`(demo profile), Agent Substrate `0.0.6`. 모든 `kubectl` 명령은 현재 context가
`kind-kagent-lab`일 때만 실행한다.

```bash
git clone https://github.com/upggu/study-lab.git
cd study-lab/kagent
kubectl config current-context   # kind-kagent-lab
```

## 파일 구조

```text
model/litellm-provider.yaml             1장  UI model 목록용 ModelProviderConfig (사내 LiteLLM 선택 경로)
agents/lab-reader.yaml                  3장  조회 tool 둘만 허용한 Declarative Agent
mcp/mcp-website-fetcher.yaml            4장  공식 입문 예제의 fetch MCPServer (kmcp v1alpha1)
agents/simple-fetch-agent.yaml          4장  fetch tool 하나만 allowlist에 넣은 Agent
agents/broken-model-agent.yaml          6장  잘못된 modelConfig 참조 — 진단 뒤 삭제
backend-probe/                          7·8·12장  Node/TypeScript backend walking skeleton
  probe.ts                                7장  SSA apply → Ready 대기 → Agent Card → A2A message/send
  policy.test.ts                          8장  Grant·session ownership 불변조건 test
  compare.mts                             12장 Agent ↔ SandboxAgent 같은 A2A client 비교
rbac/agent-backend.yaml                 8장  backend ServiceAccount의 namespaced 최소 권한
network/controller-approved-callers.yaml 8장  controller 8083 ingress를 승인 caller로 제한 (staging 예시)
agents/lab-byo-openai.yaml              9장  BYO Agent — OpenAI 직접 연결
agents/lab-byo-litellm.yaml             9장  BYO Agent — LiteLLM gateway 연결
byo/litellm-create-model.py             9장  generated ADK code의 create_model() 교체본
byo/litellm-compose-environment.yaml    9장  generated compose에 더할 environment 항목
staging/values-staging.yaml             10장 온프렘 staging values 검토 시작점
agents/resident-echo.yaml               12장 A/B fixture — 일반 Agent
agents/sandbox-echo.yaml                12장 A/B fixture — SandboxAgent
decision-record.template.yaml           13장 도입 판정 decision record template
```

## 적용 예

manifest는 `kubectl apply -f`로 적용한다. 덱의 장 순서대로 적용하며, 앞 장이 만든 resource(`default-model-config`,
`kagent-tool-server`, WorkerPool 등)가 있어야 뒤 장의 Agent가 `Ready`가 된다.

```bash
kubectl apply -f agents/lab-reader.yaml
kubectl -n kagent wait --for=condition=Ready agent/lab-reader --timeout=3m
```

`model/litellm-provider.yaml`의 `${LITELLM_BASE_URL}`은 shell 변수 값으로 치환해 적용한다.

```bash
sed "s|\${LITELLM_BASE_URL}|${LITELLM_BASE_URL}|" model/litellm-provider.yaml | kubectl apply -f -
```

## backend probe

Node.js 20 이상이 필요하다. `@kubernetes/client-node`는 cluster Kubernetes version과
[호환되는 release](https://github.com/kubernetes-client/javascript#compatibility)로 `package.json`에 고정돼 있다.

```bash
cd backend-probe
npm install
npm test                                  # 8장 policy.test.ts — cluster 없이 실행 가능
kubectl -n kagent port-forward svc/kagent-controller 8083:8083   # 별도 terminal
KAGENT_A2A_URL="http://localhost:8083/api/a2a/kagent/backend-reader/" npx tsx probe.ts   # 7장
TARGET=resident-echo npx tsx compare.mts   # 12장
TARGET=sandbox-echo BURST=3 npx tsx compare.mts
```

`probe.ts`는 현재 kubeconfig context가 `kind-kagent-lab`이 아니면 바로 중단한다.

## 비밀 값

API key·virtual key·CA 파일 경로는 shell 환경 변수(`OPENAI_API_KEY`, `LITELLM_API_KEY`, `LITELLM_BASE_URL`,
`LITELLM_MODEL`, `LITELLM_CA_FILE`)로만 다루고, Kubernetes Secret은 덱 본문의 `kubectl create secret ... --dry-run=client -o yaml | kubectl apply -f -`
명령으로 만든다. 이 저장소의 어떤 파일에도 key 값을 적지 않는다.
