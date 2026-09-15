import json
with open(r"c:\Users\kalbu\Desktop\Cur.IA\registros_1965_COMPLETOS.json", encoding="utf-8") as f:
    regs = json.load(f)
print("total regs:", len(regs))
for i in range(min(15, len(regs))):
    r = regs[i]
    print(f"[{i+1:03d}] F={str(r.get('folha')):>4} N={str(r.get('numero')):>4} data={str(r.get('data_celebacao')):>12} ano_texto={r.get('ano_texto')!r} noivo={r['noivo']['nome'][:30]!r}")
print(f"\nTotal com data: {sum(1 for r in regs if r.get('data_celebacao'))}")
print(f"Total com data e ano != 1900: {sum(1 for r in regs if r.get('data_celebacao') and not r.get('data_celebacao').endswith('/1900'))}")
print(f"Total data VAZIA: {sum(1 for r in regs if not r.get('data_celebacao'))}")
