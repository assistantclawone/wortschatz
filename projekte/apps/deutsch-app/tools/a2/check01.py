import re, collections
p="/home/ubuntu/.openclaw/workspace/projekte/apps/deutsch-app/tools/a2/block02.txt"
lines=[l.rstrip("\n") for l in open(p,encoding="utf-8") if l.strip()]
existing=set()
raw=open("/home/ubuntu/.openclaw/workspace/projekte/apps/deutsch-app/tools/a2/vorhanden.txt",encoding="utf-8").read()
for x in re.split(r"[,\n]", raw):
    existing.add(x.strip().lower())
langs=["en","es","fr","it","pt","tr","ar","ru","pl","uk"]
errs=[]
seen=collections.Counter()
for i,l in enumerate(lines,1):
    f=l.split("|")
    if len(f)!=8:
        errs.append((i,"felder",len(f))); continue
    de,meaning,level,cats,region,sent,tr,flags=f
    seen[de.strip().lower()]+=1
    if level!="A2": errs.append((i,"level",level))
    if de.strip().lower() in existing: errs.append((i,"vorhanden",de))
    if de.split(" ",1)[-1].lower() not in sent.lower(): errs.append((i,"satz",de))
    keys=[t.split("=")[0] for t in tr.split("/")]
    if keys!=langs: errs.append((i,"langs",keys))
    for t in tr.split("/"):
        v=t.split("=",1)[1] if "=" in t else ""
        if not v.strip(): errs.append((i,"leer",t))
    n=len(sent.split())
    if n<5 or n>10: errs.append((i,"satzlaenge",n))
for d,c in seen.items():
    if c>1: errs.append((0,"dublette",d))
print("Zeilen:",len(lines))
print("Fehler:",len(errs))
for e in errs: print(e)
