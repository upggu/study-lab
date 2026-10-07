# study-lab

[스터디 노트 사이트](https://study.upggu.com)의 실습 덱이 쓰는 실행 코드·manifest·스크립트를 모아 둔 공개 저장소다.
학습 본문(왜·무엇을·어떻게 확인하나)은 사이트에 있고, 이 저장소는 **그 본문이 인용하는 파일의 정본**이다.
사이트의 `study-starlight` 저장소는 비공개라 실습 코드를 여기로 분리했다.

| 폴더 | 사이트 덱 | 내용 |
|---|---|---|
| [`kagent/`](kagent/) | [kagent 실습](https://study.upggu.com/kagent-lab/) | Agent·MCPServer·RBAC·NetworkPolicy manifest, Node/TypeScript backend probe, staging values |
| [`keycloak/`](keycloak/) | [Keycloak 실습](https://study.upggu.com/keycloak-lab/) | Keycloak·Samba AD DC·앱·API Compose 환경과 keycloak-config-cli realm 파일 |
| [`observability/`](observability/) | [관측 가능성 11장](https://study.upggu.com/observability/11-instrument-your-app/) | OpenTelemetry 계측 학습용 Flask 앱과 트래픽 스크립트 |

각 폴더의 README가 명령과 파일 구조의 정본이다. 실행 순서·관찰 포인트·판정 기준은 사이트 본문을 따른다.

## 규칙

- 공개 저장소다. 특정 조직에만 해당하는 이름·주소·수량·결정은 적지 않고 `example.com` 같은 예시 값을 쓴다.
- API key·비밀번호·개인키·token은 파일에 넣지 않는다. shell 환경 변수나 Git 제외 `.state/`에서 Secret으로 넘긴다.
- 폴더 이름은 사이트 덱 이름과 맞춘다. 파일을 옮기거나 이름을 바꾸면 사이트 본문의 링크도 함께 고친다.
