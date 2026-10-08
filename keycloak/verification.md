# Keycloak 실습 검증 기록

최신 확인일: **2026-10-05**

실제 실행한 환경과 아직 실행하지 않은 환경을 분리한다. 비밀번호·개인키와 긴 원본 로그는 기록하지 않는다.
2026-10-05 개편 이전(P03~P11, D09~D24)의 기록은 옛 구조의 이력이라 이 문서에서 제거했다. 필요하면 git 이력에서 본다.

## 2026-10-05 keycloak-config-cli 개편 (macOS)

환경: macOS 26.6 arm64, Colima 0.10.3 (4 CPU / 8 GiB), Docker Engine 29.5.2, Compose 5.5.1, buildx 0.37.
Keycloak 26.5.5, keycloak-config-cli 6.5.1-26.5.5, PostgreSQL 18.6, Samba 4.19.5. 빈 상태(새 volume 이름)에서 시작했다.

| 검사 | 상태 | 실제 결과 |
|---|---|---|
| `lab.sh up` | 통과 | CA·secret 생성, samba·postgres·keycloak healthy. Keycloak 26.5.5가 PostgreSQL 18.6에 경고 없이 기동 |
| `apply base` → `verify base` | 통과 | `study` realm과 `local-user` 생성, discovery issuer 일치 |
| `apply app-a` → `verify app-a` | 통과 | `Create client 'app-a …'`, Code + PKCE S256 로그인, 오답 거부 |
| `apply app-b` → `verify sso` | 통과 | 앱 A credential 1회 뒤 앱 B 302 로그인 |
| `apply api` → `verify api` | 통과 | role 2개·`lab-api`·audience mapper 생성, 무토큰 401, user 200, admin 403 |
| `apply ldap` → `sync` → `verify ldap` | 통과 | provider와 mapper 5개 생성, user sync added=5, alice·bob 로그인, API 403 |
| `apply groups` → `sync` → `verify groups` | 통과 | group 2개 생성, group sync updated=2(파일이 만든 group 재사용), alice 200/200, bob 200/403, groups claim |
| `apply broker` → `verify broker` | 통과 | `partner-idp` realm·client·사용자 생성, identity provider와 mapper 2개 생성, carol 200/200, dave 200/403, 오답 거부 |
| redirect 깨뜨리기 | 통과 | `/wrong-callback`으로 적용 뒤 Keycloak HTTP 400, 파일 복구·재적용 뒤 로그인 정상 |
| 콘솔식 role 회수 → apply 복원 | 통과 | Admin REST로 `app-user` 회수 뒤 user 403, `apply` 로그 `Add realm-level roles [app-user]` 뒤 200 |
| groups claim 끄기 | 통과 | `access.token.claim: "false"` 적용 뒤 alice groups claim 빈 배열, API는 200 유지, 복구 뒤 정상 |
| `--rewind` 거부 | 통과 | `apply app-a`가 현재 stage broker보다 앞이라 exit 1 |
| `down` → `up` → `verify groups`·`verify broker` | 통과 | stage 보존, 6 service 복원, 로그인·권한 동일 |
| `reset` dry run | 통과 | 삭제 대상만 출력 |
| 사이트 `npm run check` | 별도 | 컨테이너 결과의 대체 근거로 쓰지 않는다 |

개편 중 발견해 고친 것:

- realm 파일 주석에 `$(file:…)`을 적었더니 config-cli가 치환 단계에서 `NoSuchFileException: …`으로 실패했다. 치환은
  YAML 해석 전 전체 텍스트에 적용된다. 주석에서 제거했다.
- `subComponents: {}`로 LDAP provider를 적용하자 Keycloak이 자동 생성한 속성 mapper가 모두 삭제돼 user sync가
  `failed=5`였다. 필요한 mapper 5개를 파일에 명시해 해결했다.
- 로그인 검사의 오답 비밀번호 확인이 새 cookie jar로 POST해 Keycloak auth session을 잃었다. 같은 jar를 쓰도록 고쳤다.
- `kc_idp_hint`가 붙은 요청은 Keycloak이 303으로 상대 IdP로 보낸다. 검사가 로그인 폼까지 redirect를 따라가게 했다.

## 2026-10-08 회사 프록시 뒤 Ubuntu + Docker Engine (부분)

TLS 재서명 proxy 뒤의 Ubuntu에서 `CORP_CA_FILE`을 지정한 `./lab.sh up`이 통과했다(image pull·두 build·세 service healthy).
이어진 `./lab.sh apply base`는 keycloak-config-cli가 `Could not bind properties to 'KeycloakConfigProperties'`로
실패했다. 원인은 config-cli image가 `nobody`(65534)로 실행되는데 Docker Engine이 file secret을 host 소유자·0600
그대로 bind mount해 `/run/config-cli/keycloak.password`를 읽지 못한 것이다. Colima는 mount 권한을 느슨하게 보여
줘 macOS에서는 드러나지 않았다. `lab.sh`가 `LAB_UID`·`LAB_GID`로 host uid/gid를 넘겨 `config` service를 host
사용자로 실행하도록 고쳤고, macOS(uid 501)에서 `up` → `apply broker`(재적용) → `verify broker` 통과를 확인했다.
Ubuntu에서 `apply base` 이후 단계 재확인은 아직이다.

## 미실행

- **네이티브 Ubuntu 24.04 + rootful Docker Engine**: 위 부분 기록 뒤 `apply base`부터 README의 단계 순서 그대로
  재확인이 남았다. 확인할 차이는 Samba TLS key의 root 소유 복사와 config-cli의 host 사용자 실행이다.
- **브라우저 재확인**: 이전 구조에서 macOS Chrome으로 Admin Console·Account Console·앱 A 로그인을 확인한 기록이
  있다. 개편 뒤 Chrome 재확인과 `partner-idp` 로그인 버튼 화면 확인은 하지 않았다. Ubuntu NSS DB 등록도 미실행이다.
- Microsoft AD DS, 실제 AD FS, SAML brokering, 운영 HA는 범위 밖이다.
