# -*- coding: utf-8 -*-
"""Script de referência: lê o .docx real da mesma forma que o parser JS faria
(zip + word/document.xml + parágrafos w:p + runs w:t).
Isso nos permite VERIFICAR se o parser JS está pegando as mesmas linhas que o Python."""
import zipfile
import xml.etree.ElementTree as ET
import re
import json
import os

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}

PATH_DOCX = r"c:\Users\kalbu\Desktop\Cur.IA\Transcrição Registros de Casamento 1965 - Paróquia de João Alfredo.docx"

def extrair_linhas(path_docx):
    linhas = []
    with zipfile.ZipFile(path_docx, "r") as zf:
        with zf.open("word/document.xml") as f:
            tree = ET.parse(f)
            root = tree.getroot()
            # Encontra todos os <w:p> (parágrafos)
            for p in root.iter(f"{{{W_NS}}}p"):
                textos_p = []
                for t in p.iter(f"{{{W_NS}}}t"):
                    if t.text:
                        textos_p.append(t.text)
                linha = "".join(textos_p).strip()
                if linha:
                    linhas.append(linha)
    return linhas

def extrair_registros_lfn(linhas):
    # MESMA LÓGICA DO JS:
    padrao_livro = re.compile(r"LIVRO\s*[:\.]?\s*(\d+[A-Za-zºª]?)", re.IGNORECASE)
    padrao_folha = re.compile(r"FOLHA\s*[:\.]?\s*(\d+[A-Za-zºª]?)", re.IGNORECASE)
    padrao_termo = re.compile(r"Termo\s*N\.?\s*(\d+[ºª]?)", re.IGNORECASE)

    livro_global = ""
    for i, linha in enumerate(linhas[:50]):
        m = padrao_livro.search(linha)
        if m:
            livro_global = m.group(1).replace("º", "").replace("ª", "").strip()
            print(f"[DEBUG LIVRO GLOBAL] linha {i}: {linha!r} -> livro_global = {livro_global!r}")
            break

    folha_atual = ""
    livro_atual = livro_global
    registros = []

    print("\n=== LINHAS QUE DÃO MATCH EM FOLHA / TERMO ===")
    for i, linha in enumerate(linhas):
        mL = padrao_livro.search(linha)
        if mL:
            livro_atual = mL.group(1).replace("º", "").replace("ª", "").strip()
            print(f"[MATCH LIVRO] linha {i}: {linha!r} => livro_atual={livro_atual!r}")
        mF = padrao_folha.search(linha)
        if mF:
            folha_atual = mF.group(1).replace("º", "").replace("ª", "").strip()
            print(f"[MATCH FOLHA] linha {i}: {linha!r} => folha_atual={folha_atual!r}")
        mT = padrao_termo.search(linha)
        if mT:
            numero = mT.group(1).replace("º", "").replace("ª", "").strip()
            ultimo = registros[-1] if registros else None
            if (not ultimo
                or ultimo.get("folha") != folha_atual
                or ultimo.get("numero") != numero
                or ultimo.get("livro") != livro_atual):
                registros.append({
                    "livro": livro_atual,
                    "folha": folha_atual,
                    "numero": numero,
                    "linha_idx": i
                })
            print(f"[MATCH TERMO N.] linha {i}: {linha!r} => NUMERO={numero!r} folha={folha_atual!r} livro={livro_atual!r}")

    return registros


def main():
    print(f"Lendo: {PATH_DOCX} (existe? {os.path.exists(PATH_DOCX)})")
    linhas = extrair_linhas(PATH_DOCX)
    print(f"\nTotal de linhas (parágrafos não vazios): {len(linhas)}")
    print("\n--- Primeiras 30 linhas (debug): ---")
    for i, l in enumerate(linhas[:30]):
        print(f"{i:03d}: {l}")

    registros = extrair_registros_lfn(linhas)
    print(f"\n=== Total de REGISTROS extraídos (L/F/N): {len(registros)} ===")
    print("Primeiros 5:")
    for i, r in enumerate(registros[:5]):
        print(f"  [{i+1}] livro={r['livro']!r} folha={r['folha']!r} numero={r['numero']!r}")
    print("Últimos 5:")
    for i, r in enumerate(registros[-5:]):
        idx = len(registros) - 5 + i
        print(f"  [{idx+1}] livro={r['livro']!r} folha={r['folha']!r} numero={r['numero']!r}")

    out = r"c:\Users\kalbu\Desktop\Cur.IA\registros_1965_REFERENCIA.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(registros, f, ensure_ascii=False, indent=2)
    print(f"\nJSON salvo em: {out}")


if __name__ == "__main__":
    main()
