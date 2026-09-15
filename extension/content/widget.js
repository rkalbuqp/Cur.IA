const CuriaWidget = (() => {
  const state = {
    backendUrl: "http://localhost:8000",
    selectedFile: null,
    extractedData: {
      livro: "",
      folha: "",
      numero: "",
      data_celebacao: "",
      hora_celebacao: "",
      local_celebacao: "",
      testemunha_qualificada: "",
      noivo: { nome: "", sexo: "MASCULINO", profissao: "", mae: "", pai: "" },
      noiva: { nome: "", sexo: "FEMININO", profissao: "", mae: "", pai: "" },
      testemunha_noivo: "",
      testemunha_noiva: "",
    },
    isPanelOpen: false,
    isProcessing: false,
    progress: 0,
    wordRegistros: [],
    wordIndiceAtual: -1,
    livroPadrao: "",
    wordModoAutomatico: false,
    wordPararAutomatico: false,
    wordTotalLidos: 0,
    wordTotalComSucesso: 0,
    wordTotalComErro: 0,
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s = "") => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  const STORAGE_KEY_WORD = "curia_ia_word_state";
  const salvarWordNoStorage = async () => {
    try {
      const payload = {
        wordRegistros: state.wordRegistros || [],
        wordIndiceAtual: typeof state.wordIndiceAtual === "number" ? state.wordIndiceAtual : -1,
        livroPadrao: state.livroPadrao || "",
        wordModoAutomatico: !!state.wordModoAutomatico,
        wordPararAutomatico: !!state.wordPararAutomatico,
        wordTotalLidos: state.wordTotalLidos || 0,
        wordTotalComSucesso: state.wordTotalComSucesso || 0,
        wordTotalComErro: state.wordTotalComErro || 0,
        timestamp: Date.now(),
      };
      const tmp = {};
      tmp[STORAGE_KEY_WORD] = payload;
      await chrome.storage.local.set(tmp);
      return true;
    } catch (e) {
      console.warn("[Curia IA] salvarWordNoStorage falhou (provavelmente quota/JSON grande):", e?.message || e);
      try {
        const reduzido = {
          wordRegistros: (state.wordRegistros || []).slice(0, 200),
          wordIndiceAtual: typeof state.wordIndiceAtual === "number" ? state.wordIndiceAtual : -1,
          livroPadrao: state.livroPadrao || "",
          wordModoAutomatico: !!state.wordModoAutomatico,
          wordPararAutomatico: !!state.wordPararAutomatico,
          wordTotalLidos: state.wordTotalLidos || 0,
          wordTotalComSucesso: state.wordTotalComSucesso || 0,
          wordTotalComErro: state.wordTotalComErro || 0,
          timestamp: Date.now(),
        };
        const tmp2 = {};
        tmp2[STORAGE_KEY_WORD] = reduzido;
        await chrome.storage.local.set(tmp2);
        return true;
      } catch (e2) {
        console.warn("[Curia IA] salvarWordNoStorage fallback também falhou:", e2?.message || e2);
        return false;
      }
    }
  };
  const restaurarWordDoStorage = async () => {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY_WORD);
      const s = data?.[STORAGE_KEY_WORD];
      if (!s) return false;
      if (!s.wordRegistros || !Array.isArray(s.wordRegistros) || s.wordRegistros.length === 0) return false;
      state.wordRegistros = s.wordRegistros;
      if (typeof s.wordIndiceAtual === "number" && s.wordIndiceAtual >= -1 && s.wordIndiceAtual < s.wordRegistros.length) {
        state.wordIndiceAtual = s.wordIndiceAtual;
      } else if (s.wordRegistros.length > 0) {
        state.wordIndiceAtual = 0;
      }
      if (typeof s.livroPadrao === "string") state.livroPadrao = s.livroPadrao;
      if (typeof s.wordModoAutomatico === "boolean") state.wordModoAutomatico = s.wordModoAutomatico;
      if (typeof s.wordPararAutomatico === "boolean") state.wordPararAutomatico = s.wordPararAutomatico;
      if (typeof s.wordTotalLidos === "number") state.wordTotalLidos = s.wordTotalLidos;
      if (typeof s.wordTotalComSucesso === "number") state.wordTotalComSucesso = s.wordTotalComSucesso;
      if (typeof s.wordTotalComErro === "number") state.wordTotalComErro = s.wordTotalComErro;
      return true;
    } catch (e) {
      console.warn("[Curia IA] restaurarWordDoStorage falhou:", e?.message || e);
      return false;
    }
  };

  const getBackendUrl = async () => {
    try {
      const data = await chrome.storage.local.get("backendUrl");
      if (data?.backendUrl) state.backendUrl = data.backendUrl;
    } catch (e) {}
    return state.backendUrl;
  };

  const createToggleButton = () => {
    if ($("curia-ia-toggle")) return;
    const btn = document.createElement("button");
    btn.id = "curia-ia-toggle";
    btn.className = "curia-toggle-btn";
    btn.innerHTML = "⛪";
    btn.title = "Curia IA - Automação";
    btn.addEventListener("click", () => togglePanel(true));
    document.body.appendChild(btn);
  };

  const buildPreviewHtml = () => {
    const d = state.extractedData;
    const field = (label, key, grupo = null, placeholder = "", tipo = "text") => {
      let v = "";
      if (grupo) v = (d[grupo] && d[grupo][key]) || "";
      else v = d[key] || "";
      return `
        <div class="curia-field">
          <label>${esc(label)}</label>
          <input type="${tipo}" data-field="${grupo ? grupo + "." + key : key}" value="${esc(v)}" placeholder="${esc(placeholder)}" />
        </div>`;
    };

    let navegacaoRegistros = "";
    if (state.wordRegistros && state.wordRegistros.length > 0) {
      const idx = state.wordIndiceAtual;
      const total = state.wordRegistros.length;
      const atual = idx >= 0 && idx < total ? state.wordRegistros[idx] : null;
      navegacaoRegistros = `
        <div class="curia-section-title">📘 Registros do Arquivo Word (${total} registros)</div>
        <div class="curia-preview-group">
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
            <button class="curia-btn" id="curia-word-prev" ${idx <= 0 ? "disabled" : ""}>⬅ Anterior</button>
            <div style="font-weight:bold; flex:1; text-align:center;">
              Registro <span id="curia-word-indice">${idx >= 0 ? idx + 1 : 0}</span> / ${total}
            </div>
            <button class="curia-btn" id="curia-word-next" ${idx >= total - 1 ? "disabled" : ""}>Próximo ➡</button>
          </div>
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
            <label style="font-size:12px; color:#0f172a; font-weight:bold;">🔢 Ir para Termo N.º (digite o número):</label>
            <input type="number" min="1" max="${total}" id="curia-word-input-termo" placeholder="Ex: 1, 32, 121" value="${idx >= 0 ? idx + 1 : 1}" style="flex:1; padding:6px 8px; border:1px solid #cbd5e1; border-radius:4px; font-size:13px; min-width:80px;">
            <button class="curia-btn" id="curia-word-ir" style="background:#4f46e5; color:white;">Pular</button>
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px; margin-bottom:10px;">
            <div style="font-size:13px; color:#64748b; margin-bottom:6px;">Registro atual (clique em "Aplicar" para usar):</div>
            <div style="display:flex; gap:12px; font-weight:bold; flex-wrap:wrap; margin-bottom:8px;">
              <div>LIVRO: <span style="color:#2563eb;">${esc((atual && atual.livro) ? atual.livro : (state.livroPadrao ? state.livroPadrao + " (padrão)" : "vazio"))}</span></div>
              <div>FOLHA: <span style="color:#16a34a;">${esc((atual && atual.folha) || "vazio")}</span></div>
              <div>NÚMERO: <span style="color:#dc2626;">${esc((atual && atual.numero) || "vazio")}</span></div>
            </div>
            ${atual ? `
            <div style="display:grid; gap:4px 14px; grid-template-columns: 1fr 1fr; font-size:13px; margin-top:6px; padding-top:8px; border-top:1px dashed #cbd5e1;">
              <div>📅 Data: <b>${esc(atual.data_celebacao || "—")}</b></div>
              <div>🕘 Hora: <b>${esc(atual.hora_celebacao || "—")}</b></div>
              <div style="grid-column: 1 / -1;">⛪ Local: <b>${esc(atual.local_celebacao || "—")}</b></div>
              <div style="grid-column: 1 / -1;">👨‍⚕️ Padre (T.Qualificada): <b>${esc(atual.testemunha_qualificada || "—")}</b></div>
              <div style="background:#dbeafe; padding:4px 8px; border-radius:4px;">💍 Noivo: <b>${esc((atual.noivo && atual.noivo.nome) || "—")}</b></div>
              <div style="background:#fce7f3; padding:4px 8px; border-radius:4px;">💐 Noiva: <b>${esc((atual.noiva && atual.noiva.nome) || "—")}</b></div>
              <div style="grid-column: 1 / -1; font-size:12px; color:#475569; margin-top:2px;">
                🫂 Testemunhas: <b>${esc(atual.testemunha_noivo || "—")}</b> / <b>${esc(atual.testemunha_noiva || "—")}</b>
              </div>
            </div>` : ""}
            ${!atual?.livro && state.livroPadrao ? `<div style="font-size:12px; color:#92400e; margin-top:8px;">💡 Usará o valor PADRÃO do livro: <b>${esc(state.livroPadrao)}</b></div>` : ""}
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
            <button class="curia-btn curia-btn-primary" id="curia-word-aplicar" style="flex:1;">📥 Aplicar Registro Atual</button>
            <button class="curia-btn curia-btn-primary" id="curia-word-preencher" style="flex:1;">✨ Preencher Form. c/ Automação</button>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
            <button class="curia-btn" id="curia-word-loop-start" style="flex:1; background:#0f766e; color:white;" ${total <= 0 ? "disabled" : ""}>▶️ Iniciar Lote Automático (${idx >= 0 ? idx + 1 : 1} → ${total})</button>
            <button class="curia-btn" id="curia-word-loop-stop" style="flex:1; background:#b91c1c; color:white;" ${!state.wordModoAutomatico ? "disabled" : ""}>⏹️ Parar Lote</button>
          </div>
          ${state.wordTotalLidos > 0 ? `<div style="margin-top:8px; font-size:12px; padding:6px 10px; border-radius:4px; background:#fef3c7; color:#92400e;">📊 Progresso Lote: ✅ ${state.wordTotalComSucesso} OK | ❌ ${state.wordTotalComErro} Erros | Total lidos: ${state.wordTotalLidos} de ${total}</div>` : ""}
        </div>
      `;
    }

    return `
      ${navegacaoRegistros}

      <div class="curia-section-title">📋 Registro Paroquial (LIVRO / FOLHA / NÚMERO) - OBRIGATÓRIO</div>

      <div class="curia-preview-group">
        ${field("LIVRO", "livro", null, "ex: 1, 2, 3A")}
        ${field("FOLHA", "folha", null, "ex: 181, 182, 200")}
        ${field("NÚMERO (Termo)", "numero", null, "ex: 32, 33, 158")}
      </div>

      <div class="curia-section-title">🎉 Dados da Celebração (1º passo do formulário)</div>

      <div class="curia-preview-group">
        ${field("Data da Celebração (DD/MM/AAAA)", "data_celebacao", null, "ex: 28/01/1955", "text")}
        ${field("Hora da Celebração (HH:MM)", "hora_celebacao", null, "ex: 10:00", "text")}
        ${field("Local / Paróquia / Capela", "local_celebacao", null, "ex: Capela de Autas, Boa Alfredo")}
        ${field("Testemunha Qualificada (Padre Celebrante / Redmo.)", "testemunha_qualificada", null, "ex: Pe. Joaquim Gurgel")}
      </div>

      <div class="curia-section-title">📝 Cadastro dos Noivos (2º e 3º passos)</div>

      <div class="curia-preview-group">
        <h4>🤵 Noivo</h4>
        ${field("Nome Completo", "nome", "noivo")}
        ${field("Profissão", "profissao", "noivo")}
        ${field("Mãe", "mae", "noivo")}
        ${field("Pai", "pai", "noivo")}
      </div>

      <div class="curia-preview-group">
        <h4>👰 Noiva</h4>
        ${field("Nome Completo", "nome", "noiva")}
        ${field("Profissão", "profissao", "noiva")}
        ${field("Mãe", "mae", "noiva")}
        ${field("Pai", "pai", "noiva")}
      </div>

      <div class="curia-section-title">🤝 Testemunhas de Celebração (4º passo)</div>

      <div class="curia-preview-group">
        ${field("Testemunha do Noivo", "testemunha_noivo")}
        ${field("Testemunha da Noiva", "testemunha_noiva")}
      </div>
    `;
  };

  const buildPanelHtml = () => {
    return `
      <div class="curia-widget-panel">
        <div class="curia-widget-header">
          <h3><span class="curia-badge">⛪</span> Curia IA - Automação</h3>
          <button class="curia-widget-close" id="curia-close" title="Minimizar">&times;</button>
        </div>
        <div class="curia-widget-body">

          <div class="curia-section-title">📘 Upload de Arquivo Word (Transcrição)</div>
          <label class="curia-upload" id="curia-upload-word-area" style="background:linear-gradient(135deg,#fef3c7 0%,#fde68a 100%); border-color:#f59e0b;">
            <input type="file" id="curia-word-input" accept=".docx" />
            <span class="curia-upload-label">
              <div class="curia-upload-icon">📝</div>
              <div class="curia-upload-text">Upload do arquivo Word (.docx)</div>
              <div class="curia-upload-sub">Extrai LIVRO / FOLHA / NÚMERO automaticamente</div>
              <div class="curia-file-name" id="curia-word-name"></div>
            </span>
          </label>

          <div class="curia-field" style="margin-top:10px;">
            <label>📖 LIVRO PADRÃO (para todos os registros, se não tiver no documento):</label>
            <input type="text" id="curia-livro-padrao" value="${esc(state.livroPadrao)}" placeholder="Ex: 1, 2, 3A — o documento de 1965 NÃO tem o número do livro explícito" />
          </div>

          <div class="curia-divider" style="margin:12px 0;"></div>

          <div class="curia-section-title">📷 Upload da Foto do Livro (OCR IA)</div>
          <label class="curia-upload" id="curia-upload-area">
            <input type="file" id="curia-file-input" accept="image/*" />
            <span class="curia-upload-label">
              <div class="curia-upload-icon">📄</div>
              <div class="curia-upload-text">Clique ou arraste uma foto aqui</div>
              <div class="curia-upload-sub">PNG, JPG, JPEG, WEBP</div>
              <div class="curia-file-name" id="curia-file-name"></div>
            </span>
          </label>

          <button class="curia-btn curia-btn-primary" id="curia-process-btn" disabled>
            🔍 Processar Imagem com IA
          </button>

          <div id="curia-status-box" style="display:none;"></div>

          <div id="curia-progress-wrap" style="display:none;">
            <div class="curia-progress"><div class="curia-progress-bar" id="curia-progress-bar"></div></div>
          </div>

          <div id="curia-preview-area">${buildPreviewHtml()}</div>

          <div class="curia-divider"></div>

          <button class="curia-btn curia-btn-secondary" id="curia-fill-btn" disabled>
            ✨ Preencher Formulário Automaticamente
          </button>

          <div class="curia-divider"></div>

          <div class="curia-section-title">⚙️ Configuração do Backend (OCR Gemini)</div>
          <div class="curia-field">
            <label>URL do Backend:</label>
            <input type="text" id="curia-backend-url" value="${esc(state.backendUrl)}" placeholder="https://seu-backend.onrender.com ou http://localhost:8000" />
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="curia-btn curia-btn-primary" id="curia-salvar-backend-btn" style="flex:1;">💾 Salvar URL</button>
            <button class="curia-btn" id="curia-testar-backend-btn" style="flex:1;">🔗 Testar Conexão</button>
          </div>
          <div style="font-size: 11px; color: #64748b; margin-top: 6px; line-height: 1.4;">
            💡 Local: http://localhost:8000 | Online Render/Vercel: https://NOME-SEU.onrender.com (sem barra no final)
          </div>

        </div>
      </div>
    `;
  };

  const mountPanel = () => {
    let host = $("curia-ia-widget");
    if (!host) {
      host = document.createElement("div");
      host.id = "curia-ia-widget";
      document.body.appendChild(host);
    }
    host.innerHTML = buildPanelHtml();
    bindEvents();
    bindDelegacaoWidget();
  };

  const togglePanel = (open = null) => {
    const host = $("curia-ia-widget");
    const toggle = $("curia-ia-toggle");
    if (open === null) open = !state.isPanelOpen;
    state.isPanelOpen = open;
    if (host) host.style.display = open ? "block" : "none";
    if (toggle) toggle.style.display = open ? "none" : "flex";
  };

  const setStatus = (mensagem, tipo = "info") => {
    const box = $("curia-status-box");
    if (!box) return;
    if (!mensagem) {
      box.style.display = "none";
      box.innerHTML = "";
      return;
    }
    box.style.display = "flex";
    const cls = tipo === "erro" ? "curia-status-error" : tipo === "sucesso" ? "curia-status-success" : "";
    box.className = `curia-status ${cls}`;
    box.innerHTML = `<span class="curia-status-dot"></span><span>${esc(mensagem)}</span>`;
  };

  const setProgress = (p) => {
    state.progress = p;
    const wrap = $("curia-progress-wrap");
    const bar = $("curia-progress-bar");
    if (!wrap || !bar) return;
    wrap.style.display = p > 0 && p < 100 ? "block" : "none";
    bar.style.width = `${Math.max(0, Math.min(100, p))}%`;
  };

  const refreshPreview = () => {
    const area = $("curia-preview-area");
    if (area) area.innerHTML = buildPreviewHtml();
    bindPreviewInputs();
    const fillBtn = $("curia-fill-btn");
    if (fillBtn) {
      const temDados =
        state.extractedData.livro ||
        state.extractedData.folha ||
        state.extractedData.numero ||
        state.extractedData.noivo.nome ||
        state.extractedData.noiva.nome ||
        state.extractedData.testemunha_noivo ||
        state.extractedData.testemunha_noiva;
      fillBtn.disabled = !temDados || state.isProcessing;
    }
  };

  const bindPreviewInputs = () => {
    const inputs = document.querySelectorAll("#curia-ia-widget input[data-field]");
    inputs.forEach((inp) => {
      inp.addEventListener("input", () => {
        const path = inp.getAttribute("data-field");
        const [grupo, campo] = path.split(".");
        if (campo) {
          if (state.extractedData[grupo]) state.extractedData[grupo][campo] = inp.value;
        } else {
          state.extractedData[grupo] = inp.value;
        }
        const fillBtn = $("curia-fill-btn");
        if (fillBtn) {
          const temDados =
            state.extractedData.livro ||
            state.extractedData.folha ||
            state.extractedData.numero ||
            state.extractedData.noivo.nome ||
            state.extractedData.noiva.nome ||
            state.extractedData.testemunha_noivo ||
            state.extractedData.testemunha_noiva;
          fillBtn.disabled = !temDados || state.isProcessing;
        }
      });
    });
    const inpLivroPadrao = $("curia-livro-padrao");
    if (inpLivroPadrao) {
      inpLivroPadrao.addEventListener("change", async () => {
        state.livroPadrao = String(inpLivroPadrao.value || "").trim();
        try { await salvarWordNoStorage(); } catch(_){}
      });
      inpLivroPadrao.addEventListener("blur", async () => {
        state.livroPadrao = String(inpLivroPadrao.value || "").trim();
        try { await salvarWordNoStorage(); } catch(_){}
      });
    }
    const inpTermo = $("curia-word-input-termo");
    if (inpTermo) {
      inpTermo.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const btn = $("curia-word-ir");
          if (btn) btn.click();
        }
      });
    }
  };

  const bindDelegacaoWidget = () => {
    const widgetHost = $("curia-ia-widget");
    if (!widgetHost || widgetHost.dataset.delegacaoAtiva === "1") return;
    widgetHost.dataset.delegacaoAtiva = "1";

    widgetHost.addEventListener("click", (ev) => {
      const t = ev.target;
      if (!t) return;
      const btn = t.closest && t.closest("button, [data-action]");
      if (!btn || btn.nodeType !== 1) return;

      const id = btn.getAttribute("id") || "";
      const acao = btn.getAttribute("data-action") || id;

      try {
        switch (acao) {
          case "curia-close":
            togglePanel(false);
            break;
          case "curia-word-prev":
            if (btn.disabled) break;
            wordAnterior();
            break;
          case "curia-word-next":
            if (btn.disabled) break;
            wordProximo();
            break;
          case "curia-word-ir": {
            if (btn.disabled) break;
            const inputTermo = $("curia-word-input-termo");
            if (!inputTermo) break;
            const v = String(inputTermo.value || "").trim();
            if (!v) { setStatus("⚠️ Digite um número de termo para pular.", "erro"); break; }
            const n = parseInt(v, 10);
            if (isNaN(n) || n < 1 || n > state.wordRegistros.length) {
              setStatus(`❌ Número inválido: digite entre 1 e ${state.wordRegistros.length}.`, "erro");
              break;
            }
            state.wordIndiceAtual = n - 1;
            refreshPreview();
            setStatus(`✅ Pulado para Termo N. ${n} (índice ${state.wordIndiceAtual})`, "sucesso");
            try { salvarWordNoStorage(); } catch(_){}
            break;
          }
          case "curia-word-aplicar":
            if (btn.disabled) break;
            wordAplicar();
            break;
          case "curia-word-preencher":
            if (btn.disabled) break;
            wordAplicarEPreencher();
            break;
          case "curia-word-loop-start":
            if (btn.disabled) break;
            state.wordModoAutomatico = true;
            state.wordPararAutomatico = false;
            state.wordTotalLidos = 0;
            state.wordTotalComSucesso = 0;
            state.wordTotalComErro = 0;
            if (state.wordIndiceAtual < 0) state.wordIndiceAtual = 0;
            refreshPreview();
            setStatus(`▶️ Lote automático INICIADO! Do registro ${state.wordIndiceAtual + 1} até o ${state.wordRegistros.length}. Não feche a aba!`, "info");
            setTimeout(async () => {
              try {
                wordAplicar();
                await preencherFormulario("loopword");
              } catch(e) {
                console.error("[Curia IA] Erro ao iniciar lote:", e);
              }
            }, 400);
            break;
          case "curia-word-loop-stop":
            if (btn.disabled) break;
            state.wordPararAutomatico = true;
            setStatus("⏹️ Pedido de PARADA do lote automático recebido. Aguardando final do registro atual...", "info");
            refreshPreview();
            break;
          case "curia-process-btn":
            if (btn.disabled) break;
            processarImagem();
            break;
          case "curia-fill-btn":
            if (btn.disabled) break;
            preencherFormulario();
            break;
          case "curia-salvar-backend-btn":
            (async () => {
              const input = $("curia-backend-url");
              if (!input) return;
              let url = (input.value || "").trim();
              if (url.endsWith("/")) url = url.slice(0, -1);
              if (url) {
                state.backendUrl = url;
                try {
                  await chrome.storage.local.set({ backendUrl: url });
                } catch (_) {}
                setStatus(`✅ URL do backend salva com sucesso: ${url}`, "sucesso");
                input.style.borderColor = "#22c55e";
                setTimeout(() => { if (input) input.style.borderColor = ""; }, 1500);
              } else {
                setStatus("❌ Informe uma URL válida.", "erro");
              }
            })();
            break;
          case "curia-testar-backend-btn":
            (async () => {
              const input = $("curia-backend-url");
              let url = state.backendUrl;
              if (input) {
                const v = (input.value || "").trim();
                if (v) url = v.endsWith("/") ? v.slice(0, -1) : v;
              }
              setStatus(`🧪 Testando conexão com backend em: ${url}/health ...`, "info");
              try {
                const t0 = Date.now();
                const resp = await fetch(`${url}/health`, { method: "GET" });
                const ms = Date.now() - t0;
                if (!resp.ok) throw new Error("HTTP " + resp.status);
                const data = await resp.json().catch(() => ({}));
                const keyOk = !!data?.api_key_configurada ? "✅ API Key OK" : "⚠️ API Key NÃO configurada";
                const modelo = data?.model_atual || "?";
                setStatus(`✅ Backend ONLINE (${ms} ms) | ${keyOk} | Modelo: ${modelo}`, "sucesso");
              } catch (e) {
                setStatus(`❌ Falha na conexão (${e.message || e}).`, "erro");
              }
            })();
            break;
        }
      } catch (e) {
        console.error("[Curia IA] Erro delegação clique:", e, btn);
      }
    });

    widgetHost.addEventListener("input", (ev) => {
      const t = ev.target;
      if (!t || t.nodeType !== 1) return;
      if (t.id === "curia-livro-padrao") {
        state.livroPadrao = (t.value || "").trim();
        refreshPreview();
      }
    });

    widgetHost.addEventListener("change", (ev) => {
      const t = ev.target;
      if (!t || t.nodeType !== 1) return;

      if (t.id === "curia-word-input") {
        const f = t.files?.[0];
        if (!f) return;
        const wordName = $("curia-word-name");
        if (wordName) wordName.textContent = f.name;
        processarUploadWord(f);
        return;
      }

      if (t.id === "curia-file-input") {
        const f = t.files?.[0];
        if (!f) return;
        state.selectedFile = f;
        const fileName = $("curia-file-name");
        if (fileName) fileName.textContent = f.name;
        const processBtn = $("curia-process-btn");
        if (processBtn) processBtn.disabled = false;
        return;
      }
    });

    ["dragenter", "dragover"].forEach((evNome) => {
      widgetHost.addEventListener(evNome, (ev) => {
        const t = ev.target;
        const area = t && t.closest ? (t.closest("#curia-upload-word-area") || t.closest("#curia-upload-area")) : null;
        if (!area) return;
        ev.preventDefault();
        area.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach((evNome) => {
      widgetHost.addEventListener(evNome, (ev) => {
        const t = ev.target;
        const area = t && t.closest ? (t.closest("#curia-upload-word-area") || t.closest("#curia-upload-area")) : null;
        if (!area) return;
        ev.preventDefault();
        area.classList.remove("dragover");
      });
    });
    widgetHost.addEventListener("drop", (ev) => {
      const t = ev.target;
      if (!t || !t.closest) return;

      const wordArea = t.closest("#curia-upload-word-area");
      const imgArea = t.closest("#curia-upload-area");
      if (!wordArea && !imgArea) return;
      ev.preventDefault();

      const f = ev.dataTransfer?.files?.[0];
      if (!f) return;

      if (wordArea && (f.name.endsWith(".docx") || f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document")) {
        const wordName = $("curia-word-name");
        if (wordName) wordName.textContent = f.name;
        processarUploadWord(f);
        return;
      }
      if (imgArea && f.type && f.type.startsWith("image/")) {
        state.selectedFile = f;
        const fileName = $("curia-file-name");
        if (fileName) fileName.textContent = f.name;
        const processBtn = $("curia-process-btn");
        if (processBtn) processBtn.disabled = false;
      }
    });

    widgetHost.addEventListener("click", (ev) => {
      const t = ev.target;
      if (!t || !t.closest) return;
      const wordArea = t.closest("#curia-upload-word-area");
      const imgArea = t.closest("#curia-upload-area");
      if (wordArea && ev.target.tagName !== "INPUT") {
        const inp = $("curia-word-input");
        if (inp) inp.click();
      }
      if (imgArea && ev.target.tagName !== "INPUT") {
        const inp = $("curia-file-input");
        if (inp) inp.click();
      }
    });
  };

  const processarImagem = async () => {
    if (!state.selectedFile || state.isProcessing) return;
    try {
      state.isProcessing = true;
      const processBtn = $("curia-process-btn");
      const fillBtn = $("curia-fill-btn");
      if (processBtn) processBtn.disabled = true;
      if (fillBtn) fillBtn.disabled = true;

      setStatus("Lendo imagem e enviando para IA...", "info");
      setProgress(15);

      const backend = await getBackendUrl();
      const formData = new FormData();
      formData.append("file", state.selectedFile);

      const res = await fetch(`${backend}/extract-data`, {
        method: "POST",
        body: formData,
      });

      setProgress(70);

      if (!res.ok) {
        let err = `Erro ${res.status}`;
        try {
          const e = await res.json();
          if (e?.detail) err = e.detail;
        } catch (_) {}
        throw new Error(err);
      }

      const dados = await res.json();
      state.extractedData = {
        livro: dados.livro || "",
        folha: dados.folha || "",
        numero: dados.numero || "",
        data_celebacao: dados.data_celebacao || "",
        hora_celebacao: dados.hora_celebacao || "",
        local_celebacao: dados.local_celebacao || "",
        testemunha_qualificada: dados.testemunha_qualificada || "",
        noivo: {
          nome: dados.noivo?.nome || "",
          sexo: dados.noivo?.sexo || "MASCULINO",
          profissao: dados.noivo?.profissao || "",
          mae: dados.noivo?.mae || "",
          pai: dados.noivo?.pai || "",
        },
        noiva: {
          nome: dados.noiva?.nome || "",
          sexo: dados.noiva?.sexo || "FEMININO",
          profissao: dados.noiva?.profissao || "",
          mae: dados.noiva?.mae || "",
          pai: dados.noiva?.pai || "",
        },
        testemunha_noivo: dados.testemunha_noivo || "",
        testemunha_noiva: dados.testemunha_noiva || "",
      };

      setProgress(100);
      setTimeout(() => setProgress(0), 500);
      setStatus("Dados extraídos com sucesso! Revise abaixo antes de preencher.", "sucesso");
      refreshPreview();
    } catch (e) {
      console.error("[Curia IA]", e);
      setStatus(`Erro no processamento: ${e.message || e}`, "erro");
      setProgress(0);
    } finally {
      state.isProcessing = false;
      const processBtn = $("curia-process-btn");
      if (processBtn) processBtn.disabled = !state.selectedFile;
      const fillBtn = $("curia-fill-btn");
      if (fillBtn) {
        const temDados =
          state.extractedData.livro ||
          state.extractedData.folha ||
          state.extractedData.numero ||
          state.extractedData.noivo.nome ||
          state.extractedData.noiva.nome ||
          state.extractedData.testemunha_noivo ||
          state.extractedData.testemunha_noiva;
        fillBtn.disabled = !temDados;
      }
    }
  };

  const getAutomationModule = () => {
    try {
      if (typeof CuriaAutomation !== "undefined" && CuriaAutomation?.executarFluxoCompleto) return CuriaAutomation;
    } catch (_) {}
    try {
      if (window.CuriaAutomation?.executarFluxoCompleto) return window.CuriaAutomation;
    } catch (_) {}
    return null;
  };

  const getUtilsModule = () => {
    try {
      if (typeof CuriaUtils !== "undefined" && CuriaUtils) return CuriaUtils;
    } catch (_) {}
    try {
      if (window.CuriaUtils) return window.CuriaUtils;
    } catch (_) {}
    return null;
  };

  const esperarModulosCarregarem = (timeoutMs = 15000) => {
    return new Promise((resolve, reject) => {
      const inicio = Date.now();
      const tentar = () => {
        const a = getAutomationModule();
        const u = getUtilsModule();
        if (a && u) return resolve({ a, u });
        if (Date.now() - inicio > timeoutMs) {
          const faltam = [];
          if (!getAutomationModule()) faltam.push("CuriaAutomation");
          if (!getUtilsModule()) faltam.push("CuriaUtils");
          return reject(new Error(`Timeout carregando módulos. Faltam: ${faltam.join(", ")}. Recarregue a página (F5).`));
        }
        setTimeout(tentar, 100);
      };
      tentar();
    });
  };

  const STORAGE_KEY = "curia_ia_sessao_automacao";
  const storageGet = async () => {
    try {
      return await new Promise((r) => {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get([STORAGE_KEY], (o) => r(o?.[STORAGE_KEY] || null));
        } else if (typeof browser !== "undefined" && browser.storage && browser.storage.local) {
          browser.storage.local.get(STORAGE_KEY).then((o) => r(o?.[STORAGE_KEY] || null)).catch(() => r(null));
        } else r(null);
      });
    } catch (_) { return null; }
  };
  const storageClear = async () => {
    try {
      await new Promise((r) => {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.remove([STORAGE_KEY], () => r(true));
        } else if (typeof browser !== "undefined" && browser.storage && browser.storage.local) {
          browser.storage.local.remove(STORAGE_KEY).then(() => r(true)).catch(() => r(false));
        } else r(false);
      });
      return true;
    } catch (_) { return false; }
  };

  const restaurarDadosDaSessaoSeExistir = async () => {
    try {
      const sessao = await storageGet();
      if (!sessao || !sessao.dados) return null;
      const idadeMs = Date.now() - (sessao.timestamp || 0);
      if (idadeMs > 1000 * 60 * 10) {
        await storageClear();
        return null;
      }
      const d = sessao.dados;
      const raiz = ["livro","folha","numero","data_celebacao","hora_celebacao","local_celebacao","testemunha_qualificada","testemunha_noivo","testemunha_noiva"];
      for (const k of raiz) {
        if (typeof d[k] === "string") state.extractedData[k] = d[k];
      }
      ["noivo","noiva"].forEach((grupo) => {
        if (d && d[grupo] && typeof d[grupo] === "object") {
          ["nome","sexo","profissao","mae","pai"].forEach((k) => {
            if (typeof d[grupo][k] === "string") state.extractedData[grupo][k] = d[grupo][k];
          });
        }
      });
      console.log("[Curia IA] ♻️ Dados extraídos restaurados do storage (após navegação). Sessão idade:", Math.round(idadeMs/1000), "s");
      return sessao;
    } catch (e) {
      console.warn("[Curia IA] Não restaurou dados do storage:", e);
      return null;
    }
  };

  const iniciarWatchdogRetomadaFluxo = async () => {
    try {
      const mod = await esperarModulosCarregarem(12000).catch(() => null);
      if (!mod || !mod.a) return;
      const sessao = await storageGet();
      if (!sessao || sessao.etapa !== "aguardando_tela_testemunhas" || !sessao.dados) return;
      const inicio = Date.now();
      const timeoutMs = 1000 * 30;
      const maxTentativa = () => Date.now() - inicio < timeoutMs;
      let jaRetomou = false;
      const tentar = async () => {
        if (jaRetomou || !maxTentativa()) return;
        try {
          const sessaoAgora = await storageGet();
          if (!sessaoAgora || sessaoAgora.etapa !== "aguardando_tela_testemunhas") return;
          if (mod.a.estaNaTelaDeTestemunhas && mod.a.estaNaTelaDeTestemunhas()) {
            jaRetomou = true;
            // ANTES DE TUDO: garantir que temos os registros do Word (se perdeu por navegação)
            try {
              if (!state.wordRegistros || state.wordRegistros.length === 0) {
                await restaurarWordDoStorage();
              }
            } catch(_) {}
            const ehLoop = !!state.wordModoAutomatico;
            console.log("[Curia IA] 🚨 Watchdog: detectada tela de testemunhas e sessão pendente! Retomando fluxo" + (ehLoop ? " (modo loop word automático)." : "."));
            setProgress(77);
            setStatus((ehLoop ? `🔄 [LOTE ${state.wordTotalComSucesso+1}/${state.wordRegistros.length}] ` : "") + "⚡ Detectada nova página! Retomando: TESTEMUNHAS → L/F/N → GRAVAR → REGISTRAR ANTIGO...", "info");
            const fillBtn = $("curia-fill-btn");
            if (fillBtn) fillBtn.disabled = true;
            state.isProcessing = true;
            const callback = (passo, percentual) => {
              setStatus((ehLoop ? `🔄 [LOTE ${state.wordTotalComSucesso+1}/${state.wordRegistros.length}] ` : "") + passo, "info");
              setProgress(percentual);
            };
            let sucessoRetomada = false;
            try {
              if (mod.a.retomarFluxoAposNavegacao && typeof mod.a.retomarFluxoAposNavegacao === "function") {
                const res = await mod.a.retomarFluxoAposNavegacao(callback);
                sucessoRetomada = !!(res && res.finalizado);
              } else {
                await mod.a.passo4Testemunhas(sessaoAgora.dados, callback);
                await U.sleep(800);
                if (mod.a.passo5ClicarGravarMatrimonio) await mod.a.passo5ClicarGravarMatrimonio(callback);
                await U.sleep(900);
                if (mod.a.passo6ClicarRegistrarAntigo) await mod.a.passo6ClicarRegistrarAntigo(callback);
                await mod.a.storageClear && mod.a.storageClear();
                sucessoRetomada = true;
              }
            } catch (e) {
              console.error("[Curia IA] Erro retomada fluxo:", e);
              setStatus((ehLoop ? `[LOTE ${state.wordTotalLidos}/${state.wordRegistros.length}] ` : "") + `Erro na retomada: ${e.message || e}`, "erro");
            } finally {
              state.isProcessing = false;
              if (fillBtn) fillBtn.disabled = false;
              setTimeout(() => setProgress(0), 1500);
              if (ehLoop) {
                state.wordTotalLidos++;
                try { await salvarWordNoStorage(); } catch(_){}
                if (sucessoRetomada) {
                  state.wordTotalComSucesso++;
                  try { await salvarWordNoStorage(); } catch(_){}
                  if (!state.wordPararAutomatico && state.wordIndiceAtual < state.wordRegistros.length - 1) {
                    setTimeout(async () => {
                      try {
                        state.wordIndiceAtual++;
                        refreshPreview();
                        try { await salvarWordNoStorage(); } catch(_){}
                        setStatus(`🔄 [LOTE AUTO] Avançando p/ registro ${state.wordIndiceAtual + 1}...`, "info");
                        wordAplicar();
                        await preencherFormulario("loopword");
                      } catch(e2) {
                        console.error("[Curia IA] Erro loop word watchdog:", e2);
                        state.wordModoAutomatico = false;
                        try { await salvarWordNoStorage(); } catch(_){}
                      }
                    }, 1400);
                  } else {
                    state.wordModoAutomatico = false;
                    try { await salvarWordNoStorage(); } catch(_){}
                    const loopBtnStart = $("curia-word-loop-start");
                    const loopBtnStop = $("curia-word-loop-stop");
                    if (loopBtnStart) loopBtnStart.disabled = false;
                    if (loopBtnStop) loopBtnStop.disabled = true;
                    setStatus(`🎉 [LOTE AUTO] CONCLUÍDO! ${state.wordTotalComSucesso} OK de ${state.wordRegistros.length}.`, "sucesso");
                  }
                } else {
                  state.wordTotalComErro++;
                  try { await salvarWordNoStorage(); } catch(_){}
                  if (!state.wordPararAutomatico && state.wordIndiceAtual < state.wordRegistros.length - 1) {
                    setTimeout(async () => {
                      try {
                        state.wordIndiceAtual++;
                        refreshPreview();
                        try { await salvarWordNoStorage(); } catch(_){}
                        wordAplicar();
                        await preencherFormulario("loopword");
                      } catch(_) { state.wordModoAutomatico = false; try { await salvarWordNoStorage(); } catch(_){} }
                    }, 2200);
                  } else {
                    state.wordModoAutomatico = false;
                    try { await salvarWordNoStorage(); } catch(_){}
                  }
                }
              } else if (sucessoRetomada) {
                setStatus("✅ Casamento salvo! Gravar + Registrar Antigo executados após navegação.", "sucesso");
              }
            }
            return;
          }
          setTimeout(tentar, 500);
        } catch (e) {
          console.warn("[Curia IA] Watchdog falhou (tentativa):", e);
          if (maxTentativa()) setTimeout(tentar, 500);
        }
      };
      setTimeout(tentar, 800);
    } catch (_) {}
  };

  const temDados = () => {
    const d = state.extractedData;
    return !!(d && (d.livro || d.folha || d.numero || d.data_celebacao || d.noivo?.nome || d.noiva?.nome));
  };

  const preencherFormulario = async (modo = "manual") => {
    if (state.isProcessing) return;
    const ehLoop = String(modo || "").toLowerCase() === "loopword";
    try {
      state.isProcessing = true;
      const fillBtn = $("curia-fill-btn");
      if (fillBtn) fillBtn.disabled = true;
      const loopBtnStart = $("curia-word-loop-start");
      const loopBtnStop = $("curia-word-loop-stop");
      if (ehLoop) {
        if (loopBtnStart) loopBtnStart.disabled = true;
        if (loopBtnStop) loopBtnStop.disabled = false;
      }

      const mod = await esperarModulosCarregarem(10000);
      if (!mod.a || !mod.a.executarFluxoCompleto) {
        throw new Error("Módulo de automação não carregado. Tente recarregar a página (F5) e recarregar a extensão.");
      }

      setProgress(5);
      setStatus((ehLoop ? `🔄 [LOTE AUTO ${state.wordTotalComSucesso+1}/${state.wordRegistros.length}] ` : "") + "Iniciando preenchimento automático...", "info");

      const callback = (passo, percentual) => {
        setStatus((ehLoop ? `🔄 [LOTE ${state.wordTotalComSucesso+1}/${state.wordRegistros.length}] ` : "") + passo, "info");
        setProgress(percentual);
      };

      await mod.a.executarFluxoCompleto(state.extractedData, callback);

      state.wordTotalLidos++;
      state.wordTotalComSucesso++;
      setProgress(100);
      setTimeout(() => setProgress(0), 800);
      try { await salvarWordNoStorage(); } catch(_){}
      setStatus((ehLoop ? `🔄 [LOTE ${state.wordTotalComSucesso}/${state.wordRegistros.length} OK] ` : "") + "✅ Preenchimento concluído! Gravar + Registrar Antigo executados.", "sucesso");

      if (ehLoop) {
        if (state.wordPararAutomatico) {
          state.wordModoAutomatico = false;
          state.wordPararAutomatico = false;
          try { await salvarWordNoStorage(); } catch(_){}
          setStatus(`⏹️ Lote automático PARADO pelo usuário. Último sucesso: ${state.wordTotalComSucesso} de ${state.wordRegistros.length}.`, "info");
          if (loopBtnStart) loopBtnStart.disabled = false;
          if (loopBtnStop) loopBtnStop.disabled = true;
          return;
        }
        const idxAtual = state.wordIndiceAtual;
        if (idxAtual < state.wordRegistros.length - 1) {
          setTimeout(async () => {
            try {
              state.wordIndiceAtual = idxAtual + 1;
              refreshPreview();
              try { await salvarWordNoStorage(); } catch(_){}
              setStatus(`🔄 [LOTE AUTO] Avançando p/ registro ${state.wordIndiceAtual + 1}... Aplicando & preenchendo automático.`, "info");
              wordAplicar();
              await preencherFormulario("loopword");
            } catch(e) {
              console.error("[Curia IA] Erro loop word:", e);
              setStatus(`❌ [LOTE AUTO] Erro no registro ${state.wordIndiceAtual + 1}: ${e.message || e}`, "erro");
              state.wordModoAutomatico = false;
              try { await salvarWordNoStorage(); } catch(_){}
            }
          }, 1400);
        } else {
          state.wordModoAutomatico = false;
          try { await salvarWordNoStorage(); } catch(_){}
          setStatus(`🎉 [LOTE AUTO] CONCLUÍDO! ${state.wordTotalComSucesso} registros processados de ${state.wordRegistros.length}. Parabéns!`, "sucesso");
          if (loopBtnStart) loopBtnStart.disabled = false;
          if (loopBtnStop) loopBtnStop.disabled = true;
        }
      }
    } catch (e) {
      state.wordTotalLidos++;
      state.wordTotalComErro++;
      console.error("[Curia IA]", e);
      try { await salvarWordNoStorage(); } catch(_){}
      setStatus((ehLoop ? `[LOTE ${state.wordTotalLidos}/${state.wordRegistros.length}] ` : "") + `Erro no preenchimento: ${e.message || e}`, "erro");
      setProgress(0);
      if (ehLoop) {
        if (!state.wordPararAutomatico && state.wordIndiceAtual < state.wordRegistros.length - 1) {
          setTimeout(async () => {
            try {
              state.wordIndiceAtual++;
              refreshPreview();
              try { await salvarWordNoStorage(); } catch(_){}
              setStatus(`🔄 [LOTE AUTO] Pulando p/ registro ${state.wordIndiceAtual + 1} devido a erro...`, "info");
              wordAplicar();
              await preencherFormulario("loopword");
            } catch(err) {
              state.wordModoAutomatico = false;
              try { await salvarWordNoStorage(); } catch(_){}
            }
          }, 2200);
        } else {
          state.wordModoAutomatico = false;
          try { await salvarWordNoStorage(); } catch(_){}
          const loopBtnStart = $("curia-word-loop-start");
          const loopBtnStop = $("curia-word-loop-stop");
          if (loopBtnStart) loopBtnStart.disabled = false;
          if (loopBtnStop) loopBtnStop.disabled = true;
        }
      }
    } finally {
      state.isProcessing = false;
      const fillBtn = $("curia-fill-btn");
      if (fillBtn) fillBtn.disabled = false;
    }
  };

  const lerUInt32LE = (view, offset) => view.getUint32(offset, true);
  const lerUInt16LE = (view, offset) => view.getUint16(offset, true);

  const procurarArquivoNoZip = async (arrayBuffer, nomeArquivo) => {
    const view = new DataView(arrayBuffer);
    const tam = arrayBuffer.byteLength;
    const ASSINATURA_EOCD = 0x06054b50;
    let offEocd = -1;
    for (let i = tam - 22; i >= Math.max(0, tam - 65557); i--) {
      if (lerUInt32LE(view, i) === ASSINATURA_EOCD) { offEocd = i; break; }
    }
    if (offEocd === -1) throw new Error("Arquivo ZIP inválido (EOCD não encontrado).");

    const offCentralDir = lerUInt32LE(view, offEocd + 16);
    let off = offCentralDir;
    while (off < tam) {
      if (lerUInt32LE(view, off) !== 0x02014b50) break;
      const tamNome = lerUInt16LE(view, off + 28);
      const tamExtra = lerUInt16LE(view, off + 30);
      const tamComentario = lerUInt16LE(view, off + 32);
      const compressao = lerUInt16LE(view, off + 10);
      const tamComprimido = lerUInt32LE(view, off + 20);
      const offLocal = lerUInt32LE(view, off + 42);
      const nomeBytes = new Uint8Array(arrayBuffer, off + 46, tamNome);
      const nome = new TextDecoder("utf-8").decode(nomeBytes);
      if (nome === nomeArquivo) {
        const offLocalHeader = offLocal;
        const tamNomeLocal = lerUInt16LE(view, offLocalHeader + 26);
        const tamExtraLocal = lerUInt16LE(view, offLocalHeader + 28);
        const inicioDados = offLocalHeader + 30 + tamNomeLocal + tamExtraLocal;
        const dadosComprimidos = new Uint8Array(arrayBuffer, inicioDados, tamComprimido);
        if (compressao === 0) {
          return new Uint8Array(dadosComprimidos);
        } else if (compressao === 8) {
          try {
            const ds = new DecompressionStream("deflate-raw");
            const blob = new Blob([dadosComprimidos]);
            const stream = blob.stream().pipeThrough(ds);
            const resp = new Response(stream);
            const buf = await resp.arrayBuffer();
            return new Uint8Array(buf);
          } catch (_) {
            const ds2 = new DecompressionStream("deflate");
            const blob2 = new Blob([dadosComprimidos]);
            const stream2 = blob2.stream().pipeThrough(ds2);
            const resp2 = new Response(stream2);
            const buf2 = await resp2.arrayBuffer();
            return new Uint8Array(buf2);
          }
        } else {
          throw new Error("Compressão ZIP não suportada: " + compressao);
        }
      }
      off += 46 + tamNome + tamExtra + tamComentario;
    }
    return null;
  };

  const extrairTextoDocx = async (file) => {
    const buf = await file.arrayBuffer();
    const xmlBytes = await procurarArquivoNoZip(buf, "word/document.xml");
    if (!xmlBytes) throw new Error("Arquivo word/document.xml não encontrado no ZIP (não é um .docx válido).");
    const xmlStr = new TextDecoder("utf-8").decode(xmlBytes);
    const parser = new DOMParser();
    const docXml = parser.parseFromString(xmlStr, "text/xml");
    const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    const paragrafos = docXml.getElementsByTagNameNS(ns, "p");
    const linhas = [];
    for (let i = 0; i < paragrafos.length; i++) {
      const p = paragrafos[i];
      const blocos = [""];
      const filhos = p.childNodes;
      for (let k = 0; k < filhos.length; k++) {
        const filho = filhos[k];
        if (filho.nodeType !== 1) continue;
        const tagLocal = filho.localName || filho.tagName;
        if (tagLocal === "r") {
          const runsTexto = filho.getElementsByTagNameNS(ns, "t");
          for (let j = 0; j < runsTexto.length; j++) {
            const t = runsTexto[j];
            if (t && t.textContent) blocos[blocos.length - 1] += t.textContent;
          }
          const brsNoRun = filho.getElementsByTagNameNS(ns, "br");
          for (let q = 0; q < brsNoRun.length; q++) blocos.push("");
        } else if (tagLocal === "hyperlink") {
          const runsTexto = filho.getElementsByTagNameNS(ns, "t");
          for (let j = 0; j < runsTexto.length; j++) {
            const t = runsTexto[j];
            if (t && t.textContent) blocos[blocos.length - 1] += t.textContent;
          }
        } else if (tagLocal === "br" || tagLocal === "lastRenderedPageBreak") {
          blocos.push("");
        } else if (tagLocal === "sdt" || tagLocal === "customXml") {
          const runsTexto = filho.getElementsByTagNameNS(ns, "t");
          for (let j = 0; j < runsTexto.length; j++) {
            const t = runsTexto[j];
            if (t && t.textContent) blocos[blocos.length - 1] += t.textContent;
          }
        }
      }
      for (const bloco of blocos) {
        const linha = bloco.replace(/\s+/g, " ").trim();
        if (linha && linha.length > 0) linhas.push(linha);
      }
    }
    return linhas;
  };

  // ===================== PARSER WORD COMPLETO (IGUAL FLUXO OCR DA IMAGEM) =====================
  const MESES_WORD = { janeiro:1, fevereiro:2, marco:3, marco:3, abril:4, maio:5, junho:6, julho:7, agosto:8, setembro:9, outubro:10, novembro:11, dezembro:12 };
  const normWord = (s) => {
    if (!s) return "";
    const mapa = { à:"a",á:"a",â:"a",ã:"a",ä:"a", è:"e",é:"e",ê:"e",ë:"e", ì:"i",í:"i",î:"i",ï:"i", ò:"o",ó:"o",ô:"o",õ:"o",ö:"o", ù:"u",ú:"u",û:"u",ü:"u", ç:"c", ñ:"n",
                   À:"A",Á:"A",Â:"A",Ã:"A",Ä:"A", È:"E",É:"E",Ê:"E",Ë:"E", Ì:"I",Í:"I",Î:"I",Ï:"I", Ò:"O",Ó:"O",Ô:"O",Õ:"O",Ö:"O", Ù:"U",Ú:"U",Û:"U",Ü:"U", Ç:"C", Ñ:"N" };
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      out += (mapa[ch] !== undefined) ? mapa[ch] : ch;
    }
    return out;
  };
  const numextWord = (txt) => {
    if (!txt) return null;
    let s = normWord(txt).trim().toLowerCase();
    if (!s) return null;
    const u = { zero:0,um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,
               dez:10,onze:11,doze:12,treze:13,catorze:14,quatorze:14,quinze:15,dezesseis:16,dezessete:17,dezoito:18,dezenove:19 };
    const d = { vinte:20,trinta:30,quarenta:40,cinquenta:50,sessenta:60,setenta:70,oitenta:80,noventa:90 };
    if (u[s] !== undefined) return u[s];
    if (d[s] !== undefined) return d[s];
    if (/\d+/.test(s)) {
      const m = s.match(/\d+/);
      if (m && m[0]) return parseInt(m[0], 10);
    }
    if (s.indexOf(" e ") >= 0) {
      const partes = s.split(/\s+e\s+/).map(p => p.trim()).filter(p => p);
      let total = 0, ok = true;
      for (const p of partes) {
        if (u[p] !== undefined) total += u[p];
        else if (d[p] !== undefined) total += d[p];
        else { ok = false; break; }
      }
      if (ok) return total;
    }
    return null;
  };
  const extrairDataLinhaWord = (linha, anoTextoApoio = "") => {
    try {
      const low = linha.toLowerCase();
      let pos = low.indexOf("aos ");
      if (pos < 0) pos = low.indexOf("ao ");
      if (pos < 0) return "";
      let resto = linha.substring(pos);
      const restolow = resto.toLowerCase();
      let posfim = resto.length;
      for (const m of [", pelas", ", na ", ", ap", ", pe", ", re", ";", "."]) {
        const p = restolow.indexOf(m);
        if (p > 0 && p < posfim) posfim = p;
      }
      const bloco = resto.substring(0, posfim).trim();
      const tokens = bloco.split(/\s+/).filter(t => t);
      if (tokens.length < 7) return "";
      const diaStr = tokens[1];
      let im = -1;
      for (let i = 0; i < tokens.length; i++) {
        const tl = tokens[i].toLowerCase();
        if (tl.length >= 3 && tl.length <= 5 && tl.startsWith("m") && tl.endsWith("s") && tl !== "dias" && tl !== "mais" && tl !== "mas") {
          im = i; break;
        }
      }
      if (im < 0 || im + 2 >= tokens.length) return "";
      const mesStr = tokens[im + 2];
      let ia = -1;
      for (let j = im + 3; j < tokens.length; j++) {
        if (tokens[j].toLowerCase().startsWith("ano")) { ia = j; break; }
      }
      if (ia < 0 || ia + 2 >= tokens.length) return "";
      const anoStr = tokens.slice(ia + 2).join(" ").trim();
      const dia = numextWord(diaStr);
      let mes = null;
      const msn = normWord(mesStr).toLowerCase();
      for (const chave in MESES_WORD) {
        if (chave === msn || msn.substring(0,4) === chave.substring(0,4)) { mes = MESES_WORD[chave]; break; }
      }
      let ano = null;
      if (anoTextoApoio && /^\d{4}$/.test(anoTextoApoio)) ano = parseInt(anoTextoApoio, 10);
      if (!ano) {
        if (/^\d+$/.test(anoStr)) ano = parseInt(anoStr, 10);
        else {
          const an = normWord(anoStr).toLowerCase();
          let tot = 0;
          if (an.indexOf("mil") >= 0) tot += 1000;
          const cent = [["novecentos",900],["oitocentos",800],["setecentos",700],["seiscentos",600],["quinhentos",500]];
          for (const [c, v] of cent) if (an.indexOf(c) >= 0) tot += v;
          let restoAno = an;
          for (const tk of ["mil","novecentos","oitocentos","setecentos","seiscentos","quinhentos"]) {
            restoAno = restoAno.split(tk).join(" ");
          }
          restoAno = restoAno.replace(/[,\.\;\-]/g," ").trim();
          const rr = numextWord(restoAno);
          if (rr !== null) tot += rr;
          if (tot >= 1000) ano = tot;
        }
      }
      if (dia && mes && ano) return `${String(dia).padStart(2,"0")}/${String(mes).padStart(2,"0")}/${ano}`;
    } catch(e) {}
    return "";
  };
  const extrairHoraLinhaWord = (linha) => {
    try {
      const m = linha.match(/pelas?\s+(\w+)\s+horas?/i);
      if (!m) return "";
      const h = numextWord(m[1]);
      if (h !== null) return `${String(h).padStart(2,"0")}:00`;
      const dig = m[1].match(/\d+/);
      if (dig) return `${String(parseInt(dig[0],10)).padStart(2,"0")}:00`;
    } catch(e) {}
    return "";
  };
  const extrairLocalLinhaWord = (linha) => {
    try {
      const m = linha.match(/na\s+(.*?)(?:[,.;]|ap[oó]s|perante)/i);
      if (!m) return "";
      let s = m[1].trim().replace(/[,]+$/g,"").trim();
      if (s) s = s[0].toUpperCase() + s.substring(1);
      return s;
    } catch(e) {} return "";
  };
  const extrairPadreLinhaWord = (linha) => {
    try {
      const m = linha.match(/(?:perante|diante|ante)\s+o\s+([\s\S]*?)(?:,?\s*presentes as? testemunhas|,?\s*receberam|,?\s*presentes\b)/i);
      if (m) {
        let s = m[1].trim();
        s = s.replace(/[,;.\s]+$/g, "").trim();
        if (s) s = s[0].toUpperCase() + s.substring(1);
        return s;
      }
      return "";
    } catch(e) {} return "";
  };
  const extrairTestemunhasLinhaWord = (linha) => {
    try {
      const m = linha.match(/presentes as?\s+testemunhas\s+(.*?)(?:[,.;]|receberam[\s-]se|e\s+receberam)/i);
      if (!m) return ["", ""];
      let nomes = m[1].trim();
      const m3 = nomes.match(/,\s*([^,]+)\s+e\s+([^,]+)$/);
      if (m3) {
        const antes = nomes.substring(0, m3.index).trim();
        const primeiro = antes.split(/\s*,\s*/)[0].trim();
        return [primeiro || m3[1].trim(), m3[2].trim()];
      }
      const posE = nomes.indexOf(" e ");
      if (posE >= 0) return [nomes.substring(0, posE).trim(), nomes.substring(posE + 3).trim()];
      if (nomes.indexOf(",") >= 0) {
        const partes = nomes.split(",").map(p => p.trim()).filter(p => p);
        if (partes.length >= 2) return [partes[0], partes[partes.length-1]];
        if (partes.length === 1) return [partes[0], ""];
      }
      return [nomes.trim(), ""];
    } catch(e) {} return ["", ""];
  };
  const extrairDadosPessoaLinhaWord = (linha) => {
    try {
      const m = linha.match(/^\s*[OA]\s+Nubente\s*:\s*(.*)$/i);
      if (!m) return { nome: "", profissao: "", pai: "", mae: "" };
      const resto = m[1].trim();
      let nome = "", profissao = "", pai = "", mae = "";
      const posVirg = resto.indexOf(",");
      if (posVirg >= 0) nome = resto.substring(0, posVirg).trim();
      else nome = resto;
      const restoDepoisNome = (posVirg >= 0) ? resto.substring(posVirg + 1).trim() : "";
      const rePais = /filh[oa]\s+de\s+([^,;.]+?)\s+e\s+([^,;.]+?)(?:\s*,|\s*;|\s*$|\.\s)/i;
      const mPais = restoDepoisNome.match(rePais);
      if (mPais) {
        pai = mPais[1].trim().replace(/[,;.\s]+$/g, "");
        mae = mPais[2].trim().replace(/[,;.\s]+$/g, "");
        const fimPais = mPais.index + mPais[0].length;
        const antesPais = restoDepoisNome.substring(0, mPais.index).trim();
        const partes = antesPais.split(/\s*,\s*/).map(p => p.trim()).filter(p => p);
        for (const p of partes) {
          const pl = p.toLowerCase();
          if (/anos?\s+de\s+idade/i.test(p)) continue;
          if (/^\d+\s*anos?/.test(p)) continue;
          if (/solteir[oa]/i.test(p)) continue;
          if (/divorciad[oa]/i.test(p)) continue;
          if (/vi[uv][oa]/i.test(p)) continue;
          if (/casad[oa]/i.test(p)) continue;
          profissao = p;
          break;
        }
      } else {
        const partes = restoDepoisNome.split(/\s*,\s*/).map(p => p.trim()).filter(p => p);
        for (const p of partes) {
          const pl = p.toLowerCase();
          if (/anos?\s+de\s+idade/i.test(p)) continue;
          if (/^\d+\s*anos?/.test(p)) continue;
          if (/solteir[oa]/i.test(p)) continue;
          if (/divorciad[oa]/i.test(p)) continue;
          if (/vi[uv][oa]/i.test(p)) continue;
          if (/casad[oa]/i.test(p)) continue;
          if (profissao) { if (!mae && p.length > 2) mae = p; }
          else { profissao = p; }
        }
      }
      if (pai) pai = pai[0].toUpperCase() + pai.substring(1);
      if (mae) mae = mae[0].toUpperCase() + mae.substring(1);
      if (profissao) profissao = profissao[0].toUpperCase() + profissao.substring(1);
      return { nome, profissao, pai, mae };
    } catch(e) {} return { nome: "", profissao: "", pai: "", mae: "" };
  };
  const extrairNomePessoaLinhaWord = (linha) => {
    try {
      const d = extrairDadosPessoaLinhaWord(linha);
      return d.nome;
    } catch(e) {} return "";
  };
  const extrairTodosOsRegistrosWord = (linhas) => {
    const reLivro = /LIVRO\s*[:\.]?\s*(\d+[A-Za-zºª]?)/i;
    const reFolha = /FOLHA\s*[:\.]?\s*(\d+[A-Za-zºª]?)/i;
    const reTermo = /Termo\s*N\.?\s*(\d+[ºª]?)/i;
    const reAno = /^\s*Ano\s*[:\.]?\s*(\d{4})/i;
    const reData = /^\s*Data\s+do\s+casamento/i;
    const reNoivo = /^\s*O\s+Nubente/i;
    const reNoiva = /^\s*A\s+Nubente/i;
    const trimLine = (s) => String(s || "").replace(/^\s+|\s+$/g, "").replace(/\u00A0/g, " ");
    let livroGlobal = "";
    for (let i = 0; i < Math.min(80, linhas.length); i++) {
      const m = linhas[i].match(reLivro);
      if (m) { livroGlobal = m[1].replace(/[ºª]/g,"").trim(); break; }
    }
    let folhaAtual = "", livroAtual = livroGlobal, anoAtual = "";
    const registros = [];
    let atual = null;
    const fechar = () => {
      if (atual && atual.numero) {
        if (!atual.livro) atual.livro = livroGlobal || "";
        for (const ch of ["livro","folha","numero","data_celebacao","hora_celebacao","local_celebacao","testemunha_qualificada","testemunha_noivo","testemunha_noiva"]) {
          if (atual[ch] === undefined || atual[ch] === null) atual[ch] = "";
        }
        atual.noivo = {
          nome: atual._noivo_nome || "",
          sexo: "MASCULINO",
          profissao: atual._noivo_prof || "",
          mae: atual._noivo_mae || "",
          pai: atual._noivo_pai || ""
        };
        atual.noiva = {
          nome: atual._noiva_nome || "",
          sexo: "FEMININO",
          profissao: atual._noiva_prof || "",
          mae: atual._noiva_mae || "",
          pai: atual._noiva_pai || ""
        };
        delete atual._noivo_nome; delete atual._noivo_prof; delete atual._noivo_pai; delete atual._noivo_mae;
        delete atual._noiva_nome; delete atual._noiva_prof; delete atual._noiva_pai; delete atual._noiva_mae;
        registros.push(atual);
      }
      atual = null;
    };
    for (let i = 0; i < linhas.length; i++) {
      const linha = trimLine(linhas[i]);
      if (!linha) continue;
      const mL = linha.match(reLivro);
      if (mL) { livroAtual = mL[1].replace(/[ºª]/g,"").trim(); livroGlobal = livroAtual || livroGlobal; }
      const mF = linha.match(reFolha);
      if (mF) { folhaAtual = mF[1].replace(/[ºª]/g,"").trim(); }
      const mT = linha.match(reTermo);
      if (mT) {
        fechar();
        const numero = mT[1].replace(/[ºª]/g,"").trim();
        atual = {
          livro: livroAtual || "", folha: folhaAtual || "", numero,
          _noivo_nome: "", _noivo_prof: "", _noivo_pai: "", _noivo_mae: "",
          _noiva_nome: "", _noiva_prof: "", _noiva_pai: "", _noiva_mae: "",
          ano_texto: ""
        };
        continue;
      }
      if (atual !== null) {
        const mA = linha.match(reAno);
        if (mA) { anoAtual = mA[1].trim(); atual.ano_texto = anoAtual; continue; }
        if (reData.test(linha)) {
          const data = extrairDataLinhaWord(linha, atual.ano_texto || "");
          if (data) atual.data_celebacao = data;
          const hora = extrairHoraLinhaWord(linha);
          if (hora) atual.hora_celebacao = hora;
          const local = extrairLocalLinhaWord(linha);
          if (local) atual.local_celebacao = local;
          const padre = extrairPadreLinhaWord(linha);
          if (padre) atual.testemunha_qualificada = padre;
          const [t1, t2] = extrairTestemunhasLinhaWord(linha);
          if (t1) atual.testemunha_noivo = t1;
          if (t2) atual.testemunha_noiva = t2;
          continue;
        }
        if (reNoivo.test(linha)) {
          const d = extrairDadosPessoaLinhaWord(linha);
          atual._noivo_nome = d.nome; atual._noivo_prof = d.profissao;
          atual._noivo_pai = d.pai; atual._noivo_mae = d.mae;
          continue;
        }
        if (reNoiva.test(linha)) {
          const d = extrairDadosPessoaLinhaWord(linha);
          atual._noiva_nome = d.nome; atual._noiva_prof = d.profissao;
          atual._noiva_pai = d.pai; atual._noiva_mae = d.mae;
          continue;
        }
      }
    }
    fechar();
    return registros;
  };

  const processarUploadWord = async (file) => {
    return new Promise(async (resolve, reject) => {
      try {
        setStatus(`📘 Lendo arquivo Word: "${file.name}"...`, "info");
        setProgress(20);
        extrairTextoDocx(file).then(async linhas => {
          setProgress(50);
          console.log("[Curia IA] Linhas extraídas do Word:", linhas.length);
          const registros = extrairTodosOsRegistrosWord(linhas);
          setProgress(90);
          state.wordRegistros = registros;
          state.wordIndiceAtual = registros.length > 0 ? 0 : -1;
          state.wordModoAutomatico = false;
          state.wordPararAutomatico = false;
          state.wordTotalLidos = 0;
          state.wordTotalComSucesso = 0;
          state.wordTotalComErro = 0;
          setProgress(100);
          setTimeout(() => setProgress(0), 500);
          const comData = registros.filter(r => r.data_celebacao).length;
          const comNomes = registros.filter(r => r.noivo && r.noiva && r.noivo.nome && r.noiva.nome).length;
          const comPadre = registros.filter(r => r.testemunha_qualificada && r.testemunha_qualificada.length > 5).length;
          const comPaisNoivo = registros.filter(r => r.noivo && r.noivo.pai && r.noivo.pai !== "—" && r.noivo.mae && r.noivo.mae !== "—").length;
          const comPaisNoiva = registros.filter(r => r.noiva && r.noiva.pai && r.noiva.pai !== "—" && r.noiva.mae && r.noiva.mae !== "—").length;
          const comProfissoes = registros.filter(r => r.noivo && r.noiva && r.noivo.profissao && r.noiva.profissao && r.noivo.profissao !== "—" && r.noiva.profissao !== "—").length;
          setStatus(`✅ Arquivo Word processado! ${registros.length} registros (Nomes:${comNomes} | Padre:${comPadre} | Datas:${comData} | PaisNoivo:${comPaisNoivo} | PaisNoiva:${comPaisNoiva} | Profissões:${comProfissoes}).`, "sucesso");
          console.log("[Curia IA] Registros Word extraídos:", registros);
          try {
            const salvou = await salvarWordNoStorage();
            if (salvou) console.log("[Curia IA] Registros do Word salvos no chrome.storage.local com sucesso!");
          } catch (eStorage) { console.warn("[Curia IA] Erro ao salvar Word no storage após upload:", eStorage); }
          refreshPreview();
          resolve(registros);
        }).catch(err => {
          console.error("[Curia IA] Erro:", err);
          setStatus("❌ Erro ao ler arquivo Word: " + (err.message || err), "erro");
          setProgress(0);
          reject(err);
        });
      } catch (e) {
          setStatus("❌ Erro ao processar: " + (e.message || e), "erro");
          setProgress(0);
          reject(e);
        }
      });
  };

  const wordAnterior = () => {
    if (state.wordIndiceAtual > 0) {
      state.wordIndiceAtual--;
      refreshPreview();
      try { salvarWordNoStorage(); } catch(_){}
    }
  };
  const wordProximo = () => {
    if (state.wordIndiceAtual < state.wordRegistros.length - 1) {
      state.wordIndiceAtual++;
      refreshPreview();
      try { salvarWordNoStorage(); } catch(_){}
    }
  };
  const wordAplicar = () => {
    const idx = state.wordIndiceAtual;
    if (idx < 0 || idx >= state.wordRegistros.length) return;
    const r = state.wordRegistros[idx];
    const livroFinal = r.livro || state.livroPadrao || "";
    state.extractedData.livro = livroFinal;
    state.extractedData.folha = r.folha || "";
    state.extractedData.numero = r.numero || "";
    if (r.data_celebacao) state.extractedData.data_celebacao = r.data_celebacao;
    if (r.hora_celebacao) state.extractedData.hora_celebacao = r.hora_celebacao;
    if (r.local_celebacao) state.extractedData.local_celebacao = r.local_celebacao;
    if (r.testemunha_qualificada) state.extractedData.testemunha_qualificada = r.testemunha_qualificada;
    if (r.testemunha_noivo) state.extractedData.testemunha_noivo = r.testemunha_noivo;
    if (r.testemunha_noiva) state.extractedData.testemunha_noiva = r.testemunha_noiva;
    if (!state.extractedData.noivo || typeof state.extractedData.noivo !== "object") state.extractedData.noivo = {};
    if (!state.extractedData.noiva || typeof state.extractedData.noiva !== "object") state.extractedData.noiva = {};
    if (r.noivo && typeof r.noivo === "object") {
      Object.assign(state.extractedData.noivo, r.noivo);
    }
    if (r.noiva && typeof r.noiva === "object") {
      Object.assign(state.extractedData.noiva, r.noiva);
    }
    if (!state.extractedData.noivo.sexo) state.extractedData.noivo.sexo = "MASCULINO";
    if (!state.extractedData.noiva.sexo) state.extractedData.noiva.sexo = "FEMININO";
    if (!state.extractedData.noivo.profissao && r.noivo && r.noivo.profissao) {
      state.extractedData.noivo.profissao = r.noivo.profissao;
    }
    if (!state.extractedData.noivo.profissao) state.extractedData.noivo.profissao = "—";
    if (!state.extractedData.noiva.profissao) state.extractedData.noiva.profissao = "—";
    if (!state.extractedData.noivo.mae) state.extractedData.noivo.mae = "—";
    if (!state.extractedData.noivo.pai) state.extractedData.noivo.pai = "—";
    if (!state.extractedData.noiva.mae) state.extractedData.noiva.mae = "—";
    if (!state.extractedData.noiva.pai) state.extractedData.noiva.pai = "—";
    refreshPreview();
    const livroMostrar = livroFinal || "vazio";
    const noivoMostrar = (state.extractedData.noivo && state.extractedData.noivo.nome) ? " | Noivo: " + state.extractedData.noivo.nome.split(" ")[0] : "";
    const noivaMostrar = (state.extractedData.noiva && state.extractedData.noiva.nome) ? " | Noiva: " + state.extractedData.noiva.nome.split(" ")[0] : "";
    const dataMostrar = state.extractedData.data_celebacao ? ` Data: ${state.extractedData.data_celebacao}` : "";
    setStatus(`✅ Registro ${idx + 1} aplicado: L=${livroMostrar} F=${r.folha || "vazio"} N=${r.numero || "vazio"}${dataMostrar}${noivoMostrar}${noivaMostrar}${!r.livro && state.livroPadrao ? " (LIVRO padrão)" : ""}`, "sucesso");
  };
  const wordAplicarEPreencher = async () => {
    wordAplicar();
    await preencherFormulario();
  };

  const bindEvents = () => {
    bindPreviewInputs();
  };

  const init = async () => {
    await getBackendUrl();
    try {
      const restaurou = await restaurarWordDoStorage();
      if (restaurou) {
        console.log("[Curia IA] Dados do Word RESTAURADOS do storage:", state.wordRegistros.length, "registros, índice atual:", state.wordIndiceAtual);
      }
    } catch(e) { console.warn("[Curia IA] Restaurar storage word no init falhou:", e); }
    createToggleButton();
    mountPanel();
    const inpUrl = $("curia-backend-url");
    if (inpUrl && state.backendUrl) inpUrl.value = state.backendUrl;
    const inpLivroPadrao = $("curia-livro-padrao");
    if (inpLivroPadrao && state.livroPadrao) inpLivroPadrao.value = state.livroPadrao;
    togglePanel(false);
    const sessaoRestaurada = await restaurarDadosDaSessaoSeExistir();
    if (sessaoRestaurada?.dados) {
      const painel = $("curia-preview-area");
      if (painel) painel.innerHTML = buildPreviewHtml();
      bindPreviewInputs();
      togglePanel(true);
      setStatus("♻️ Dados restaurados após avanço do Salvar e Continuar. Aguardando tela de testemunhas para retomar...", "info");
    }
    iniciarWatchdogRetomadaFluxo();
  };

  return { init, togglePanel, getDados: () => state.extractedData };
})();
