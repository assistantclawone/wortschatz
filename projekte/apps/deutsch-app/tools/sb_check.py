#!/usr/bin/env python3
"""Prueft, ob das Schema im Supabase-Projekt schon eingespielt ist."""
import json, urllib.request, urllib.error

URL = "https://rwbjmoytugjmdngcgtda.supabase.co"
KEY = "sb_publishable_Zg7WRvyul_m58gSQX2L3oQ_7Lb0HTXa"

def call(path):
    req = urllib.request.Request(URL + path, headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status, r.read().decode()[:160]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:160]
    except Exception as e:
        return 0, str(e)[:160]

print("health      ", call("/auth/v1/health"))
for t in ["profiles", "progress", "codes", "code_redemptions", "orgs"]:
    print(f"{t:12}", call(f"/rest/v1/{t}?select=*&limit=1"))
