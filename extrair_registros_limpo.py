import zipfile
import xml.etree.ElementTree as ET
import re
import json

ARQUIVO_WORD = r"c:\Users\kalbu\Desktop\Cur.IA\Transcrição Registros de Casamento 1965 - Paróquia de João Alfredo.docx"
SAIDA_JSON = r"c:\Users\kalbu\Desktop\Cur.IA\registros_1965.json"

def extrair_texto_docx(caminho_docx):
    textos = []
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

def main():
    linhas = extrair_texto_docx(ARQUIVO_WORD)
    print(f"Total de linhas: {len(linhas)}")
    
    print("\n=== 50 PRIMEIRAS LINHAS (procurar LIVRO) ===")
    for i, l in enumerate(linhas[:50]):
        print(f"{i+1:3d}: {l}")
    
    print("\n=== 20 ÚLTIMAS LINHAS ===")
    for i, l in enumerate(linhas[-20:]):
        print(f"{len(linhas)-20+i+1:3d}: {l}")
    
    padrao_livro = re.compile(r'LIVRO\s*[:\.]?\s*(\d+[A-Za-zºª]?)', re.IGNORECASE)
    padrao_folha = re.compile(r'FOLHA\s*[:\.]?\s*(\d+[A-Za-zºª]?)', re.IGNORECASE)
    padrao_termo = re.compile(r'Termo\s*N\.?\s*(\d+[ºª]?)', re.IGNORECASE)
    padrao_ano = re.compile(r'Ano\s*:\s*(\d{4})', re.IGNORECASE)
    
    livro_global = ""
    for l in linhas[:50]:
        m = padrao_livro.search(l)
        if m:
            livro_global = m.group(1).replace("º", "").replace("ª", "").strip()
            print(f"\n>>> LIVRO ENCONTRADO NO CABEÇALHO: {livro_global}")
            break
    
    if not livro_global:
        print("\n>>> LIVRO NÃO ENCONTRADO NAS 50 PRIMEIRAS LINHAS. Procurando em todo o documento...")
        for l in linhas:
            m = padrao_livro.search(l)
            if m:
                livro_global = m.group(1).replace("º", "").replace("ª", "").strip()
                print(f">>> LIVRO ENCONTRADO: {livro_global} (linha: '{l[:80]}')")
                break
    
    registros = []
    folha_atual = ""
    livro_atual = livro_global
    
    for i, linha in enumerate(linhas):
        m_livro = padrao_livro.search(linha)
        if m_livro:
            livro_atual = m_livro.group(1).replace("º", "").replace("ª", "").strip()
        
        m_folha = padrao_folha.search(linha)
        if m_folha:
            folha_atual = m_folha.group(1).replace("º", "").replace("ª", "").strip()
        
        m_termo = padrao_termo.search(linha)
        if m_termo:
            numero = m_termo.group(1).replace("º", "").replace("ª", "").strip()
            contexto = "\n".join(linhas[max(0,i-2):min(len(linhas),i+5)])
            registros.append({
                "livro": livro_atual,
                "folha": folha_atual,
                "numero": numero,
                "linha_termo": i+1,
                "contexto": contexto[:300]
            })
    
    print(f"\n=== TOTAL DE REGISTROS COM 'TERMO N.': {len(registros)} ===")
    
    todos_com_dados = [r for r in registros if r["folha"] and r["numero"]]
    print(f"Registros com FOLHA e NÚMERO: {len(todos_com_dados)}")
    print(f"Registros SEM FOLHA: {len([r for r in registros if not r['folha']])}")
    
    print("\n=== PRIMEIROS 30 REGISTROS ===")
    for i, r in enumerate(registros[:30]):
        print(f"{i+1:3d}. L={r['livro'] or '?':>5} | F={r['folha'] or '?':>5} | N={r['numero']:>5} | linha={r['linha_termo']}")
    
    print("\n=== ÚLTIMOS 20 REGISTROS ===")
    for i, r in enumerate(registros[-20:]):
        print(f"{len(registros)-20+i+1:3d}. L={r['livro'] or '?':>5} | F={r['folha'] or '?':>5} | N={r['numero']:>5} | linha={r['linha_termo']}")
    
    saida = []
    for r in registros:
        saida.append({
            "livro": r["livro"],
            "folha": r["folha"],
            "numero": r["numero"]
        })
    
    with open(SAIDA_JSON, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ Arquivo JSON salvo em: {SAIDA_JSON}")
    print(f"   Total de registros: {len(saida)}")
    
    if not livro_global:
        print("\n⚠️  AVISO: Não foi encontrado o campo LIVRO no documento.")
        print("   Verifique se o LIVRO está no cabeçalho ou se todos os registros são do mesmo livro.")
        print("   Nesse caso, você pode precisar preencher o LIVRO manualmente.")

if __name__ == "__main__":
    main()
