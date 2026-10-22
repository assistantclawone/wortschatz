import json, urllib.request, urllib.error
URL="https://rwbjmoytugjmdngcgtda.supabase.co"
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3Ymptb3l0dWdqbWRuZ2NndGRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMDY4ODcsImV4cCI6MjEwNzg4Mjg4N30.fdGtWY6G-6WWu3KuEfjUx02CwO_aXub-28TcY3CWG7Q"
def call(path, body=None):
    req=urllib.request.Request(URL+path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey":KEY,"Authorization":"Bearer "+KEY,"Content-Type":"application/json"},
        method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(req,timeout=25) as r: return r.status, r.read().decode()[:200]
    except urllib.error.HTTPError as e: return e.code, e.read().decode()[:200]
    except Exception as e: return 0,str(e)[:200]
# Existiert die Funktion? Aufruf mit Dummy-Code -> erwartet 'code_not_found' (Funktion da) oder 'function not found'
print("redeem_code_atomic:", call("/rest/v1/rpc/redeem_code_atomic",
      {"p_code":"TEST-NICHT-VORHANDEN","p_user_id":"00000000-0000-0000-0000-000000000000"}))
print("has_active_redemption:", call("/rest/v1/rpc/has_active_redemption", {"p_code":"X"}))
