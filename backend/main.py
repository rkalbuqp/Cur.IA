import os
import io
import json
import base64
import mimetypes
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from PIL import Image

import sys
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

load_dotenv()

app = FastAPI(title="Curia OCR Backend", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",
        "chrome-extension://*",
        "edge-extension://*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("[Curia IA] ⚠️  AVISO: GEMINI_API_KEY não configurada no arquivo .env!")
    print("[Curia IA]    → O servidor vai rodar (upload Word funciona na extensão SEM backend),")
    print("[Curia IA]    → mas OCR de imagens (/extract-data) vai retornar erro 503.")
    print("[Curia IA]    → Obtenha uma chave em https://aistudio.google.com/apikey")
    print("[Curia IA]    → e cole no arquivo: backend/.env  (linha GEMINI_API_KEY=sua_chave)")
else:
    print(f"[Curia IA] ✅ GEMINI_API_KEY carregada (tamanho: {len(GEMINI_API_KEY)} caracteres).")
    try:
        from google import generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        print("[Curia IA] ✅ google-generativeai SDK configurado com sucesso.")
    except Exception as e_sdk:
        print(f"[Curia IA] ⚠️  Não foi possível configurar SDK google-generativeai: {e_sdk}")

API_BASES = [
    "https://generativelanguage.googleapis.com/v1",
    "https://generativelanguage.googleapis.com/v1beta",
]
API_BASE_ATIVA = API_BASES[0]

MODEL_CANDIDATOS = [
    "models/gemini-3.6-flash",
    "models/gemini-3.5-flash",
    "models/gemini-2.5-flash",
    "models/gemini-2.5-pro",
    "models/gemini-flash-latest",
    "models/gemini-3.5-flash-lite",
    "models/gemini-2.5-flash-lite",
    "models/gemini-2.5-flash-image",
    "models/gemini-3.1-flash-image",
    "models/gemini-3.1-flash-lite-image",
]

MODEL_NAME = MODEL_CANDIDATOS[0]

SYSTEM_PROMPT = """Você é um arquivista especialista em transcrever livros antigos de registro de casamento paroquial (termo de casamento lavrado à mão).
Seu trabalho é ler com muita atenção a imagem de uma página do livro e extrair EXATAMENTE os campos abaixo em formato JSON, sem texto adicional, sem markdown, sem explicar nada.

PADRÃO QUE VOCÊ ENCONTRARÁ NA IMAGEM:
- Primeiro vem o CABEÇALHO com os dados da celebração:
  * Data: no formato "Aos XX dias do mês de MÊS de AAAA" ou "Aos vinte e oito dias do mês de janeiro de mil novecentos e cinquenta e cinco". Exemplo típico: "ANO DE 1955" no topo.
  * Hora: "pelas XX horas" (ex: pelas dez horas = 10:00; pelas dezoito horas = 18:00; pelas sete e meia = 07:30; se não tiver minuto exato, use :00).
  * LOCAL: "na Capela de Autas" ou "na Igreja Matriz de N. Sra. da Conceição" (a paróquia/local onde foi celebrado).
  * PADRE CELEBRANTE (Redmo. = Reverendíssimo): aparece como "perante o Redmo. Pe. Joaquim Gurgel" ou similar. Esse é o "padre que celebra" — deve ser salvo em "testemunha_qualificada".
- DEPOIS do cabeçalho vem a linha "as testemunhas" com 2 NOMES (primeira testemunha = do noivo, segunda = da noiva).
- Depois a seção O NUBENTE (isso é o NOIVO, sempre MASCULINO).
- Depois a seção E A NUBENTE (isso é a NOIVA, sempre FEMININA).
- Dentro de cada nubente: aparece o NOME COMPLETO, depois a idade e (estado), a (profissão), "filho de" ou "filha de" — PRIMEIRO O NOME DO PAI, DEPOIS "e" e O NOME DA MÃE (ATENÇÃO: a ordem no formulário é PAI, MÃE — não inverta).

EXTRAIA ESTRITAMENTE ESTE JSON, sem campos extras:
{
  "livro": "",
  "folha": "",
  "numero": "",
  "data_celebacao": "",
  "hora_celebacao": "",
  "local_celebacao": "",
  "testemunha_qualificada": "",
  "noivo": {
    "nome": "",
    "sexo": "MASCULINO",
    "profissao": "",
    "mae": "",
    "pai": ""
  },
  "noiva": {
    "nome": "",
    "sexo": "FEMININO",
    "profissao": "",
    "mae": "",
    "pai": ""
  },
  "testemunha_noivo": "",
  "testemunha_noiva": ""
}

INSTRUÇÕES ESPECIAIS PARA O FORMATO DOS CAMPOS NOVOS:
- livro: NÚMERO do LIVRO de registro paroquial (ex: "1", "2", "3A", "4B"). Extraia de "LIVRO X", "Livro X", "L X". Se não tiver explícito, deixe vazio.
- folha: NÚMERO da FOLHA (página) do livro (ex: "181", "182", "200"). Extraia de "FOLHA X", "Folha X", "F X".
- numero: NÚMERO do TERMO de casamento (ex: "32", "33", "158"). Extraia de "Termo N. X", "Termo N° X", "Termo Nº X", "Número X".
- data_celebacao: Formato BRASILEIRO DD/MM/AAAA. Exemplo: 28/01/1955. Se for data por extenso como "Aos vinte dias do mês de janeiro de 1955" → 20/01/1955. Se for "Aos sete dias do mês de março do ano de mil novecentos e setenta e dois" → 07/03/1972. Sempre converta extenso para números.
- hora_celebacao: Formato HH:MM (24h). Ex: "pelas dez horas" → "10:00"; "pelas oito e trinta horas" → "08:30"; "pelas dezenove horas" → "19:00".
- local_celebacao: Nome completo do local (ex: "Capela de Autas", "Igreja Matriz de Boa Alfredo"). Inclua nome da Capela/Igreja + se tiver "desta Paróquia de X", inclua a paróquia.
- testemunha_qualificada: NOME COMPLETO do padre celebrante. Vem SEMPRE na frase "perante o Redmo. Pe. FULANO DE TAL" ou "presentes perante o Rev.mo Pe. Ciclano". Extraia o NOME COMPLETO do sacerdote (ex: "Padre Joaquim Gurgel", "Pe. Joaquim Gurgel dos Santos" — não inclua "Redmo." nem "perante o").

Regras OBRIGATÓRIAS:
1. noivo.sexo SEMPRE = "MASCULINO" | noiva.sexo SEMPRE = "FEMININO".
2. Extraia NOMES COMPLETOS como aparecem escritos, não normalize.
3. Em "filho(a) de X e Y": X é o PAI, Y é a MÃE.
4. Se um campo não for legível, deixe como string VAZIA "".
5. A PRIMEIRA testemunha listada é testemunha_noivo, a SEGUNDA é testemunha_noiva.
6. NÃO adicione campos que não estão no JSON acima.
7. NÃO envolva em ```json```. Apenas o JSON puro.
8. CONVERTA SEMPRE data por extenso para DD/MM/AAAA e hora por extenso para HH:MM (24h).
"""


class Pessoa(BaseModel):
    nome: str = ""
    sexo: str = ""
    profissao: str = ""
    mae: str = ""
    pai: str = ""


class DadosCasamento(BaseModel):
    livro: str = ""
    folha: str = ""
    numero: str = ""
    data_celebacao: str = ""
    hora_celebacao: str = ""
    local_celebacao: str = ""
    testemunha_qualificada: str = ""
    noivo: Pessoa
    noiva: Pessoa
    testemunha_noivo: str = ""
    testemunha_noiva: str = ""


def limpar_json_response(texto: str) -> str:
    texto = texto.strip()
    if texto.startswith("```json"):
        texto = texto[7:]
    if texto.startswith("```"):
        texto = texto[3:]
    if texto.endswith("```"):
        texto = texto[:-3]
    return texto.strip()


MESES_MAP = {
    "janeiro": 1, "janeiro": 1, "fevereiro": 2, "marco": 3, "março": 3,
    "abril": 4, "maio": 5, "junho": 6, "julho": 7, "agosto": 8,
    "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
}


def numero_extenso_para_int(texto: str) -> Optional[int]:
    """Converte números por extenso em português (0-9999) para inteiro."""
    if texto is None:
        return None
    s = texto.strip().lower().replace(",", "").replace("_", " ")
    if s.isdigit():
        try:
            return int(s)
        except Exception:
            return None

    unidades = {
        "zero": 0, "um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "três": 3,
        "quatro": 4, "cinco": 5, "seis": 6, "sete": 7, "oito": 8, "nove": 9,
    }
    especiais = {
        "dez": 10, "onze": 11, "doze": 12, "treze": 13, "quatorze": 14, "catorze": 14,
        "quinze": 15, "dezesseis": 16, "dezessete": 17, "dezoito": 18, "dezenove": 19,
    }
    dezenas = {
        "vinte": 20, "trinta": 30, "quarenta": 40, "cinquenta": 50,
        "sessenta": 60, "setenta": 70, "oitenta": 80, "noventa": 90,
    }
    centenas = {
        "cento": 100, "cem": 100, "duzentos": 200, "trezentos": 300,
        "quatrocentos": 400, "quinhentos": 500, "seiscentos": 600,
        "setecentos": 700, "oitocentos": 800, "novecentos": 900,
    }

    def avaliar(frase: str):
        frase = frase.strip()
        if not frase:
            return None
        if frase.isdigit():
            return int(frase)
        if frase in especiais:
            return especiais[frase]
        tokens = [t.strip() for t in frase.replace("-", " ").split() if t.strip()]
        total = 0
        acumulado = 0
        i = 0
        while i < len(tokens):
            t = tokens[i]
            if t in ("e",):
                i += 1
                continue
            if t in ("mil",):
                if acumulado == 0:
                    acumulado = 1
                total += acumulado * 1000
                acumulado = 0
                i += 1
                continue
            if t in centenas:
                acumulado += centenas[t]
                i += 1
                continue
            if t in dezenas:
                acumulado += dezenas[t]
                i += 1
                continue
            if t in especiais:
                acumulado += especiais[t]
                i += 1
                continue
            if t in unidades:
                acumulado += unidades[t]
                i += 1
                continue
            return None
        total += acumulado
        return total if total > 0 else None

    r = avaliar(s)
    if r is not None and 0 <= r <= 9999:
        return r
    return None


def parse_data_por_extenso_para_ddmmaaaa(texto_data: str) -> str:
    """
    Recebe algo como 'Aos vinte dias do mês de janeiro do ano de mil novecentos e cinquenta e cinco'
    ou '28 de janeiro de 1955' e retorna '28/01/1955'.
    Se não conseguir parsear, retorna o próprio texto_data.
    """
    if not texto_data:
        return ""
    original = (texto_data or "").strip()
    s = (
        original.lower()
        .replace("dias", " ")
        .replace("dia", " ")
        .replace("do mês de", " ")
        .replace("de mês de", " ")
        .replace("do mês", " ")
        .replace("ano de", " ")
        .replace("ano de mil", "mil")
        .replace("do ano", " ")
        .replace(" aos ", " ")
        .replace("aos ", " ")
        .replace(" ao ", " ")
        .replace(" de ", " |SEP| ")
    )
    partes = [p.strip() for p in s.split("|SEP|") if p.strip()]
    dia_n = None
    mes_n = None
    ano_n = None
    for p in partes:
        cand = numero_extenso_para_int(p)
        if cand is None and p.isdigit():
            cand = int(p)
        if cand is not None:
            if 1 <= cand <= 31 and dia_n is None:
                dia_n = cand
                continue
            if 1000 <= cand <= 2999:
                ano_n = cand
                continue
        for mes_nome, mv in MESES_MAP.items():
            if mes_nome in p:
                mes_n = mv
                break
    import re as _re
    if dia_n is None:
        m = _re.search(r"(\d{1,2})\s*[/\-]", original)
        if m:
            try:
                dia_n = int(m.group(1))
            except Exception:
                pass
    if mes_n is None:
        m = _re.search(r"[/\-](\d{1,2})[/\-]", original)
        if m:
            try:
                mes_n = int(m.group(1))
            except Exception:
                pass
    if ano_n is None:
        m = _re.search(r"[/\-](\d{2,4})(?:$|\D)", original)
        if m:
            try:
                ano_n = int(m.group(1))
                if 0 <= ano_n < 100:
                    ano_n += 1900
            except Exception:
                pass
    if dia_n and mes_n and ano_n:
        return f"{dia_n:02d}/{mes_n:02d}/{ano_n:04d}"
    return original


def parse_hora_por_extenso_para_hhmm(texto_hora: str) -> str:
    """Recebe 'pelas dez horas' -> '10:00' ; 'oito e trinta' -> '08:30' ; '19h' -> '19:00'"""
    if not texto_hora:
        return ""
    original = texto_hora.strip()
    s = (
        original.lower()
        .replace("pelas", " ")
        .replace("pela", " ")
        .replace("às", " ")
        .replace("as", " ")
        .replace("horas", " ")
        .replace("hora", " ")
        .replace("h:", ":")
        .replace("h ", ":")
    )
    import re as _re
    m = _re.search(r"(\d{1,2})\s*[h:]\s*(\d{1,2})", original)
    if m:
        try:
            return f"{int(m.group(1)):02d}:{int(m.group(2)):02d}"
        except Exception:
            pass
    m2 = _re.search(r"(\d{1,2})\s*h", original, flags=_re.IGNORECASE)
    if m2:
        try:
            return f"{int(m2.group(1)):02d}:00"
        except Exception:
            pass
    if "e" in s:
        p1, p2, *_ = s.split("e") + ["", ""]
        hh = numero_extenso_para_int(p1)
        mm = numero_extenso_para_int(p2)
        if hh is not None:
            if mm is None and p2.strip():
                for k, v in {"meia": 30, "meio": 30, "trinta": 30, "quinze": 15, "vinte": 20}.items():
                    if k in p2.lower():
                        mm = v
                        break
            if mm is None:
                mm = 0
            return f"{hh:02d}:{mm:02d}"
    hh = numero_extenso_para_int(s)
    if hh is not None:
        return f"{hh:02d}:00"
    return original


def listar_modelos_disponiveis(api_base: str):
    try:
        r = requests.get(
            f"{api_base}/models",
            params={"key": GEMINI_API_KEY},
            timeout=30,
        )
        if r.status_code != 200:
            return None
        dados = r.json()
        return [
            m["name"]
            for m in dados.get("models", [])
            if "generateContent" in m.get("supportedGenerationMethods", [])
        ]
    except Exception:
        return None


def _extrair_texto_resposta_gemini(dados_resposta: dict) -> Optional[str]:
    try:
        parts = dados_resposta["candidates"][0]["content"]["parts"]
        textos = [p.get("text", "") for p in parts if p.get("text")]
        if textos:
            return "".join(textos)
    except Exception:
        pass
    return None


def _extrair_texto_resposta_gemini(dados_resposta: dict):
    """
    Extrai texto completo da resposta do Gemini, mesmo que esteja em múltiplas parts,
    múltiplos candidatos, ou até como JSON em alternativa via response.text.
    Também loga o finishReason para diagnóstico se for MAX_TOKENS/SAFETY/etc.
    """
    texto = None
    try:
        parts = dados_resposta["candidates"][0]["content"]["parts"]
        textos = [p.get("text", "") for p in parts if p.get("text")]
        if textos:
            texto = "".join(textos)
    except Exception:
        pass
    try:
        if not texto and "candidates" in dados_resposta and dados_resposta["candidates"]:
            cand = dados_resposta["candidates"][0]
            if "content" in cand and "parts" in cand["content"]:
                textos = [p.get("text", "") for p in cand["content"]["parts"] if p.get("text")]
                if textos:
                    texto = "".join(textos)
    except Exception:
        pass
    try:
        finish_reason = None
        if "candidates" in dados_resposta and dados_resposta["candidates"]:
            finish_reason = dados_resposta["candidates"][0].get("finishReason")
        usage = dados_resposta.get("usageMetadata", {})
        info = {
            "finishReason": finish_reason,
            "promptTokens": usage.get("promptTokenCount"),
            "candidatesTokens": usage.get("candidatesTokenCount"),
            "totalTokens": usage.get("totalTokenCount"),
        }
        print(f"[Curia IA] Resposta Gemini: {json.dumps(info, ensure_ascii=False)}")
        if finish_reason and finish_reason != "STOP":
            print(f"[Curia IA] ⚠️  finishReason NÃO STOP = {finish_reason}")
    except Exception:
        pass
    return texto


def _extrair_json_com_recuperacao(texto_resposta: str):
    """
    Tenta parsear JSON normalmente. Se falhar, tenta:
    1. Limpar markdown/code block
    2. Extrair substring do primeiro { ao último }
    3. Completar chaves/braços faltantes (JSON truncado pela metade)
    4. Preencher campos padrão DadosCasamento com o que foi recuperado
    """
    original = texto_resposta
    texto = original.strip()

    tentativas = []

    def _tenta_parse(t: str):
        try:
            return json.loads(t)
        except Exception:
            return None

    tentativas.append(("original", _tenta_parse(texto)))

    limpo = limpar_json_response(texto)
    tentativas.append(("limpo_md", _tenta_parse(limpo)))

    inicio = limpo.find("{")
    fim = limpo.rfind("}")
    if inicio != -1 and fim != -1 and fim > inicio:
        extraido = limpo[inicio : fim + 1]
        tentativas.append(("faixa", _tenta_parse(extraido)))

    for _, j in tentativas:
        if j is not None:
            return j

    print("[Curia IA] JSON veio truncado/inválido. Tentando recuperação heurística.")

    def _reparar_json_truncado(s: str):
        s = s.strip()
        if not s.startswith("{"):
            s = "{" + s
        abertos = s.count("{") - s.count("}")
        arrays_abertos = s.count("[") - s.count("]")
        if abertos > 0:
            s += "}" * abertos
        if arrays_abertos > 0:
            s += "]" * arrays_abertos
        padrao = r',\s*"([^"]+)"\s*:\s*$'
        import re as _re
        while _re.search(padrao, s):
            s = _re.sub(padrao, r',"\1": ""}', s)
            abertos = s.count("{") - s.count("}")
            if abertos > 0:
                s += "}" * abertos
        if s.rstrip().endswith(":"):
            s = s.rstrip()[:-1] + '""'
            abertos = s.count("{") - s.count("}")
            if abertos > 0:
                s += "}" * abertos
        return s

    try:
        reparado = _reparar_json_truncado(limpo if limpo.startswith("{") else ("{" + limpo))
        print(f"[Curia IA] Tentativa 1 reparado: {reparado[:400]}")
        j = _tenta_parse(reparado)
        if j:
            return j
    except Exception as e:
        print(f"[Curia IA] Reparação 1 falhou: {e}")

    def _extrair_campos_por_regex(s: str, chaves=None):
        import re as _re
        res = {}
        if chaves is None:
            chaves = ("nome", "profissao", "mae", "pai", "sexo")
        for chave in chaves:
            m = _re.search(rf'"{chave}"\s*:\s*"((?:[^"\\]|\\.)*)"', s)
            if m:
                raw = m.group(1)
                try:
                    decoded = (
                        raw.encode("latin-1", errors="backslashreplace")
                        .decode("unicode_escape", errors="replace")
                    )
                    res[chave] = decoded
                except Exception:
                    res[chave] = raw
        return res

    bloco_noivo = None
    bloco_noiva = None
    import re as _re
    m_n = _re.search(r'"noivo"\s*:\s*\{([^}]*)\}', limpo)
    if m_n:
        bloco_noivo = _extrair_campos_por_regex("{" + m_n.group(1) + "}")
    else:
        m_n = _re.search(r'"noivo"[\s\S]*?"nome"[\s\S]*?(?="noiva|$)', limpo)
        if m_n:
            bloco_noivo = _extrair_campos_por_regex(m_n.group(0))
    m_v = _re.search(r'"noiva"\s*:\s*\{([^}]*)\}', limpo)
    if m_v:
        bloco_noiva = _extrair_campos_por_regex("{" + m_v.group(1) + "}")
    else:
        m_v = _re.search(r'"noiva"[\s\S]*?"nome"[\s\S]*?(?="testemunha_noivo|$)', limpo)
        if m_v:
            bloco_noiva = _extrair_campos_por_regex(m_v.group(0))

    campos_raiz = _extrair_campos_por_regex(
        limpo,
        chaves=(
            "livro",
            "folha",
            "numero",
            "data_celebacao",
            "hora_celebacao",
            "local_celebacao",
            "testemunha_qualificada",
            "testemunha_noivo",
            "testemunha_noiva",
        ),
    )

    recuperado = {
        "livro": campos_raiz.get("livro", ""),
        "folha": campos_raiz.get("folha", ""),
        "numero": campos_raiz.get("numero", ""),
        "data_celebacao": campos_raiz.get("data_celebacao", ""),
        "hora_celebacao": campos_raiz.get("hora_celebacao", ""),
        "local_celebacao": campos_raiz.get("local_celebacao", ""),
        "testemunha_qualificada": campos_raiz.get("testemunha_qualificada", ""),
        "noivo": {
            "nome": (bloco_noivo or {}).get("nome", ""),
            "sexo": (bloco_noivo or {}).get("sexo", "MASCULINO"),
            "profissao": (bloco_noivo or {}).get("profissao", ""),
            "mae": (bloco_noivo or {}).get("mae", ""),
            "pai": (bloco_noivo or {}).get("pai", ""),
        },
        "noiva": {
            "nome": (bloco_noiva or {}).get("nome", ""),
            "sexo": (bloco_noiva or {}).get("sexo", "FEMININO"),
            "profissao": (bloco_noiva or {}).get("profissao", ""),
            "mae": (bloco_noiva or {}).get("mae", ""),
            "pai": (bloco_noiva or {}).get("pai", ""),
        },
        "testemunha_noivo": campos_raiz.get("testemunha_noivo", ""),
        "testemunha_noiva": campos_raiz.get("testemunha_noiva", ""),
    }
    print(f"[Curia IA] Recuperação regex: {json.dumps(recuperado, ensure_ascii=False)[:600]}")
    return recuperado


def chamar_gemini_rest(contents, modelos_tentar=None, apis_tentar=None, timeout=240):
    """
    Chama a API REST do Gemini diretamente via requests.post.
    contents: lista de partes (dict com text OU inline_data {mime_type, data}).
    Retorna (texto, modelo_usado, api_base_usada) ou levanta exceção.
    """
    global MODEL_NAME, API_BASE_ATIVA

    if modelos_tentar is None:
        modelos_tentar = []
        if MODEL_NAME:
            modelos_tentar.append(MODEL_NAME)
        for m in MODEL_CANDIDATOS:
            if m not in modelos_tentar:
                modelos_tentar.append(m)

    if apis_tentar is None:
        apis_tentar = list(dict.fromkeys([API_BASE_ATIVA] + API_BASES))

    ultimo_erro = None

    for api_base in apis_tentar:
        for model_nome in modelos_tentar:
            url = f"{api_base}/{model_nome}:generateContent?key={GEMINI_API_KEY}"
            body = {
                "contents": [{"parts": contents}],
                "generationConfig": {
                    "temperature": 0.05,
                    "topP": 0.95,
                    "topK": 40,
                    "maxOutputTokens": 8192,
                    "responseMimeType": "application/json",
                },
                "safetySettings": [
                    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"},
                    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH"},
                    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
                    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
                ],
            }
            try:
                print(f"[Curia IA] POST {api_base}/{model_nome}:generateContent (timeout={timeout}s, tokens=8192)")
                r = requests.post(url, json=body, timeout=timeout)
                if r.status_code != 200:
                    ultimo_erro = f"{model_nome}@{api_base} HTTP {r.status_code}: {r.text[:500]}"
                    print(f"[Curia IA] Falhou: {ultimo_erro}")
                    continue
                try:
                    dados = r.json()
                except Exception as je:
                    ultimo_erro = f"{model_nome}@{api_base} JSON decode: {je}. RAW: {r.text[:400]}"
                    print(f"[Curia IA] {ultimo_erro}")
                    continue
                try:
                    os.makedirs("_debug_respostas", exist_ok=True)
                    with open("_debug_respostas/_ultimo_raw.json", "w", encoding="utf-8") as f:
                        json.dump(dados, f, ensure_ascii=False, indent=2)
                except Exception:
                    pass
                txt = _extrair_texto_resposta_gemini(dados)
                if not txt:
                    ultimo_erro = f"{model_nome}@{api_base}: sem texto na resposta. JSON: {json.dumps(dados)[:500]}"
                    print(f"[Curia IA] {ultimo_erro}")
                    continue
                MODEL_NAME = model_nome
                API_BASE_ATIVA = api_base
                print(f"[Curia IA] Sucesso: {model_nome} @ {api_base} ({len(txt)} chars)")
                try:
                    os.makedirs("_debug_respostas", exist_ok=True)
                    with open("_debug_respostas/_ultimo_texto.txt", "w", encoding="utf-8") as f:
                        f.write(txt)
                except Exception:
                    pass
                return txt, model_nome, api_base
            except Exception as e:
                ultimo_erro = f"{model_nome}@{api_base} exc: {str(e)}"
                print(f"[Curia IA] Exceção: {ultimo_erro}")
                continue

    raise RuntimeError(
        f"Todos os modelos/APIs falharam. Último erro: {ultimo_erro or 'desconhecido'}"
    )



def _auto_detectar_melhor_modelo():
    global MODEL_NAME, API_BASE_ATIVA
    try:
        texto, modelo, api = chamar_gemini_rest(
            contents=[{"text": "Responda apenas o JSON {\"ping\":\"pong\"} e nada mais."}],
        )
        print(f"[Curia IA] Startup check OK: modelo={modelo} api={api} respondeu={texto[:60]}")
    except Exception as e:
        print(f"[Curia IA] Startup check avisou: {e}")


_auto_detectar_melhor_modelo()


@app.post("/extract-data", response_model=DadosCasamento)
async def extract_data(file: UploadFile = File(...)):
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY não configurada! Cole sua chave no arquivo backend/.env (linha GEMINI_API_KEY=sua_chave). Obtenha em: https://aistudio.google.com/apikey"
        )
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Arquivo deve ser uma imagem.")

    conteudo = await file.read()
    try:
        img = Image.open(io.BytesIO(conteudo))
        img.verify()
        Image.open(io.BytesIO(conteudo))
    except Exception:
        raise HTTPException(status_code=400, detail="Arquivo de imagem inválido ou corrompido.")

    mime_type = file.content_type or (mimetypes.guess_type(file.filename or "")[0] or "image/jpeg")
    if not mime_type.startswith("image/"):
        mime_type = "image/jpeg"
    b64 = base64.b64encode(conteudo).decode("ascii")

    contents = [
        {"text": SYSTEM_PROMPT},
        {"inline_data": {"mime_type": mime_type, "data": b64}},
    ]

    try:
        texto_resposta, _, _ = chamar_gemini_rest(contents, timeout=300)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao consultar Gemini: {str(e)}")

    try:
        dados = _extrair_json_com_recuperacao(texto_resposta)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Não foi possível extrair JSON válido da IA. Erro: {e}. Trecho recebido: {texto_resposta[:500]}",
        )

    if not isinstance(dados, dict):
        raise HTTPException(
            status_code=500,
            detail=f"Resposta JSON não é objeto. Trecho: {texto_resposta[:500]}",
        )

    def _extrair_cabecalho_do_ocr_bruto(texto_full: str):
        """
        Fallback final: tenta extrair data/hora/local/padre DIRETAMENTE do texto do OCR,
        sem depender do JSON estruturado. Atua sobre o texto bruto da resposta (ou do livro).
        """
        out = {"data_celebacao": "", "hora_celebacao": "", "local_celebacao": "", "testemunha_qualificada": ""}
        if not texto_full:
            return out
        import re as _re

        txt_limpo = texto_full.strip()

        padroes_data = [
            r"Aos?\s+(.{3,120}?)\s+di(?:a|as)\s+(.{5,200}?)(?:do\s+ano|ano\s+de|,|\s+pelas|\s+na\s|$)",
            r"(\d{1,2}[\s/\-]\s*(?:janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)[\s/\-]\s*\d{2,4})",
        ]
        for p in padroes_data:
            mm = _re.search(p, txt_limpo, flags=_re.IGNORECASE)
            if mm:
                candidata = " ".join(mm.groups()) if len(mm.groups()) > 1 else mm.group(1)
                parseada = parse_data_por_extenso_para_ddmmaaaa(candidata)
                if parseada and "/" in parseada and len(parseada) >= 8:
                    out["data_celebacao"] = parseada
                    break

        if not out["data_celebacao"]:
            m_ano = _re.search(r"ANO\s+DE\s+(\d{4})", txt_limpo, flags=_re.IGNORECASE)
            ano_top = m_ano.group(1) if m_ano else None
            m_dia = _re.search(r"Aos?\s+([a-zçõãáéíóúûâêô\s\-]+?)\s+di(?:a|as)", txt_limpo, flags=_re.IGNORECASE)
            m_mes = _re.search(r"m[eê]s\s+de\s+([a-zãõç]+)", txt_limpo, flags=_re.IGNORECASE)
            if m_dia and m_mes and ano_top:
                candidata = f"{m_dia.group(1).strip()} de {m_mes.group(1).strip()} de {ano_top}"
                parseada = parse_data_por_extenso_para_ddmmaaaa(candidata)
                if "/" in parseada:
                    out["data_celebacao"] = parseada

        padroes_hora = [
            r"pelas?\s+(.{3,80}?)\s+horas?",
            r"(\d{1,2}\s*[hH]\s*\d{0,2})",
            r"([oóô]ito\s+e\s+(?:meia|trinta|vinte|quinze))",
        ]
        for p in padroes_hora:
            mm = _re.search(p, txt_limpo, flags=_re.IGNORECASE)
            if mm:
                parseada = parse_hora_por_extenso_para_hhmm(mm.group(1))
                if parseada and ":" in parseada:
                    out["hora_celebacao"] = parseada
                    break

        m_local = _re.search(
            r"(?:na\s+(?:Capela|Igreja|Matriz|Paróquia|Paroquia|Cap\.?)\b[\s,]*)(.{3,120}?)(?:[,.]|desta\s+Paróquia|desta\s+Paroquia|da\s+Diocese|$)",
            txt_limpo,
            flags=_re.IGNORECASE,
        )
        if m_local:
            nome_local = m_local.group(0).strip()
            if nome_local.lower().startswith("na "):
                nome_local = nome_local[3:].strip()
            if nome_local:
                out["local_celebacao"] = nome_local.strip(" ,.")
        else:
            m_local2 = _re.search(
                r"(?:na\s+)(.{5,120}?)(?:[,.]|desta\s+Paróquia|desta\s+Paroquia|da\s+Diocese|$)",
                txt_limpo,
                flags=_re.IGNORECASE,
            )
            if m_local2:
                candidato = m_local2.group(1).strip(" ,.")
                if 5 <= len(candidato) <= 120 and "horas" not in candidato.lower():
                    out["local_celebacao"] = candidato

        m_padre = _re.search(
            r"(?:perante|ante|presente(?:s)?\s+perante)\s+(?:o\s+)?(?:Redmo\.?|Rev(?:erendissimo)?\.?|Reverendissimo|Padre|Pe\.?|P\.)([^,.\n\r]{2,160})",
            txt_limpo,
            flags=_re.IGNORECASE,
        )
        if m_padre:
            nome = m_padre.group(1).strip(" .,-\n\r")
            if nome:
                out["testemunha_qualificada"] = nome

        return out

    fallback_cabecalho = _extrair_cabecalho_do_ocr_bruto(texto_resposta)

    def _get_str(o, *keys, default=""):
        cur = o
        for k in keys:
            if not isinstance(cur, dict):
                return default
            cur = cur.get(k)
            if cur is None:
                return default
        if isinstance(cur, str):
            return cur.strip()
        return default

    livro_c = _get_str(dados, "livro")
    folha_c = _get_str(dados, "folha")
    numero_c = _get_str(dados, "numero")
    data_c = _get_str(dados, "data_celebacao") or fallback_cabecalho.get("data_celebacao", "")
    if data_c:
        data_c = parse_data_por_extenso_para_ddmmaaaa(data_c)
    hora_c = _get_str(dados, "hora_celebacao") or fallback_cabecalho.get("hora_celebacao", "")
    if hora_c:
        hora_c = parse_hora_por_extenso_para_hhmm(hora_c)
    local_c = _get_str(dados, "local_celebacao") or fallback_cabecalho.get("local_celebacao", "")
    tq = _get_str(dados, "testemunha_qualificada") or fallback_cabecalho.get("testemunha_qualificada", "")

    noivo = Pessoa(
        nome=_get_str(dados, "noivo", "nome"),
        sexo=_get_str(dados, "noivo", "sexo", default="MASCULINO") or "MASCULINO",
        profissao=_get_str(dados, "noivo", "profissao"),
        mae=_get_str(dados, "noivo", "mae"),
        pai=_get_str(dados, "noivo", "pai"),
    )
    noiva = Pessoa(
        nome=_get_str(dados, "noiva", "nome"),
        sexo=_get_str(dados, "noiva", "sexo", default="FEMININO") or "FEMININO",
        profissao=_get_str(dados, "noiva", "profissao"),
        mae=_get_str(dados, "noiva", "mae"),
        pai=_get_str(dados, "noiva", "pai"),
    )

    saida = DadosCasamento(
        livro=livro_c,
        folha=folha_c,
        numero=numero_c,
        data_celebacao=data_c,
        hora_celebacao=hora_c,
        local_celebacao=local_c,
        testemunha_qualificada=tq,
        noivo=noivo,
        noiva=noiva,
        testemunha_noivo=_get_str(dados, "testemunha_noivo"),
        testemunha_noiva=_get_str(dados, "testemunha_noiva"),
    )
    try:
        print(f"[Curia IA] Saída final para frontend: {json.dumps(saida.model_dump(mode='json'), ensure_ascii=False)}")
    except Exception:
        print(
            f"[Curia IA] Saída final ok: L={livro_c!r} F={folha_c!r} N={numero_c!r} "
            f"data={data_c!r} hora={hora_c!r} local={local_c!r} "
            f"padre={tq!r} noivo={noivo.nome!r}, noiva={noiva.nome!r}"
        )
    return saida


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_atual": MODEL_NAME,
        "api_base_ativa": API_BASE_ATIVA,
        "candidatos": MODEL_CANDIDATOS,
        "api_key_configurada": bool(GEMINI_API_KEY),
    }


@app.get("/test-gemini")
async def test_gemini():
    resultados = []
    apis = list(dict.fromkeys([API_BASE_ATIVA] + API_BASES))
    modelos = list(dict.fromkeys([MODEL_NAME] + MODEL_CANDIDATOS))
    for api_base in apis:
        for model_nome in modelos:
            item = {
                "modelo": model_nome,
                "api": api_base,
                "ok": False,
                "erro": None,
                "resposta": None,
            }
            try:
                txt, _, _ = chamar_gemini_rest(
                    contents=[{"text": "Responda apenas o JSON {\"ping\":\"pong\"} e nada mais."}],
                    modelos_tentar=[model_nome],
                    apis_tentar=[api_base],
                    timeout=60,
                )
                item["resposta"] = txt[:200]
                item["ok"] = True
                resultados.append(item)
                return {"sucesso": True, "modelo_funcional": model_nome, "api": api_base, "testes": resultados}
            except Exception as e:
                item["erro"] = str(e)[:400]
            resultados.append(item)

    modelos_reais = {}
    for ab in apis:
        modelos_reais[ab] = listar_modelos_disponiveis(ab)
    return {
        "sucesso": False,
        "mensagem": "Nenhum teste respondeu. Veja a lista de modelos reais disponíveis abaixo.",
        "testes": resultados,
        "modelos_reais_disponiveis": modelos_reais,
    }


@app.get("/list-models")
async def list_models():
    saida = {}
    for ab in list(dict.fromkeys([API_BASE_ATIVA] + API_BASES)):
        saida[ab] = listar_modelos_disponiveis(ab)
    return saida


if __name__ == "__main__":
    import uvicorn
    porta = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    print(f"[Curia IA] Iniciando servidor em {host}:{porta} ...")
    print(f"[Curia IA] API KEY configurada: {bool(GEMINI_API_KEY)} | Modelo padrão: {MODEL_NAME}")
    uvicorn.run(
        "main:app",
        host=host,
        port=porta,
        reload=False,
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
