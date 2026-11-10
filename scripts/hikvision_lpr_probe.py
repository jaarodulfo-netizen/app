#!/usr/bin/env python3
"""Read-only capability probe for the Kerma Hikvision ANPR camera.

Run on a workstation inside the Kerma site network (ideally the Windows
Gateway). Never run from Railway: 192.168.3.1 is a private LAN address.

    py -m pip install requests
    py scripts\\hikvision_lpr_probe.py

Prompts for credentials locally (never place them in GitHub, cloud variables,
or a chat). Sends only HTTP GET requests and never opens a barrier or uploads
license plates.
"""
import argparse
import getpass
import xml.etree.ElementTree as ET
from urllib.parse import urlparse

import requests
from requests.auth import HTTPDigestAuth


READ_ONLY_PATHS = (
    ("Device identity", "/ISAPI/System/deviceInfo"),
    ("ANPR capability", "/ISAPI/ITC/capability"),
    ("Plate list export", "/ISAPI/Traffic/plateList"),
    ("Channel 1 XML plate list export", "/ISAPI/Traffic/channels/1/licensePlateAuditData?fileType=xml"),
)


def main():
    parser = argparse.ArgumentParser(description="Read-only Hikvision LPR compatibility probe")
    parser.add_argument("--url", default="https://192.168.3.1",
                        help="Camera URL, default https://192.168.3.1")
    parser.add_argument("--allow-http", action="store_true",
                        help="Explicitly permit unencrypted HTTP only on an isolated trusted network")
    parser.add_argument("--user", default="admin", help="Camera account (default admin)")
    args = parser.parse_args()
    parsed = urlparse(args.url)
    if parsed.scheme not in ("http", "https") or parsed.hostname != "192.168.3.1":
        parser.error("This diagnostic is pinned to camera 192.168.3.1")
    if parsed.username or parsed.password or parsed.path not in ("", "/") or parsed.query:
        parser.error("Do not put credentials or paths in --url")
    if parsed.scheme == "http" and not args.allow_http:
        parser.error("HTTP sends a digest exchange without encryption; use HTTPS or explicitly pass --allow-http")
    if parsed.scheme == "http":
        print("WARNING: Using unencrypted HTTP on a trusted isolated LAN. Digest challenge may be captured.")
    password = getpass.getpass("LPR camera password (hidden): ")
    if not password:
        parser.error("Camera password is required")
    base = args.url.rstrip("/")
    print("Kerma LPR capability test · READ ONLY · no plate list will be changed")
    with requests.Session() as session:
        session.auth = HTTPDigestAuth(args.user, password)
        for label, path in READ_ONLY_PATHS:
            try:
                # Stream to avoid downloading/exposing existing plate lists or
                # sensitive device XML in logs. Only the status is printed.
                with session.get(base + path, timeout=(4, 8), stream=True,
                                 allow_redirects=False) as response:
                    print(f"{label}: HTTP {response.status_code}")
                    if label == "Device identity" and response.status_code == 200:
                        try:
                            root = ET.fromstring(response.raw.read(16384))
                            safe_fields = {"model", "firmwareVersion", "firmwareReleasedDate"}
                            for element in root.iter():
                                field = element.tag.split("}")[-1]
                                if field in safe_fields and element.text:
                                    print(f"  {field}: {element.text.strip()[:80]}")
                        except (ET.ParseError, ValueError):
                            print("  Firmware metadata could not be parsed")
            except requests.RequestException as exc:
                # Do not print request exception bodies containing URLs/headers.
                print(f"{label}: connection error ({type(exc).__name__})")
    print("No writes were made. A 200 response alone does not verify allowlist programming.")


if __name__ == "__main__":
    main()
