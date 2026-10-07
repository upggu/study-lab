# Keycloak lab

Keycloak·PostgreSQL·앱 A/B·API·Samba AD DC를 Compose project 하나에서 실행한다. **우리 realm의 설정은 전부
`realm/study/<단계>.yaml`에 있고 [keycloak-config-cli](https://github.com/adorsys/keycloak-config-cli)가 적용한다.**
Samba(디렉터리 팀의 AD DS 대역)와 `partner-idp` realm(IdP 운영팀의 AD FS 대역)은 상대 부서 환경의 대역이고,
우리는 그쪽이 준 값만 파일에 넣는다.

학습 본문은 사이트의 [Keycloak 실습 덱](https://study.upggu.com/keycloak-lab/)이다. 이 README는 명령과
파일 구조의 정본이다.

## 시작

```bash
git clone https://github.com/upggu/study-lab.git
cd study-lab/keycloak
./lab.sh up            # CA·secret 생성, samba·postgres·keycloak 기동
./lab.sh apply base    # realm/study/base.yaml 적용: study realm과 local-user
./lab.sh verify base
```

runtime 준비(Colima 또는 Docker Engine, Compose·buildx plugin)와 브라우저 설정(hosts·프록시 예외·CA)은
[실습 환경 준비](https://study.upggu.com/keycloak-lab/lab-setup/)와 lab-environment 덱을 따른다.

회사 프록시 뒤에서 image build(`apt-get`, `npm ci`)가 TLS 재서명 proxy를 거친다면 CA PEM 경로를 넘긴다.
pull은 Docker daemon의 proxy 설정을, build는 shell의 `HTTP_PROXY`·`HTTPS_PROXY`·`NO_PROXY`를 build arg로 받는다.

```bash
export CORP_CA_FILE=/path/to/corporate-proxy-ca.crt
./lab.sh up
```

## 단계

각 단계는 **파일 diff → apply → (sync) → verify** 순서다. 파일은 누적형이라 `diff`가 그 단계의 증분이다.

```bash
diff realm/study/base.yaml realm/study/app-a.yaml
./lab.sh apply app-a  && ./lab.sh verify app-a
./lab.sh apply app-b  && ./lab.sh verify sso
./lab.sh apply api    && ./lab.sh verify api
./lab.sh apply ldap   && ./lab.sh sync && ./lab.sh verify ldap
./lab.sh apply groups && ./lab.sh sync && ./lab.sh verify groups
./lab.sh apply broker && ./lab.sh verify broker
```

| 단계 | 파일이 추가하는 것 | 새로 뜨는 service | verify가 확인하는 것 |
|---|---|---|---|
| `base` | `study` realm, `local-user` | - | discovery issuer |
| `app-a` | confidential client `app-a` (Code + PKCE S256, callback 하나) | app-a | local-user 로그인, 오답 거부 |
| `app-b` | client `app-b` | app-b | 앱 A 로그인 뒤 앱 B 무비밀번호 로그인 |
| `api` | realm role, local-user의 role, bearer-only `lab-api`, audience mapper | api | 무토큰 401, user 200, admin 403 |
| `ldap` | LDAPS User Federation `samba-ad`와 속성 mapper | - | alice·bob 로그인, API 403 |
| `groups` | group과 role 상속, LDAP group mapper, groups claim mapper | - | alice 200/200, bob 200/403, groups claim |
| `broker` | `partner-idp` realm(상대 대역), identity provider, claim→role mapper | - | carol 200/200, dave 200/403 via partner 로그인 |

`apply`는 `docker compose run --rm config`로 keycloak-config-cli를 실행한다. 로그에 생성·갱신·삭제한 객체가
한 줄씩 남는다. 순서를 건너뛰면 거부하고, 앞 단계 파일은 뒤 객체를 지우므로 `--rewind`를 붙여야 적용한다.
`sync`는 `samba-ad`의 full user sync와 `lab-groups` mapper의 group sync를 Admin REST로 호출하는 동작이다.

## 파일 구조

```text
lab.sh                 up · apply · sync · verify · status · down · reset
compose.yaml           samba · postgres · keycloak · app-a · app-b · api, 도구 config(config-cli) · check
realm/study/*.yaml     우리 realm의 선언 (누적형 단계 파일)
realm/partner-idp.yaml 상대 IdP 등록부의 대역 (우리 Keycloak이 relying party로 등록된 모습)
app/                   server.mjs(앱 A/B) · api.mjs(API) · Dockerfile
samba/                 Samba AD DC image · provision entrypoint · 사용자·group seed · verify-directory
checks/                login-check.mjs(verify) · sync.mjs(sync)
tools/                 prepare-state.sh(CA·secret) · compose.sh · keycloak/config-cli entrypoint · common.sh
.state/                Git 제외: secrets/ web-ca/ directory-ca/ build/ stage (tools/는 macOS Compose binary)
```

realm 파일의 `$(file:UTF-8:/run/secrets/<이름>)`은 config-cli 변수 치환이다. 같은 이름의 secret이
`.state/secrets/`에 있고 `compose.yaml`이 필요한 service에 mount한다. 치환은 YAML 해석 전에 파일 전체 텍스트에
적용되므로 주석에도 이 표기를 쓰지 않는다.

## 브라우저

| 화면 | 주소 | 계정 (비밀번호 파일은 `.state/secrets/`) |
|---|---|---|
| Admin Console | `https://keycloak.keycloak.test:30080/admin/` | `lab-admin` (`keycloak-admin-password`) |
| Account Console | `https://keycloak.keycloak.test:30080/realms/study/account/` | `local-user`, `alice`, `bob` |
| 앱 A / 앱 B | `https://app-a.keycloak.test:30081/`, `https://app-b.keycloak.test:30082/` | 위 사용자, `broker`부터 `carol`·`dave` |

hosts 항목 `127.0.0.1 keycloak.keycloak.test app-a.keycloak.test app-b.keycloak.test`, 브라우저 프록시 예외
`*.keycloak.test`, 선택으로 web CA `.state/web-ca/ca.crt`(nickname `keycloak-lab-web-ca`) 등록이 필요하다.
Samba는 웹 콘솔이 없다. `docker exec keycloak-lab-samba samba-tool user list`처럼 container 안에서 본다.

## 중단·재개·초기화

```bash
./lab.sh down                                  # container·network만 내림. volume·.state·stage 보존
./lab.sh up                                    # 기록된 stage의 service를 다시 띄움. 설정 재적용 없음
./lab.sh reset                                 # 삭제 대상만 출력
./lab.sh reset --confirm DELETE-keycloak-lab   # container·network·두 volume·.state의 CA·secret·stage 삭제
```

`.state/`만 지우면 volume 안의 DB·Samba 비밀번호와 어긋나 기동이 실패한다. 반드시 `reset`을 쓴다. reset은 image와
build cache, 다른 Docker project를 건드리지 않는다. web CA를 브라우저에 등록했다면 reset 뒤 다시 등록한다.

## 더 읽기

- 결정과 고정 버전: [decisions.md](decisions.md)
- 실제 검증 결과와 미실행 범위: [verification.md](verification.md)
- 공통 환경 준비: [Docker Compose 실습 환경](https://study.upggu.com/lab-environment/docker-compose/),
  [로컬 HTTPS 실습을 브라우저로 보기](https://study.upggu.com/lab-environment/local-https-browser/)
