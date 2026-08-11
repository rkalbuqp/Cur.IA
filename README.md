# Curia IA — Automação de Registros de Casamento

Monorepo com extensão Chrome (Manifest V3) e backend Python FastAPI para automatizar a digitação de registros antigos de casamento no sistema **Cúria Online (Diocese de Nazaré)** usando OCR por IA (Gemini 1.5 Flash).

---

## Estrutura

```
Cur.IA/
├── extension/           # Extensão Chrome/Edge (Manifest V3 — JS puro)
│   ├── manifest.json
│   ├── popup.html / popup.js
│   ├── generate-icons.js
│   ├── background/
│   │   └── service-worker.js
│   ├── content/
│   │   ├── utils.js         # Helpers DOM (waitForElement, setInputValue...)
│   │   ├── automation.js    # Fluxo de preenchimento do formulário
│   │   ├── widget.js        # Painel flutuante + integração API
│   │   ├── widget.css
│   │   └── main.js          # Entry point do content script
│   └── icons/           # Coloque aqui icon16.png, icon48.png, icon128.png
│
└── backend/             # API Python (FastAPI + Gemini 1.5 Flash)
    ├── main.py          # POST /extract-data
    ├── requirements.txt
    └── .env.example
```

---

## 1. Rodar o Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/Mac:
# source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env     # e edite GEMINI_API_KEY

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Teste o healthcheck: http://localhost:8000/health

---

## 2. Gerar Ícones da Extensão

O `manifest.json` referencia `icons/icon16.png`, `icon48.png`, `icon128.png`.
Gere-os rodando (requer Node.js):

```bash
cd extension
npm install          # instala o canvas (opcional)
node generate-icons.js
```

Ou coloque manualmente 3 PNGs na pasta `extension/icons/`.

---

## 3. Instalar a Extensão no Chrome/Edge

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ative o **Modo Desenvolvedor** (toggle no canto superior).
3. Clique em **"Carregar sem compactação"** e selecione a pasta `extension/`.
4. Acesse `https://diocesenazare.curiaonline.com.br/` e navegue até a tela de **Habilitação Matrimonial / Registrar Antigo**.
5. Clique no botão flutuante ⛪ no canto inferior direito para abrir o painel.

---

## 4. Fluxo de Uso

1. Abra o painel ⛪.
2. Faça upload da foto da página do livro antigo.
3. Clique **"Processar Imagem com IA"**.
4. Revise e corrija os campos extraídos diretamente no painel.
5. Clique **"Preencher Formulário Automaticamente"**.
6. A extensão executará:
   - **Passo 1**: Preenche campos principais (data, hora, local, test. qualificada).
   - **Passo 2**: Abre lupa do Noivo → Novo cadastro → Preenche → Salva → Associa.
   - **Passo 3**: Repete Noiva → Clica em **"Salvar e Continuar"**.
   - **Passo 4**: Adiciona 2 testemunhas (tipo CELEBRAÇÃO) e vincula ao Noivo/Noiva.

---

## Configuração Extra

No popup da extensão (clique no ícone ⛪ da barra de ferramentas) você pode alterar a URL do backend se rodar em outra porta/servidor.

---

## Observações Técnicas

- Todos os inputs são preenchidos disparando `input`, `change` e `blur` via `dispatchEvent` (compatibilidade com AngularJS/Vue/React do sistema legado).
- Seletores baseiam-se em textos visíveis, placeholders, `name`, `id`, `ng-model` e `formcontrolname` para maior robustez.
- Tratamento de delays e `waitForElement` em todas as etapas para aguardar modais e renderização assíncrona.
