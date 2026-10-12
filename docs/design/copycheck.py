"""List every visible text string in an HTML mockup and flag microcopy suspects."""
import sys, re
from html.parser import HTMLParser
class P(HTMLParser):
    VOID={"br","img","input","meta","link","hr","area","base","col","embed","source","track","wbr","path","circle","line","rect","polyline","polygon","use","stop"}
    def __init__(s): super().__init__(); s.skip=0; s.out=[]; s.stack=[]; s.gloss=0
    def handle_startendtag(s,t,a): pass
    def handle_starttag(s,t,a):
        if t not in s.VOID:
            g="glossary" in (dict(a).get("class") or "").split()
            s.stack.append(g); s.gloss+=g
        if t in("script","style","title"): s.skip+=1
        for k,v in a:
            if k in("title","aria-label","alt","placeholder") and v: s.out.append(("@"+k,v))
    def handle_endtag(s,t):
        if t in("script","style","title"): s.skip-=1
        if t not in s.VOID and s.stack: s.gloss-=s.stack.pop()
    def handle_data(s,d):
        d=" ".join(d.split())
        if d and not s.skip: s.out.append(("glossary" if s.gloss else "",d))
VERBS=r"\b(is|are|was|were|be|been|has|have|had|do|does|did|will|would|should|could|can|may|might|means|try|tries|ran|runs|shows|suggests|looks|keep|consider|watch|count|split|based|because|this|that|your|you|we|our|it)\b"
def flag(t):
    w=t.split()
    why=[]
    if t.endswith("?") or "?" in t: why.append("question")
    if re.search(r"[a-z][.!]$",t) and len(w)>=3: why.append("sentence-end")
    if len(w)>=6: why.append(f"{len(w)} words")
    if re.search(VERBS,t,re.I) and len(w)>=3: why.append("verb/pronoun")
    return why
p=P(); p.feed(open(sys.argv[1]).read())
seen=set(); bad=0
for k,t in p.out:
    if (k,t) in seen: continue
    seen.add((k,t)); f=[] if k=="glossary" else flag(t)
    if f: bad+=1; print("FLAG",k,"|",t,"|",",".join(f))
print(f"-- {len(seen)} unique strings, {bad} flagged")
