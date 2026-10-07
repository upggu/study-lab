# Observability 내 앱 계측 실습

관측 덱 11장에서 쓰는 작은 Flask `checkout` 앱과 고정 시나리오 트래픽 스크립트다.
앱은 host에서 실행하고, 8장에서 띄운 공식 LGTM 스택(kind)의 port-forward를 통해
OTLP로 메트릭·로그·트레이스를 보낸다. 쿠버네티스 매니페스트와 설치 wrapper는 두지 않는다.

실행 순서와 관찰 포인트는 스터디 사이트 문서를 따른다.

- [8. 실습 준비](https://study.upggu.com/observability/08-lab-setup/) — LGTM 스택과 port-forward
- [11. 내 앱 계측하기](https://study.upggu.com/observability/11-instrument-your-app/) — 이 디렉터리의 사용법

빠른 요약은 다음과 같다.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
opentelemetry-bootstrap -a install
# 환경변수는 11장 본문을 따른 뒤
opentelemetry-instrument flask --app app run --host 127.0.0.1 --port 8080
# 다른 터미널에서
python3 traffic.py
```

의존성은 `Flask==3.1.3` + `opentelemetry-distro[otlp]==0.65b0`으로 고정한다.
이 조합이 내는 메트릭 이름(`http_server_duration_milliseconds_*`)을 문서의 질의가
그대로 쓰므로, 버전을 올리면 문서의 질의를 다시 검증한다.
