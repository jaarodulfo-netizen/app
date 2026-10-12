#!/usr/bin/env python3
"""Read-only diagnostic for a Hikvision access controller / facial terminal.

No changes to cards, door schedules, facial templates or device settings.
Run INSIDE the studio network (or an authorized VPN) against one device at a time.

    export HIKVISION_USER="admin"
    export HIKVISION_PASSWORD="(from local secret store)"
    python scripts/diagnose_hikvision_card.py --device http://192.168.2.39 --card 0008512258
    python scripts/diagnose_hikvision_card.py --device http://192.168.2.39 --card 0008512258 --employee 123

Requires: pip install requests
Use --insecure only if your device's HTTPS certificate is self-signed.
"""
import argparse
import json
import os
import xml.etree.ElementTree as ET
from datetime import datetime

import requests
from requests.auth import HTTPDigestAuth


def request(session, method, base_url, path, payload=None):
    try:
        response = session.request(method, base_url + path, json=payload, timeout=12)
        response.raise_for_status()
        content_type = response.headers.get("Content-Type", "")
        if "xml" in content_type.lower() or response.text.lstrip().startswith("<?xml"):
            return response.text
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        return {"error": str(exc)}


def find_items(result, envelope, item):
    if not isinstance(result, dict):
        return []
    obj = result.get(envelope, {})
    if not isinstance(obj, dict):
        return []
    found = obj.get(item, [])
    if isinstance(found, dict):
        return [found]
    return found if isinstance(found, list) else []


def main():
    parser = argparse.ArgumentParser(description="Check one card without modifying Hikvision access settings")
    parser.add_argument("--device", required=True, help="http(s)://IP:PORT")
    parser.add_argument("--card", required=True, help="Card number as printed, preserve leading zeros")
    parser.add_argument("--employee", help="Hikvision employeeNo, if known")
    parser.add_argument("--insecure", action="store_true", help="Allow self-signed HTTPS certificate")
    args = parser.parse_args()

    if not args.card.isdigit():
        parser.error("Card must contain only digits")
    username, password = os.getenv("HIKVISION_USER"), os.getenv("HIKVISION_PASSWORD")
    if not username or not password:
        parser.error("Set HIKVISION_USER and HIKVISION_PASSWORD environment variables first")

    session = requests.Session()
    session.auth = HTTPDigestAuth(username, password)
    session.verify = not args.insecure
    print("DEVICE:", args.device)
    clock = request(session, "GET", args.device.rstrip("/"), "/ISAPI/System/time")
    if isinstance(clock, str):
        root = ET.fromstring(clock)
        fields = {tag.rsplit("}", 1)[-1]: (element.text or "").strip()
                  for element in root.iter() if (tag := element.tag)}
        print("DEVICE CLOCK:", fields.get("localTime", "not provided"))
        print("TIME ZONE:", fields.get("timeZone", "not provided"))
    else:
        print("CLOCK QUERY:", clock.get("error", "unsupported response"))

    search_card = {"CardInfoSearchCond": {
        "searchID": "kerma-card-read-only",
        "searchResultPosition": 0,
        "maxResults": 10,
        "CardNoList": [{"cardNo": args.card}],
    }}
    card_result = request(session, "POST", args.device.rstrip("/"),
                          "/ISAPI/AccessControl/CardInfo/Search?format=json", search_card)
    matches = [c for c in find_items(card_result, "CardInfoSearch", "CardInfo")
               if str(c.get("cardNo")) == args.card]
    if isinstance(card_result, dict) and "error" in card_result:
        print("CARD LOOKUP FAILED:", card_result["error"])
    else:
        print("CARD PRESENT IN DEVICE:", "YES" if matches else "NO / NOT RETURNED")
        for item in matches:
            print("CARD TYPE:", item.get("cardType", "unknown"))
            print("CARD EMPLOYEE NO:", item.get("employeeNo", "unknown"))

    employee = args.employee or (str(matches[0].get("employeeNo")) if matches else None)
    if employee:
        condition = {"UserInfoSearchCond": {
            "searchID": "kerma-user-read-only",
            "searchResultPosition": 0,
            "maxResults": 10,
            "EmployeeNoList": [{"employeeNo": employee}],
        }}
        user_result = request(session, "POST", args.device.rstrip("/"),
                              "/ISAPI/AccessControl/UserInfo/Search?format=json", condition)
        people = [p for p in find_items(user_result, "UserInfoSearch", "UserInfo")
                  if str(p.get("employeeNo")) == str(employee)]
        if isinstance(user_result, dict) and "error" in user_result:
            print("USER LOOKUP FAILED:", user_result["error"])
        else:
            print("PERSON PRESENT IN DEVICE:", "YES" if people else "NO / NOT RETURNED")
            for person in people:
                print("USER TYPE:", person.get("userType", "unknown"))
                print("VALIDITY:", json.dumps(person.get("Valid", {}), ensure_ascii=False))
                print("DOOR RIGHTS:", person.get("doorRight", "not returned"))
                print("RIGHT PLAN:", json.dumps(person.get("RightPlan", []), ensure_ascii=False))
    print("NOTE: Device support varies. This check does not verify enrolled face templates.")
    print("NOTE: A present card can still be denied by the controller's access level or schedule.")


if __name__ == "__main__":
    main()
