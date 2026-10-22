#!/usr/bin/env python3
"""Prüft Verbindung + ob Schema schon eingespielt ist (nur read-only Info)."""
import json, urllib.request, urllib.error, sys, os

URL = "https://rwbjmoytugjmdngcgtda.supabase.co"
KEY = "sb_publishable_Zg7WRvyul_m58gSQX2L3oQ_7Lb0HTXa"

def call(path):
    req = urllib.request.Request(URL + path, headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status, r.read().decode()[:200]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:200]
    except Exception as e:
        return 0, str(e)[:200]

for p in ["/rest/v1/profiles?select=id&limit=1", "/rest/v1/codes?select=code&limit=1", "/auth/v1/settings"]:
    print(p, call(p))
