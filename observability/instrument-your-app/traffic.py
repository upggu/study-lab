"""Generate a baseline, an incident, and a recovery window for the lab."""

import os
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

TARGET = os.getenv("TARGET", "http://127.0.0.1:8080/checkout")
REQUESTS_PER_SECOND = 4


def send_request(sequence: int, incident: bool) -> int:
    suffix = f"?order_id=lab-{sequence:04d}"
    if incident:
        suffix += "&incident=true"
    try:
        with urlopen(TARGET + suffix, timeout=5) as response:
            return response.status
    except HTTPError as error:
        return error.code
    except URLError:
        return 0


def run_phase(name: str, seconds: int, incident_ratio: float, start: int) -> int:
    total = seconds * REQUESTS_PER_SECOND
    print(f"[{name}] {seconds}초, {total}개 요청", flush=True)
    futures = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        for offset in range(total):
            incident = incident_ratio > 0 and (offset % 4) / 4 < incident_ratio
            futures.append(pool.submit(send_request, start + offset, incident))
            time.sleep(1 / REQUESTS_PER_SECOND)
    statuses = [future.result() for future in futures]
    ok = sum(status == 200 for status in statuses)
    failed = sum(status == 503 for status in statuses)
    print(f"[{name}] 200={ok}, 503={failed}, connection_error={len(statuses) - ok - failed}", flush=True)
    return start + total


sequence = run_phase("baseline", 15, 0, 1)
sequence = run_phase("incident", 30, 0.75, sequence)
run_phase("recovery", 15, 0, sequence)
print("시나리오 완료 — Grafana에서 최근 5분을 조사하세요.", flush=True)
