import zipfile
import xml.etree.ElementTree as ET
import re
import json
import os

ARQUIVO_WORD = r"c:\Users\kalbu\Desktop\Cur.IA\Transcrição Registros de Casamento 1965 - Paróquia de João Alfredo.docx"
SAIDA_JSON = r"c:\Users\kalbu\Desktop\Cur.IA\registros_1965_extraidos.json"

def extrair_texto_docx(caminho_docx):
    textos = []
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    
    with zipfile.ZipFile(caminho_docx, 'r') as z:
        with z.open('word/document.xml') as f:
            tree = ET.parse(f)
            root = tree.getroot()
            
            for para in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
                texto_para = []
                for run in para.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'):
                    if run.text:
                        texto_para.append(run.text)
                linha = ''.join(texto_para).strip()
                if linha:
                    textos.append(linha)
    return textos

def extrair_dados_registros(linhas):
    registros = []
    
    padroes_livro = [
        re.compile(r'LIVRO\s*[:\.]?\s*(\d+[ºª]?\s*[A-Za-z]?|\d+)', re.IGNORECASE),
        re.compile(r'Liv\s*\.?\s*(\d+[ºª]?|\d+)', re.IGNORECASE),
        re.compile(r'\bL\s*[:\.]\s*(\d+[ºª]?|\d+)', re.IGNORECASE),
    ]
    padroes_folha = [
        re.compile(r'FOLHA\s*[:\.]?\s*(\d+[ºª]?\s*[A-Za-z]?|\d+)', re.IGNORECASE),
        re.compile(r'Fol\s*\.?\s*(\d+[ºª]?|\d+)', re.IGNORECASE),
        re.compile(r'\bF\s*[:\.]\s*(\d+[ºª]?|\d+)', re.IGNORECASE),
    ]
    padroes_numero = [
        re.compile(r'N[ÚU]MERO\s*[:\.]?\s*(\d+[ºª]?|\d+)', re.IGNORECASE),
        re.compile(r'N°\s*(\d+[ºª]?|\d+)', re.IGNORECASE),
        re.compile(r'Nº\s*(\d+[ºª]?|\d+)', re.IGNORECASE),
        re.compile(r'\bN\s*[:\.]\s*(\d+[ºª]?|\d+)', re.IGNORECASE),
    ]
    
    bloco_atual = []
    registro_atual = {"livro": "", "folha": "", "numero": "", "texto_completo": ""}
    
    todas_linhas_juntas = "\n".join(linhas)
    
    padrao_registro = re.compile(
        r'(?:REGISTRO|Casamento|Matrim[oô]nio)[^\n]*?\n',
        re.IGNORECASE
    )
    
    def buscar_valor(texto, padroes):
        for p in padroes:
            m = p.search(texto)
            if m:
                return m.group(1).strip().replace("º", "").replace("ª", "")
        return ""
    
    linhas_grandes = todas_linhas_juntas.split("\n")
    
    i = 0
    while i < len(linhas_grandes):
        linha = linhas_grandes[i]
        
        tem_livro = any(p.search(linha) for p in padroes_livro)
        tem_folha = any(p.search(linha) for p in padroes_folha)
        tem_numero = any(p.search(linha) for p in padroes_numero)
        
        bloco_atual.append(linha)
        
        if tem_livro or tem_folha or tem_numero:
            bloco_texto = "\n".join(bloco_atual[-30:])
            
            livro = buscar_valor(bloco_texto, padroes_livro)
            folha = buscar_valor(bloco_texto, padroes_folha)
            numero = buscar_valor(bloco_texto, padroes_numero)
            
            if livro or folha or numero:
                if (livro != registro_atual.get("livro") or 
                    folha != registro_atual.get("folha") or 
                    numero != registro_atual.get("numero")):
                    
                    if registro_atual.get("livro") or registro_atual.get("folha") or registro_atual.get("numero"):
                        registros.append(registro_atual)
                    
                    registro_atual = {
                        "livro": livro,
                        "folha": folha,
                        "numero": numero,
                        "texto_completo": bloco_texto[:500]
                    }
        i += 1
    
    if registro_atual.get("livro") or registro_atual.get("folha") or registro_atual.get("numero"):
        registros.append(registro_atual)
    
    return registros

def extrair_tabela_lfn(linhas):
    registros = []
    todas = "\n".join(linhas)
    
    padrao_tabela = re.compile(
        r'(?:LIVRO|LIVRO\s*:|Liv\s*\.?)\s*(\d+[ºªA-Za-z]?)\s*'
        r'(?:[,;|\t]\s*|\s{2,}|\n\s*)'
        r'(?:FOLHA|Fol\s*\.?|FOLHA\s*:)\s*(\d+[ºªA-Za-z]?)\s*'
        r'(?:[,;|\t]\s*|\s{2,}|\n\s*)'
        r'(?:N[ÚU]MERO|N°|Nº|N[ÚU]MERO\s*:)\s*(\d+[ºª]?)',
        re.IGNORECASE
    )
    
    for m in padrao_tabela.finditer(todas):
        registros.append({
            "livro": m.group(1).strip().replace("º", "").replace("ª", ""),
            "folha": m.group(2).strip().replace("º", "").replace("ª", ""),
            "numero": m.group(3).strip().replace("º", "").replace("ª", ""),
            "posicao": m.start()
        })
    
    if not registros:
        padrao_simples = re.compile(
            r'(\d+[ºª]?[A-Z]?)\s{1,10}(\d+[ºª]?[A-Z]?)\s{1,10}(\d+[ºª]?)',
            re.MULTILINE
        )
        for m in padrao_simples.finditer(todas):
            l = m.group(1).replace("º", "").replace("ª", "")
            f = m.group(2).replace("º", "").replace("ª", "")
            n = m.group(3).replace("º", "").replace("ª", "")
            if 1 <= int(l) <= 999 and 1 <= int(f) <= 999 and 1 <= int(n) <= 9999:
                registros.append({
                    "livro": l,
                    "folha": f,
                    "numero": n,
                    "posicao": m.start()
                })
    
    return registros

def main():
    print(f"Lendo arquivo: {ARQUIVO_WORD}")
    linhas = extrair_texto_docx(ARQUIVO_WORD)
    print(f"Total de linhas extraídas: {len(linhas)}")
    
    print("\n=== PRIMEIRAS 100 LINHAS DO DOCUMENTO ===")
    for i, l in enumerate(linhas[:100]):
        print(f"{i+1:4d}: {l}")
    
    print("\n\n=== TENTANDO EXTRAIR POR PADRÕES DE LINHAS ===")
    reg1 = extrair_dados_registros(linhas)
    print(f"Encontrados {len(reg1)} registros via linhas.")
    for r in reg1[:20]:
        print(f"  L={r.get('livro','?'):>5} | F={r.get('folha','?'):>5} | N={r.get('numero','?'):>5}")
    
    print("\n\n=== TENTANDO EXTRAIR POR PADRÕES DE TABELA (L / F / N) ===")
    reg2 = extrair_tabela_lfn(linhas)
    print(f"Encontrados {len(reg2)} registros via tabela.")
    for r in reg2[:50]:
        print(f"  L={r.get('livro','?'):>5} | F={r.get('folha','?'):>5} | N={r.get('numero','?'):>5}")
    
    todos_registros = {}
    for r in reg1 + reg2:
        chave = f"L{r.get('livro','')}_F{r.get('folha','')}_N{r.get('numero','')}"
        if chave not in todos_registros:
            todos_registros[chave] = {
                "livro": r.get("livro", ""),
                "folha": r.get("folha", ""),
                "numero": r.get("numero", "")
            }
    
    lista_final = sorted(todos_registros.values(), key=lambda x: (x.get("livro",""), x.get("folha",""), x.get("numero","")))
    
    print(f"\n\n=== TOTAL FINAL DE REGISTROS ÚNICOS: {len(lista_final)} ===")
    
    with open(SAIDA_JSON, "w", encoding="utf-8") as f:
        json.dump(lista_final, f, ensure_ascii=False, indent=2)
    print(f"\nDados salvos em: {SAIDA_JSON}")
    
    print("\n=== TODOS OS REGISTROS ENCONTRADOS ===")
    for i, r in enumerate(lista_final):
        print(f"{i+1:4d}. LIVRO={r['livro']:>5} | FOLHA={r['folha']:>5} | NÚMERO={r['numero']:>5}")

if __name__ == "__main__":
    main()
