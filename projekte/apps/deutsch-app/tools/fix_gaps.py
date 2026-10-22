import re
fixes = {
 "die Familie": ("Meine Familie wohnt in Bern.", "Meine {{ }} wohnt in Bern."),
 "der Name": ("Wie ist Ihr Name bitte?", "Wie ist Ihr {{ }} bitte?"),
 "die Sprache": ("Deutsch ist eine schwere Sprache.", "Deutsch ist eine schwere {{ }}."),
 "die Frage": ("Ich habe eine Frage an Sie.", "Ich habe eine {{ }} an Sie."),
 "der Termin": ("Ich habe morgen einen Termin beim Arzt.", "Ich habe morgen einen {{ }} beim Arzt."),
 "die Minute": ("Ich bin in einer Minute fertig.", "Ich bin in einer {{ }} fertig."),
 "der Abend": ("Am Abend treffen wir Freunde.", "Am {{ }} treffen wir Freunde."),
 "zumachen": ("Bitte mach das Licht aus.", "Bitte mach die Tür {{ }}."),
}
lines = [l for l in open('_gen_input.txt', encoding='utf-8').read().splitlines() if l.strip()]
out, n = [], 0
for l in lines:
    head = l.split('|')[0]
    if head in fixes:
        old, new = fixes[head]
        if old in l:
            l = l.replace(old, new)
            n += 1
    out.append(l)
open('_gen_input.txt', 'w', encoding='utf-8').write("\n".join(out) + "\n")
print("korrigiert:", n)
