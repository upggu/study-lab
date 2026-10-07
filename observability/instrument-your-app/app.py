"""Small instrumented service used by the observability instrumentation lab."""

import logging
import time
from uuid import uuid4

from flask import Flask, jsonify, request
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("checkout")
tracer = trace.get_tracer("observability-lab.checkout")


@app.get("/health")
def health():
    """Liveness endpoint, excluded from instrumentation via OTEL_PYTHON_EXCLUDED_URLS."""
    return {"status": "ok"}


@app.get("/checkout")
def checkout():
    """Reserve inventory and return either a completed order or a timeout."""
    order_id = request.args.get("order_id") or str(uuid4())[:8]
    incident = request.args.get("incident") == "true"

    with tracer.start_as_current_span("inventory.reserve") as span:
        span.set_attribute("order.id", order_id)
        span.set_attribute("inventory.warehouse", "seoul-1")

        if incident:
            time.sleep(1.2)
            span.set_attribute("error.type", "inventory_timeout")
            span.set_status(Status(StatusCode.ERROR, "inventory timed out"))
            logger.error("inventory reservation timed out order_id=%s", order_id)
            return jsonify(error="inventory timeout", order_id=order_id), 503

        time.sleep(0.04)
        logger.info("checkout completed order_id=%s", order_id)
        return jsonify(status="accepted", order_id=order_id), 200
