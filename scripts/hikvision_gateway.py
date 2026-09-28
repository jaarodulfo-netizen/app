#!/usr/bin/env python3
"""
Kerma Secure · Hikvision gateway agent
Run this on a machine inside your building network (reachable to the NVR/terminals, VPN as local works).
It polls Hikvision ISAPI access events and forwards them to the cloud console.

Setup:
  pip install requests
  export HIKVISION_URL="http://10.4.0.11"        # terminal or NVR address
  export HIKVISION_USER="admin"
  export HIKVISION_PASSWORD="your-device-password"
  export CLOUD_INGEST_URL="https://YOUR-APP-URL/api/ingest/hikvision"
  export GATEWAY_API_KEY="the-key-from-your-commander"
  python3 hikvision_gateway.py
"""
import os
import sys
import json
import time
import requests
from datetime import datetime, timezone, timedelta
from requests.auth import HTTPDigestAuth

DEVICE = os.environ["HIKVISION_URL"].rstrip("/")
USER = os.environ["HIKVISION_USER"]
PASS = os.environ["HIKVISION_PASSWORD"]
CLOUD = os.environ["CLOUD_INGEST_URL"]
KEY = os.environ["GATEWAY_API_KEY"]

AUTH = HTTPDigestAuth(USER, PASS)
CURSOR_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".gateway_cursor")


def load_cursor():
    try:
        with open(CURSOR_FILE) as f:
            return datetime.fromisoformat(f.read().strip())
    except Exception:
        return datetime.now(timezone.utc) - timedelta(minutes=2)


def save_cursor(ts):
    try:
        with open(CURSOR_FILE, "w") as f:
            f.write(ts.isoformat())
    except Exception:
        pass


def main():
    last = load_cursor()
    print(f"[gateway] forwarding {DEVICE} events -> {CLOUD}", flush=True)
    while True:
        end = datetime.now(timezone.utc)
        body = {
            "AcsEventCond": {
                "searchID": "kerma-gateway-1",
                "searchResultPosition": 0,
                "maxResults": 100,
                "startTime": last.isoformat().replace("+00:00", "Z"),
                "endTime": end.isoformat().replace("+00:00", "Z"),
            }
        }
        try:
            r = requests.post(
                f"{DEVICE}/ISAPI/AccessControl/AcsEvent?format=json",
                auth=AUTH,
                json=body,
                timeout=20,
                verify=False,
            )
            r.raise_for_status()
            data = r.json()
            resp = requests.post(CLOUD, headers={"X-API-Key": KEY}, json=data, timeout=20)
            resp.raise_for_status()
            info = resp.json()
            if info.get("inserted"):
                print(f"[gateway] {datetime.now().isoformat()} inserted={info['inserted']}", flush=True)
            save_cursor(end)
            last = end - timedelta(seconds=10)  # small overlap; server dedupes
        except Exception as e:
            print(f"[gateway] error: {e}", flush=True)
        time.sleep(5)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
