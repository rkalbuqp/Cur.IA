const CuriaWidget = (() => {
  const state = {
    backendUrl: "http://localhost:8000",
    selectedFile: null,
    extractedData: {
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
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s = "") => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

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
    return `
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

          <div class="curia-section-title">📷 Upload da Foto do Livro</div>
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
            state.extractedData.noivo.nome ||
            state.extractedData.noiva.nome ||
            state.extractedData.testemunha_noivo ||
            state.extractedData.testemunha_noiva;
          fillBtn.disabled = !temDados || state.isProcessing;
        }
      });
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
      const raiz = ["data_celebacao","hora_celebacao","local_celebacao","testemunha_qualificada","testemunha_noivo","testemunha_noiva"];
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
            console.log("[Curia IA] 🚨 Watchdog: detectada tela de testemunhas e sessão pendente! Iniciando retomada do fluxo (passo 4 - testemunhas).");
            setProgress(77);
            setStatus("⚡ Detectada nova página (Salvar e Continuar)! Retomando fluxo: cadastrando TESTEMUNHAS automaticamente...", "info");
            const fillBtn = $("curia-fill-btn");
            if (fillBtn) fillBtn.disabled = true;
            state.isProcessing = true;
            const callback = (passo, percentual) => {
              setStatus(passo, "info");
              setProgress(percentual);
            };
            try {
              if (mod.a.retomarFluxoAposNavegacao && typeof mod.a.retomarFluxoAposNavegacao === "function") {
                await mod.a.retomarFluxoAposNavegacao(callback);
              } else {
                await mod.a.passo4Testemunhas(sessaoAgora.dados, callback);
                await mod.a.storageClear && mod.a.storageClear();
                setProgress(100);
                setStatus("✅ Preenchimento concluído com sucesso (Testemunhas cadastradas após navegação)!", "sucesso");
              }
            } catch (e) {
              console.error("[Curia IA] Erro retomada fluxo após navegação:", e);
              setStatus(`Erro na retomada das testemunhas: ${e.message || e}`, "erro");
            } finally {
              state.isProcessing = false;
              if (fillBtn) fillBtn.disabled = false;
              setTimeout(() => setProgress(0), 1500);
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

  const preencherFormulario = async () => {
    if (state.isProcessing) return;
    try {
      state.isProcessing = true;
      const fillBtn = $("curia-fill-btn");
      if (fillBtn) fillBtn.disabled = true;

      const mod = await esperarModulosCarregarem(10000);
      if (!mod.a || !mod.a.executarFluxoCompleto) {
        throw new Error("Módulo de automação não carregado. Tente recarregar a página (F5) e recarregar a extensão.");
      }

      setProgress(5);
      setStatus("Iniciando preenchimento automático...", "info");

      const callback = (passo, percentual) => {
        setStatus(passo, "info");
        setProgress(percentual);
      };

      await mod.a.executarFluxoCompleto(state.extractedData, callback);

      setProgress(100);
      setTimeout(() => setProgress(0), 800);
      setStatus("✅ Preenchimento concluído com sucesso! Confira os dados antes de prosseguir.", "sucesso");
    } catch (e) {
      console.error("[Curia IA]", e);
      setStatus(`Erro no preenchimento: ${e.message || e}`, "erro");
      setProgress(0);
    } finally {
      state.isProcessing = false;
      const fillBtn = $("curia-fill-btn");
      if (fillBtn) fillBtn.disabled = false;
    }
  };

  const bindEvents = () => {
    const close = $("curia-close");
    if (close) close.addEventListener("click", () => togglePanel(false));

    const uploadArea = $("curia-upload-area");
    const fileInput = $("curia-file-input");
    const fileName = $("curia-file-name");

    if (uploadArea && fileInput) {
      uploadArea.addEventListener("click", (e) => {
        if (e.target.tagName !== "INPUT") fileInput.click();
      });
      fileInput.addEventListener("change", () => {
        const f = fileInput.files?.[0];
        if (!f) return;
        state.selectedFile = f;
        if (fileName) fileName.textContent = f.name;
        const processBtn = $("curia-process-btn");
        if (processBtn) processBtn.disabled = false;
      });
      ["dragenter", "dragover"].forEach((ev) =>
        uploadArea.addEventListener(ev, (e) => {
          e.preventDefault();
          uploadArea.classList.add("dragover");
        })
      );
      ["dragleave", "drop"].forEach((ev) =>
        uploadArea.addEventListener(ev, (e) => {
          e.preventDefault();
          uploadArea.classList.remove("dragover");
        })
      );
      uploadArea.addEventListener("drop", (e) => {
        e.preventDefault();
        const f = e.dataTransfer?.files?.[0];
        if (f && f.type.startsWith("image/")) {
          state.selectedFile = f;
          if (fileName) fileName.textContent = f.name;
          const processBtn = $("curia-process-btn");
          if (processBtn) processBtn.disabled = false;
        }
      });
    }

    const processBtn = $("curia-process-btn");
    if (processBtn) processBtn.addEventListener("click", processarImagem);

    const fillBtn = $("curia-fill-btn");
    if (fillBtn) fillBtn.addEventListener("click", preencherFormulario);

    const salvarBackendBtn = $("curia-salvar-backend-btn");
    if (salvarBackendBtn) {
      salvarBackendBtn.addEventListener("click", async () => {
        const input = $("curia-backend-url");
        if (!input) return;
        let url = (input.value || "").trim();
        if (url.endsWith("/")) url = url.slice(0, -1);
        if (url) {
          state.backendUrl = url;
          try {
            await chrome.storage.local.set({ backendUrl: url });
          } catch (_) {}
          setStatus(`✅ URL do backend salva com sucesso: ${url} (reiniciar a página não é necessário)`, "sucesso");
          if (input) {
            input.style.borderColor = "#22c55e";
            setTimeout(() => { if (input) input.style.borderColor = ""; }, 1500);
          }
        } else {
          setStatus("❌ Informe uma URL válida.", "erro");
        }
      });
    }

    const testarBackendBtn = $("curia-testar-backend-btn");
    if (testarBackendBtn) {
      testarBackendBtn.addEventListener("click", async () => {
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
          setStatus(`✅ Backend ONLINE (${ms} ms) | ${keyOk} | Modelo atual: ${modelo}`, "sucesso");
          console.log("[Curia IA] Health check:", data);
        } catch (e) {
          console.error("[Curia IA] Erro teste conexão:", e);
          setStatus(`❌ Falha na conexão (${e.message || e}). Verifique a URL e se o backend está rodando.`, "erro");
        }
      });
    }

    bindPreviewInputs();
  };

  const init = async () => {
    await getBackendUrl();
    createToggleButton();
    mountPanel();
    const inpUrl = $("curia-backend-url");
    if (inpUrl && state.backendUrl) inpUrl.value = state.backendUrl;
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
