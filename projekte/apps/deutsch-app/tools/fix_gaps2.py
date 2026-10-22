fixes = {
 "die Zeit": ("Ich habe heute keine Zeit.", "Ich habe heute keine {{ }}."),
 "das Wasser": ("Bitte bring mir ein Glas Wasser.", "Bitte bring mir ein Glas {{ }}."),
 "das Zimmer": ("Mein Zimmer ist hell und warm.", "Mein {{ }} ist hell und warm."),
 "der Bahnhof": ("Wir treffen uns am Bahnhof.", "Wir treffen uns am {{ }}."),
 "der Freund": ("Mein Freund kommt zu Besuch.", "Mein {{ }} kommt zu Besuch."),
}
lines = [l for l in open('_gen_input.txt', encoding='utf-8').read().splitlines() if l.strip()]
out, n = [], 0
for l in lines:
    head = l.split('|')[0]
    if head in fixes:
        old, new = fixes[head]
        if old in l:
            l = l.replace(old, new); n += 1
    out.append(l)
open('_gen_input.txt','w',encoding='utf-8').write("\n".join(out)+"\n")
print("korrigiert:", n)
