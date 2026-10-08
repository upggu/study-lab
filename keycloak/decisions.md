# Keycloak 실습 환경 결정

확인일: **2026-10-05**

이 문서는 구현이 임의로 바꾸지 않을 실습 환경 계약이다. 실제 실행 결과와 미검증 사항은 `verification.md`에 둔다.
2026-10-05 개편에서 lab을 처음부터 다시 만들었다. 이전 구조(Admin REST 적용 코드 `internal/`, lab 전용 JSON,
P/D 번호 검증 스크립트)는 제거했고 과거 실행 기록은 이력으로만 남는다.

## 설정 적용 방식

- **적용 도구는 keycloak-config-cli다.** 파일은 Keycloak realm export와 같은 형식이라 콘솔·Admin REST와 필드
  이름이 같고, state 파일이나 새 언어가 필요 없다. Terraform provider는 팀이 Terraform을 쓸 때의 대안으로 본문에서
  비교만 한다.
- **단계 파일은 누적형**이다(`realm/study/base.yaml` … `broker.yaml`). config-cli는 파일을 realm 전체의 원하는 상태로
  보고 자기가 만든 객체 중 파일에서 빠진 것을 지운다. 증분 파일로 나누면 이 규칙과 충돌한다.
- `IMPORT_CACHE_ENABLED=false`: 파일 checksum이 같아도 매번 대조해 콘솔에서 바꾼 값을 되돌린다.
- `IMPORT_VARSUBSTITUTION_ENABLED=true`: secret은 `$(file:UTF-8:/run/secrets/<이름>)`으로 치환한다. 치환은 YAML
  해석 전 전체 텍스트에 적용되므로 주석에 이 표기를 쓰지 않는다. secret 파일은 **줄바꿈 없이** 생성한다.
- config-cli 관리자 비밀번호는 Spring `configtree`(`/run/config-cli/keycloak.password`)로 넘긴다. 환경 변수에
  secret을 두지 않는다.
- config-cli는 web CA를 PKCS12 truststore로 받아 HTTPS를 검증한다. 호스트 LibreSSL로는 Java가 읽는 trusted 속성을
  만들 수 없어 container entrypoint가 `keytool`로 만든다.
- LDAP provider의 `subComponents`는 파일대로 맞춰진다. Keycloak이 자동 생성하는 속성 mapper도 파일에 없으면
  지워지므로 username·first name·last name·email·MSAD account controls를 명시한다.
- `realmRoles`는 목록 그대로 맞춰지므로 사용자에 `default-roles-study`를 함께 적는다.
- LDAP user·group sync는 `checks/sync.mjs`가 Admin REST로 호출한다. config-cli의
  `IMPORT_BEHAVIORS_SYNC_USER_FEDERATION`은 쓰지 않는다(선언과 동작의 분리).
- 상대 IdP 대역은 같은 Keycloak의 `partner-idp` realm이다. 두 번째 Keycloak container는 8 GiB 계약을 넘긴다.
  `apply broker`는 `partner-idp.yaml` 뒤 `study/broker.yaml`을 한 config-cli 실행에서 순서대로 적용한다.
- stage는 `.state/stage`에 기록한다. 앞 단계 파일 적용은 `--rewind` 없이는 거부한다.

## 지원 범위

- **64-bit macOS + Colima의 Docker runtime**과 **64-bit Ubuntu 24.04 LTS + rootful Docker Engine**을 지원한다.
  Docker Desktop, rootless Docker, Windows/WSL은 기본 지원 범위가 아니다. CPU는 linux/amd64·linux/arm64.
- runtime 계약은 4 logical CPU, 8 GiB RAM. `lab.sh up`이 Docker가 보고하는 값을 확인한다.
- Compose project와 bridge 이름은 `keycloak-lab`, subnet `172.30.0.0/24`. kind·kubectl은 쓰지 않는다.
- Ubuntu에서 TLS 재서명 proxy를 지원한다. pull은 daemon `proxies`, build의 `apt-get`·`npm ci`는 shell proxy 변수를
  null build arg로 받고(미설정이면 생략), proxy CA는 `CORP_CA_FILE` → `.state/build/corporate-proxy-ca.crt` 복사본을
  BuildKit secret으로 모든 build에 mount한다. 완성 image에는 넣지 않는다. 그래서 `docker buildx`가 필요하다.
- Samba는 `tls keyfile`이 root 소유 0600이어야 한다. Docker Engine의 file secret은 host 소유자를 유지하므로
  entrypoint가 시작마다 root 소유 복사본을 만든다.
- 같은 이유로 keycloak-config-cli(image 기본 사용자 `nobody` 65534)는 0600 secret을 읽지 못해
  `Could not bind properties to 'KeycloakConfigProperties'`로 실패한다. `lab.sh`가 `LAB_UID`·`LAB_GID`로 host
  uid/gid를 넘겨 `config` service를 host 사용자로 실행한다. Colima는 mount 권한을 느슨하게 보여 줘 macOS에서는
  드러나지 않았다. Keycloak(uid 1000)·앱(`node`, uid 1000)은 host 사용자가 uid 1000인 일반 Ubuntu에서 그대로 읽는다.
- macOS에 Compose plugin이 없으면 `tools/compose.sh`가 checksum을 고정한 공식 standalone binary 5.5.1을
  `.state/tools/`에 받는다.

## 이미지 고정

tag와 digest를 함께 쓴다. tag는 사람이 읽는 이름이고 digest가 내용을 고정한다.

| 용도 | 고정 입력 | 선택 근거 |
|---|---|---|
| Keycloak | `quay.io/keycloak/keycloak:26.5.5@sha256:a7b0cb7a43a1235a61872883414d3f1d9a3ceac9df6e5907bd12202778a6265c` | keycloak-config-cli 6.5.1이 이 버전으로 빌드됐다. 26.5.6·26.5.7도 있으나 적용 도구와 같은 patch를 쓴다 |
| keycloak-config-cli | `adorsys/keycloak-config-cli:6.5.1-26.5.5@sha256:0955d98c8a341898b7aa177477edf8a1e90569ae50bbe7598141c1270b773274` | 2026-05-22 릴리스. runtime `eclipse-temurin:21-jre`, user 65534 |
| PostgreSQL | `postgres:18.6-bookworm@sha256:1c59e2c3c818eaa0f0628f695b36e7c9e362d6b219b36a54a32df645cbd7e1af` | Keycloak 문서의 PostgreSQL 18.x 지원. 26.5.5 기동 로그에 경고 없음 확인 |
| Samba base | `ubuntu:24.04@sha256:224a1869083a311ef3f13648a154ba79832fbef6364d31493642ca03082da254` + Ubuntu snapshot `20260913T000000Z`, `samba-ad-dc 2:4.19.5+dfsg-4ubuntu9.7` | Ubuntu 공식 AD DC 절과 같은 패키지를 로컬 빌드 |
| 앱 base | `node:24.21.0-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553` | LTS Node 24 |

Samba image는 `samba-tool domain provision --server-role=dc --use-rfc2307 --dns-backend=SAMBA_INTERNAL`을 entrypoint에서
실행하고 `samba --foreground --no-process-group`을 PID 1로 둔다. provision의 SYSVOL ACL이 `security.*` xattr를 쓰므로
`SYS_ADMIN` capability 하나만 추가한다. privileged·host network·Docker socket은 쓰지 않는다.

## 이름·네트워크·주소

| 대상 | 고정값 | 노출 |
|---|---|---|
| Samba DC | `keycloak-lab-samba`, `172.30.0.10`, `dc1.ad.keycloak.test`, realm `AD.KEYCLOAK.TEST`, base DN `DC=ad,DC=keycloak,DC=test` | bridge 내부만 |
| Keycloak | `keycloak-lab-keycloak`, `172.30.0.20`, `keycloak.keycloak.test` | HTTPS `30080`을 `127.0.0.1:30080`에 publish |
| realm | `study`(우리), `partner-idp`(상대 대역), `master`(bootstrap admin `lab-admin`) | - |
| 공개 issuer | `https://keycloak.keycloak.test:30080/realms/study` | browser와 container가 같은 문자열 |
| 앱 A / B | `app-a.keycloak.test:30081`, `app-b.keycloak.test:30082`, callback `/callback` | loopback publish |
| API | `api:3000`, audience `lab-api` | bridge 내부만 |
| LDAPS | `ldaps://dc1.ad.keycloak.test:636` | Federation의 유일한 경로 |
| PostgreSQL | `postgres:5432` | bridge 내부만 |
| volume | `keycloak-lab-samba-dc`, `keycloak-lab-keycloak-db` | 2026-10-05 개편에서 새 이름. 이전 `keycloak-lab-*-data`는 26.7.3 schema라 재사용하지 않음 |

`.test`는 RFC 2606의 시험용 TLD다. Keycloak은 TLS를 직접 종료하고 `KC_HOSTNAME`·`KC_HTTPS_PORT`를 고정한다. reverse
proxy·`proxy-headers`·`hostname-strict=false`는 쓰지 않는다. Docker network alias로 container의
`keycloak.keycloak.test`는 Keycloak IP로, host의 같은 이름은 hosts 항목으로 loopback으로 해석된다.

## 실습 계정

| realm | 사용자 | 원본 | 권한 입력 |
|---|---|---|---|
| study | `local-user` | realm 파일 | `app-user` |
| study (LDAP) | `alice`, `bob` | Samba `app-users`(둘), `api-admins`(alice) | group → role |
| partner-idp | `carol`, `dave` | partner realm, `partner-admins`(carol) | groups claim → role mapper |

비밀번호는 모두 `.state/secrets/`의 file secret이다. 문서·로그·명령줄에 쓰지 않는다.
