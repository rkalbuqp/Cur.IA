# -*- coding: utf-8 -*-
import zipfile, xml.etree.ElementTree as ET, re, json, os

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
PATH_DOCX = r"c:\Users\kalbu\Desktop\Cur.IA\Transcrição Registros de Casamento 1965 - Paróquia de João Alfredo.docx"
OUT_JSON = r"c:\Users\kalbu\Desktop\Cur.IA\registros_1965_COMPLETOS.json"

MESES = {
    "janeiro":1,"fevereiro":2,"marco":3,"março":3,
    "abril":4,"maio":5,"junho":6,"julho":7,"agosto":8,
    "setembro":9,"outubro":10,"novembro":11,"dezembro":12,
}

def norm(s):
    if not s: return ""
    t = []
    mapa = {
        'à':'a','á':'a','â':'a','ã':'a','ä':'a',
        'è':'e','é':'e','ê':'e','ë':'e',
        'ì':'i','í':'i','î':'i','ï':'i',
        'ò':'o','ó':'o','ô':'o','õ':'o','ö':'o',
        'ù':'u','ú':'u','û':'u','ü':'u','ç':'c','ñ':'n',
    }
    for ch in s:
        low = ch.lower()
        if low in mapa:
            t.append(mapa[low])
        else:
            t.append(ch)
    return "".join(t)

def numext(txt):
    txt = norm(txt).strip().lower()
    u = {"zero":0,"um":1,"uma":1,"dois":2,"duas":2,"tres":3,"três":3,
        "quatro":4,"cinco":5,"seis":6,"sete":7,"oito":8,"nove":9,
        "dez":10,"onze":11,"doze":12,"treze":13,"catorze":14,"quatorze":14,
        "quinze":15,"dezesseis":16,"dezessete":17,"dezoito":18,"dezenove":19}
    d = {"vinte":20,"trinta":30,"quarenta":40,"cinquenta":50,"sessenta":60,
        "setenta":70,"oitenta":80,"noventa":90}
    if txt in u: return u[txt]
    if txt in d: return d[txt]
    if " e " in txt:
        partes = [p.strip() for p in txt.split(" e ")]
        total = 0
        ok = True
        for p in partes:
            if p in u: total += u[p]
            elif p in d: total += d[p]
            else: ok=False;break
        if ok: return total
    if re.fullmatch(r"\d+", txt): return int(txt)
    return None

def extrair_data(linha):
    """Extrai data DD/MM/AAAA da linha 'Aos dois dias do mês de fevereiro do ano de mil novecentos e sessenta e cinco, pelas 8 horas...'"""
    try:
        pos = linha.lower().find("aos ")
        if pos < 0: pos = linha.lower().find("ao ")
        if pos < 0: return ""
        resto = linha[pos:]
        restolow = resto.lower()
        posfim = len(resto)
        for m in [", pelas", ", na ", ", ap", ", pe", ", re", ";", "."]:
            p = restolow.find(m)
            if p > 0 and p < posfim: posfim = p
        bloco = resto[:posfim].strip()
        tokens = bloco.split()
        if len(tokens) < 7: return ""
        dia_str = tokens[1]
        # procura token = mês (3-5 letras, começa m, termina s, não "dias")
        im = -1
        for i in range(len(tokens)):
            tl = tokens[i].lower()
            if 3 <= len(tl) <= 5 and tl.startswith("m") and tl.endswith("s") and tl != "dias" and tl != "mais" and tl != "mas":
                im = i; break
        if im < 0 or im + 2 >= len(tokens): return ""
        mes_str = tokens[im+2]
        ia = -1
        for j in range(im+3, len(tokens)):
            if tokens[j].lower().startswith("ano"): ia = j; break
        if ia < 0 or ia + 2 >= len(tokens): return ""
        ano_str = " ".join(tokens[ia+2:]).strip()
        dia = numext(dia_str)
        ms_n = norm(mes_str).lower()
        mes = None
        for chave, num in MESES.items():
            if ms_n == chave or ms_n.startswith(chave[:4]) or chave.startswith(ms_n[:4]):
                mes = num; break
        ano = None
        if re.fullmatch(r"\d+", ano_str):
            ano = int(ano_str)
        else:
            an = norm(ano_str).lower()
            tot = 0
            if "mil" in an: tot += 1000
            for cent, val in [("novecentos",900),("oitocentos",800),("setecentos",700),("seiscentos",600),("quinhentos",500)]:
                if cent in an: tot += val
            for rtoken in ["mil","novecentos","oitocentos","setecentos","seiscentos","quinhentos"]:
                an = an.replace(rtoken, "")
            an = an.strip(" ,.;-")
            rr = numext(an)
            if rr is not None: tot += rr
            if tot >= 1000: ano = tot
        if dia and mes and ano:
            return f"{dia:02d}/{mes:02d}/{ano:04d}"
    except: pass
    return ""

def extrair_hora(linha):
    m = re.search(r"pelas?\s+(\w+)\s+horas?", linha, re.IGNORECASE)
    if not m: return ""
    hs = m.group(1).strip()
    h = numext(hs)
    if h is None:
        if re.fullmatch(r"\d+", hs): h = int(hs)
    if h is not None: return f"{h:02d}:00"
    return ""

def extrair_local(linha):
    m = re.search(r"na\s+(.*?)(?:[,.;]|ap[oó]s|perante)", linha, re.IGNORECASE)
    if m:
        s = m.group(1).strip().rstrip(",").strip()
        if s: return s[0].upper() + s[1:]
    return ""

def extrair_padre(linha):
    m = re.search(r"(?:perante|diante|ante)\s+o\s+([^,.;]+?)(?:[,.;]|presentes as? testemunhas|receberam|presentes)", linha, re.IGNORECASE)
    if m: return m.group(1).strip()
    return ""

def extrair_testemunhas(linha):
    tn, tn2 = "", ""
    m = re.search(r"presentes as?\s+testemunhas\s+(.*?)(?:[,.;]|receberam[\s-]se|e\s+receberam)", linha, re.IGNORECASE)
    if not m: return "", ""
    nomes = m.group(1).strip()
    # Split por ", e " (última separação)
    m3 = re.search(r",\s*([^,]+)\s+e\s+([^,]+)$", nomes)
    if m3:
        # 3+ nomes: "A, B e C" => tn = B? Ou tn = primeiro, tn2 = último? Escolhemos PRIMEIRO e ÚLTIMO.
        antes_ultimo_e = nomes[:m3.start() + len(m3.group(0)) - len(m3.group(1)) - len(m3.group(2)) - 3]
        primeiro = antes_ultimo_e.split(",",1)[0].strip()
        return (primeiro if primeiro else m3.group(1).strip()), m3.group(2).strip()
    if " e " in nomes:
        a, b = nomes.split(" e ", 1)
        return a.strip(), b.strip()
    if "," in nomes:
        partes = [p.strip() for p in nomes.split(",") if p.strip()]
        if len(partes) >= 2: return partes[0], partes[-1]
        if len(partes) == 1: return partes[0], ""
    return nomes.strip(), ""

def extrair_nome_pessoa(linha):
    m = re.match(r"^[OA]\s+Nubente\s*:\s*(.*)", linha, re.IGNORECASE)
    if not m: return ""
    r = m.group(1).strip()
    if "," in r: return r.split(",",1)[0].strip()
    return r

def extrair_linhas(path):
    with zipfile.ZipFile(path) as zf:
        with zf.open("word/document.xml") as f:
            root = ET.parse(f).getroot()
    linhas = []
    for p in root.iter("{%s}p" % W_NS):
        partes = [(t.text or "") for t in p.iter("{%s}t" % W_NS)]
        linha = "".join(partes).strip()
        if linha: linhas.append(linha)
    return linhas

def extrair_todos(linhas):
    pl = re.compile(r"LIVRO\s*[:\.]?\s*(\d+[A-Za-zºª]?)", re.I)
    pf = re.compile(r"FOLHA\s*[:\.]?\s*(\d+[A-Za-zºª]?)", re.I)
    pt = re.compile(r"Termo\s*N\.?\s*(\d+[ºª]?)", re.I)
    livro_global = ""
    for i,lin in enumerate(linhas[:80]):
        m = pl.search(lin)
        if m: livro_global = m.group(1).replace("º","").replace("ª","").strip(); break
    fa, la, aa = "", livro_global, ""
    regs = []; at = None

    def fechar():
        nonlocal at
        if at and at.get("numero"):
            if not at.get("livro"): at["livro"] = livro_global or ""
            for ch in ["livro","folha","numero","data_celebacao","hora_celebacao","local_celebacao","testemunha_qualificada","testemunha_noivo","testemunha_noiva"]:
                at.setdefault(ch, "")
            at["noivo"] = {"nome": at.pop("_noivo_nome",""), "sexo":"MASCULINO","profissao":"","mae":"","pai":""}
            at["noiva"] = {"nome": at.pop("_noiva_nome",""), "sexo":"FEMININO","profissao":"","mae":"","pai":""}
            regs.append(at)
        at = None

    for i,lin in enumerate(linhas):
        ml = pl.search(lin)
        if ml: la = ml.group(1).replace("º","").replace("ª","").strip(); livro_global=la or livro_global
        mf = pf.search(lin)
        if mf: fa = mf.group(1).replace("º","").replace("ª","").strip()
        mt = pt.search(lin)
        if mt:
            fechar()
            at = {"livro": la or "", "folha": fa or "",
                  "numero": mt.group(1).replace("º","").replace("ª","").strip(),
                  "_noivo_nome":"","_noiva_nome":""}
            continue
        if at is not None:
            if re.match(r"^Ano\s*[:\.]?\s*\d{4}", lin, re.I):
                ma = re.match(r"^Ano\s*[:\.]?\s*(\d{4})", lin, re.I)
                if ma: at["ano_texto"] = ma.group(1)
            elif re.match(r"^Data\s+do\s+casamento", lin, re.I):
                at["data_celebacao"] = extrair_data(lin)
                h = extrair_hora(lin)
                if h: at["hora_celebacao"] = h
                loc = extrair_local(lin)
                if loc: at["local_celebacao"] = loc
                pad = extrair_padre(lin)
                if pad: at["testemunha_qualificada"] = pad
                tn, tn2 = extrair_testemunhas(lin)
                if tn: at["testemunha_noivo"] = tn
                if tn2: at["testemunha_noiva"] = tn2
            elif re.match(r"^O\s+Nubente", lin, re.I):
                at["_noivo_nome"] = extrair_nome_pessoa(lin)
            elif re.match(r"^A\s+Nubente", lin, re.I):
                at["_noiva_nome"] = extrair_nome_pessoa(lin)
    fechar()
    return regs

def main():
    linhas = extrair_linhas(PATH_DOCX)
    print(f"Total de linhas: {len(linhas)}")
    regs = extrair_todos(linhas)
    print(f"Total registros: {len(regs)}")
    com_data = sum(1 for r in regs if r.get("data_celebacao"))
    com_nomes = sum(1 for r in regs if r["noivo"]["nome"] and r["noiva"]["nome"])
    com_hora = sum(1 for r in regs if r.get("hora_celebacao"))
    com_local = sum(1 for r in regs if r.get("local_celebacao"))
    com_padre = sum(1 for r in regs if r.get("testemunha_qualificada"))
    print(f"[QUALIDADE] data={com_data}/{len(regs)}, nomes={com_nomes}/{len(regs)}, hora={com_hora}/{len(regs)}, local={com_local}/{len(regs)}, padre={com_padre}/{len(regs)}")
    if regs:
        print("\n--- Registro 1 ---")
        for k,v in regs[0].items():
            if k in ("noivo","noiva"): print(f"  {k}.nome = {v.get('nome')!r}")
            else: print(f"  {k} = {v!r}")
        print("\n--- Registro 2 (data!) ---")
        r2 = None
        for r in regs:
            if r.get("data_celebacao"): r2 = r; break
        if r2:
            for k,v in r2.items():
                if k in ("noivo","noiva"): print(f"  {k}.nome = {v.get('nome')!r}")
                else: print(f"  {k} = {v!r}")
    with open(OUT_JSON,"w",encoding="utf-8") as f:
        json.dump(regs, f, ensure_ascii=False, indent=2)
    print(f"\nSalvo em: {OUT_JSON}")

if __name__ == "__main__": main()
