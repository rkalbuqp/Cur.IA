const CuriaAutomation = (() => {
  const U =
    (typeof CuriaUtils !== "undefined" ? CuriaUtils : null) ||
    (typeof window !== "undefined" ? window.CuriaUtils : null);
  if (!U) throw new Error("[CuriaAutomation] CuriaUtils não carregado (nem escopo nem window).");

  const passo = (msg, percentual, cb) => {
    console.log("[CuriaAutomation]", msg);
    if (cb) cb(msg, percentual);
  };

  const SEL = {
    lupaNoivo: "a[ng-click='modalSelectNoivo()'], a.btn.btn-black img[src*='search.svg']",
    lupaNoiva: "a[ng-click='modalSelectNoiva()']",
    btnNovoCadastro: "button.ui-button span.ui-button-text",
    btnSalvarContinuar: "input.btn-blue[ng-click='gravarContinuar()'], input[value='Salvar e Continuar']",
    btnMaisTestemunha: "input.btn-green[ng-click='openModalTestemunha()'], input[value='+ Testemunha']",
    mainDataCelebracao: "input[ng-model='matrimonio.datacelebracao']",
    mainHoraCelebracao: "input[ng-model='matrimonio.horacelebracao'], input#horacelebracao",
    mainLocalCelebracao: "input[ng-model='matrimonio.localcelebracao']",
    mainTestemunhaQualificada: "input[ng-model='matrimonio.celebrante']",
    modalNome: "input[name='nome']",
    modalSexo: "select[name='sexo']",
    modalProfissao: "input[name='profissao']",
    modalMae: "input[name='nmae']",
    modalPai: "input[name='npai']",
  };

  const executarNoContextoDaPagina = (fn) => {
    return new Promise((resolve, reject) => {
      try {
        const idSinal = "__curia_ia_sinal_" + Math.floor(Math.random() * 1e9);
        const idResult = "__curia_ia_result_" + Math.floor(Math.random() * 1e9);
        window[idResult] = { pronto: false };
        window[idSinal] = () => { resolve(window[idResult]?.valor); };
        const s = document.createElement("script");
        s.type = "text/javascript";
        s.textContent = `try { const valor = (${fn.toString()})(); window["${idResult}"] = { pronto: true, valor }; try { const e = document.createEvent("Event"); e.initEvent("${idSinal}", true, true); document.dispatchEvent(e); } catch(_) { window["${idSinal}"] && window["${idSinal}"](); } } catch (erro) { window["${idResult}"] = { pronto: true, valor: null, erro: String(erro&&erro.message||erro) }; try { const e = document.createEvent("Event"); e.initEvent("${idSinal}", true, true); document.dispatchEvent(e); } catch(_) { window["${idSinal}"] && window["${idSinal}"](); } }`;
        document.documentElement.appendChild(s);
        setTimeout(() => {
          try { if (s && s.parentNode) s.parentNode.removeChild(s); } catch (_) {}
          try { delete window[idSinal]; } catch (_) {}
          try { delete window[idResult]; } catch (_) {}
        }, 2000);
      } catch (e) { reject(e); }
    });
  };

  const buscarCampoPrincipal = (keywords) => {
    const kws = Array.isArray(keywords) ? keywords : [keywords];
    const todos = document.querySelectorAll("input, select, textarea");
    for (const el of todos) {
      const place = (el.getAttribute("placeholder") || "").toLowerCase();
      const name = (el.getAttribute("name") || "").toLowerCase();
      const id = (el.id || "").toLowerCase();
      const model = (el.getAttribute("ng-model") || "").toLowerCase();
      const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase();
      let rotulo = "";
      if (el.id) {
        const lbl = document.querySelector(`label[for='${el.id}']`);
        if (lbl) rotulo = lbl.textContent.toLowerCase();
      }
      let p = el.parentElement;
      for (let i = 0; i < 4 && p; i++) {
        const txt = p.textContent.toLowerCase();
        if (kws.some((k) => txt.includes(k.toLowerCase()))) {
          rotulo += " " + txt;
          break;
        }
        p = p.parentElement;
      }
      if (kws.some((k) => {
        const k2 = k.toLowerCase();
        return (
          place.includes(k2) ||
          name.includes(k2) ||
          id.includes(k2) ||
          model.includes(k2) ||
          ariaLabel.includes(k2) ||
          rotulo.includes(k2)
        );
      })) return el;
    }
    return null;
  };

  const dumpTodosOsCampos = (root = document, titulo = "DUMP DE CAMPOS") => {
    const todos = Array.from(root.querySelectorAll("input, select, textarea"));
    const linhas = [];
    linhas.push(`\n===== ${titulo} (${todos.length} campos) =====`);
    for (const el of todos) {
      if (el.type === "hidden") continue;
      const ngModel = el.getAttribute("ng-model") || "";
      const name = el.getAttribute("name") || "";
      const id = el.id || "";
      const cls = el.getAttribute("class") || "";
      let rotulo = "";
      if (id) {
        const lbl = root.querySelector(`label[for='${id}']`);
        if (lbl) rotulo = lbl.textContent.trim();
      }
      if (!rotulo) {
        let p = el.parentElement;
        for (let i = 0; i < 6 && p; i++) {
          const lab = p.querySelector(":scope > label, label");
          if (lab && lab.textContent.trim().length < 80) {
            rotulo = lab.textContent.trim();
            break;
          }
          p = p.parentElement;
        }
      }
      linhas.push(
        `  · [${el.tagName}] label="${rotulo}" | id="${id}" | name="${name}" | ng-model="${ngModel}" | class="${cls.slice(0,100)}" | value="${String(el.value||'').slice(0,50)}"`
      );
    }
    console.log(linhas.join("\n") + "\n=======================================\n");
  };

  const getAngularScope = (el) => {
    if (!el) return null;
    try {
      const ang = window.angular;
      if (ang && ang.element) {
        const $el = ang.element(el);
        if ($el.scope) return $el.scope();
        if ($el.injector) {
          try {
            const $scope = $el.injector().get("$rootScope");
            if ($scope) return $scope;
          } catch (_) {}
        }
      }
    } catch (_) {}
    return null;
  };

  const aplicarValorAngularViaInjecao = async (el, valor, { ehSexo = false, ehSelect = false } = {}) => {
    if (!el) return false;
    el.setAttribute("data-curia-ia-alvo", "1");
    const valorLimpo = String(valor ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const ehSelectFinal = ehSelect || el.tagName === "SELECT";
    const fnPagina = `function(){ try {
      var el = document.querySelector("[data-curia-ia-alvo='1']");
      if (!el) return false;
      var model = el.getAttribute("ng-model");
      var ang = (typeof angular !== "undefined") ? angular : (window.angular || null);
      var resposta = { tipo: null, setou: false };
      if (ang && ang.element) {
        var $el = ang.element(el);
        var ctrlNgModel = $el.controller && $el.controller("ngModel");
        if (ctrlNgModel && ctrlNgModel.$setViewValue) {
          if (${ehSelectFinal ? "true" : "false"}) {
            try { el.value = "${valorLimpo}"; } catch(_) {}
          }
          ctrlNgModel.$setViewValue("${valorLimpo}");
          if (ctrlNgModel.$render) try { ctrlNgModel.$render(); } catch(_) {}
          resposta.tipo = "ngmodelctrl_setviewvalue";
          resposta.setou = true;
        }
        var scope = null;
        try { scope = $el.scope && $el.scope(); } catch(_) {}
        if (!scope) { try { scope = $el.isolateScope && $el.isolateScope(); } catch(_) {} }
        if (!scope && el.form) { try { scope = ang.element(el.form).scope && ang.element(el.form).scope(); } catch(_) {} }
        if (!scope) { try { scope = ang.element(document.body).scope && ang.element(document.body).scope(); } catch(_) {} }
        if (model && scope) {
          var partes = String(model).split(".");
          var alvo = scope;
          for (var i = 0; i < partes.length - 1; i++) {
            if (!alvo[partes[i]]) alvo[partes[i]] = {};
            alvo = alvo[partes[i]];
          }
          alvo[partes[partes.length - 1]] = "${valorLimpo}";
          resposta.tipo = resposta.tipo || "scope_apply";
          resposta.setou = true;
        }
        try { if (scope && scope.$apply) { scope.$apply(); } else if (scope && scope.$digest) { scope.$digest(); } } catch(_) {
          try { var $inj = $el.injector && $el.injector(); if ($inj) { var $root = $inj.get && $inj.get("$rootScope"); if ($root && $root.$apply) $root.$apply(); } } catch(__) {}
        }
        try { el.dispatchEvent && (function(){
          try { el.dispatchEvent(new Event("change",{bubbles:true,cancelable:true})); } catch(_) {}
          try { el.dispatchEvent(new Event("input", {bubbles:true,cancelable:true})); } catch(_) {}
          try { el.dispatchEvent(new Event("blur",  {bubbles:true})); } catch(_) {}
          try { el.dispatchEvent(new KeyboardEvent("keydown",{bubbles:true,cancelable:true,key:"Enter",code:"Enter",keyCode:13,which:13})); } catch(_) {}
        })(); } catch(_) {}
      }
      try { el.removeAttribute("data-curia-ia-alvo"); } catch(_) {}
      return resposta;
    } catch(e){ return {erro: String(e.message||e)}; } }`;
    try {
      const resposta = await executarNoContextoDaPagina(new Function("return " + fnPagina)());
      const setou = resposta && resposta.setou === true;
      console.log(`[CuriaAutomation] Angular (contexto da página): ${setou ? "✅ SETOU via " + (resposta?.tipo || "?") : "⚠️ não setou"} | valor="${valor.slice(0,40)}"`, resposta || "");
      return !!setou;
    } catch (e) {
      console.warn("[CuriaAutomation] Erro ao aplicar valor via injeção <script>:", e);
      try { el.removeAttribute("data-curia-ia-alvo"); } catch (_) {}
      return false;
    }
  };

  const preencherElemento = async (el, valor, progressCb, pct, rotulo, { simularDigitacao = true, ehSexo = false } = {}) => {
    if (!el) return false;
    if (el.tagName === "SELECT") {
      if (valor === "MASCULINO" || valor === "FEMININO") {
        const opts = Array.from(el.options);
        let achou = null;
        const variantes = valor === "MASCULINO"
          ? ["MASCULINO", "MASC", "M.", "M", "Masculino", "masculino"]
          : ["FEMININO", "FEM", "F.", "F", "Feminino", "feminino"];
        for (const opt of opts) {
          const v = (opt.value || "").trim().toUpperCase();
          const t = (opt.textContent || "").trim().toUpperCase();
          if (variantes.some((x) => v === x.toUpperCase() || t === x.toUpperCase())) {
            achou = opt;
            break;
          }
        }
        if (achou) {
          el.value = achou.value;
        }
      }
    }

    try {
      el.focus();
    } catch (_) {}

    const temNgMask = el.hasAttribute("ng-mask") || (el.getAttribute("class") || "").includes("hasDatepicker");
    const modoDigitacao = temNgMask || simularDigitacao;

    if (el.tagName !== "SELECT") {
      U.setInputValue(el, valor, { clearFirst: true, dispatchEvents: true, simulateTyping: modoDigitacao });
    } else {
      U.setInputValue(el, valor, { clearFirst: true, dispatchEvents: true });
    }

    await U.sleep(modoDigitacao ? 500 : 250);

    await aplicarValorAngularViaInjecao(el, valor, { ehSexo: !!ehSexo, ehSelect: el.tagName === "SELECT" });
    await U.sleep(350);

    if (progressCb) {
      passo(`${pct}% - ✅ Preenchido ${rotulo} = "${valor}"`, pct, progressCb);
    } else {
      console.log(`[CuriaAutomation] ✅ Preenchido ${rotulo} = "${valor}" em:`, el);
    }
    await U.sleep(300);
    return true;
  };

  const passo1FormularioPrincipal = async (dados, progressCb) => {
    passo("Passo 1/4: Preenchendo formulário principal (Data, Local, Test. Qualificada)...", 8, progressCb);
    console.log("%c[Curia IA] DUMP DOS CAMPOS DO FORMULÁRIO ABAIXO (copie para debug):", "background:#111;color:#0ff;font-weight:bold");
    dumpTodosOsCampos(document, "CAMPOS DO FORMULÁRIO PRINCIPAL");

    const procurarHora = () => {
      const candidatos = Array.from(document.querySelectorAll("input, select, textarea"));
      for (const inp of candidatos) {
        if (inp.offsetParent === null || inp.disabled || inp.type === "hidden") continue;
        if ((inp.getAttribute("ng-model") || "").toLowerCase().includes("hora")) return inp;
        if ((inp.getAttribute("name") || "").toLowerCase().includes("hora")) return inp;
        if ((inp.id || "").toLowerCase().includes("hora")) return inp;
        let p = inp.parentElement;
        for (let d = 0; d < 6 && p; d++) {
          const lab = p.querySelector(":scope > label, label");
          if (lab) {
            const txt = (lab.textContent || "").toUpperCase();
            if (/HORA/.test(txt) && !/HORARIO/.test(txt) && !/NASCIMENTO/.test(txt) && !/BAIRRO/.test(txt)) return inp;
          }
          p = p.parentElement;
        }
      }
      return null;
    };

    const camposEmOrdem = [
      {
        rotulo: "DATA DA CELEBRAÇÃO (DD/MM/AAAA)",
        valor: (dados || {}).data_celebacao || "",
        seletoresExatos: [SEL.mainDataCelebracao],
        keywords: [
          "data celebração", "data da celebração", "data_celebracao", "dt_celebracao",
          "dataCelebracao", "dataCasamento", "data_casamento", "dt_casamento",
          "DATA CELEBRACAO", "DATA DA CELEBRACAO",
        ],
        ngModelKeywords: ["datacelebracao", "data", "celebracao", "casamento", "dt_"],
      },
      {
        rotulo: "HORA DA CELEBRAÇÃO (HH:MM)",
        valor: (dados || {}).hora_celebacao || "",
        seletoresExatos: [SEL.mainHoraCelebracao],
        finderCustom: procurarHora,
        keywords: [
          "hora", "horário", "horario", "hora_celebracao", "horarioCelebracao",
          "horaCasamento", "hora_casamento", "horário celebração", "HORA CELEBRACAO",
        ],
        ngModelKeywords: ["horacelebracao", "hora", "horario", "horario_", "hora_"],
      },
      {
        rotulo: "LOCAL / PARÓQUIA / CAPELA",
        valor: (dados || {}).local_celebacao || "",
        seletoresExatos: [SEL.mainLocalCelebracao],
        keywords: [
          "local", "local celebração", "local_celebracao", "localCelebracao",
          "paroquia", "paróquia", "igreja", "capela", "local_casamento",
          "LOCAL CELEBRACAO", "LOCAL DO CASAMENTO",
        ],
        ngModelKeywords: ["localcelebracao", "local", "paroquia", "igreja", "capela"],
      },
      {
        rotulo: "TESTEMUNHA QUALIFICADA (Padre Celebrante / Redmo.)",
        valor: (dados || {}).testemunha_qualificada || "",
        seletoresExatos: [SEL.mainTestemunhaQualificada],
        keywords: [
          "testemunha qualificada", "testemunha_qualificada", "qualificada",
          "celebrante", "padre", "padre celebrante", "redmo", "revmo",
          "sacerdote", "presidente", "oficiante",
          "TESTEMUNHA QUALIFICADA", "PADRE CELEBRANTE",
        ],
        ngModelKeywords: ["celebrante", "testemunha", "qualificada", "padre", "sacerdote", "oficiante", "redmo"],
      },
    ];

    for (let i = 0; i < camposEmOrdem.length; i++) {
      const c = camposEmOrdem[i];
      const pct = 8 + i * 1;
      if (!c.valor) {
        passo(`${pct}% - ${c.rotulo} sem valor extraído (pulando).`, pct, progressCb);
        continue;
      }
      passo(`${pct}% - Buscando campo ${c.rotulo} (seletor exato primeiro)...`, pct, progressCb);
      let el = null;

      if (c.seletoresExatos && c.seletoresExatos.length) {
        for (const sel of c.seletoresExatos) {
          try {
            const achou = document.querySelector(sel);
            if (achou && achou.offsetParent !== null && !achou.disabled) { el = achou; break; }
          } catch (_) {}
        }
        if (el) {
          console.log(`[CuriaAutomation] passo1: Campo ${c.rotulo} ENCONTRADO via SELETOR EXATO = "${c.seletoresExatos.join('|')}"`, el);
        }
      }
      if (!el && c.finderCustom) {
        try {
          const achou = c.finderCustom();
          if (achou) { el = achou; console.log(`[CuriaAutomation] passo1: Campo ${c.rotulo} ENCONTRADO via finderCustom`, el); }
        } catch (_) {}
      }

      if (!el) {
        const todosInputs = Array.from(document.querySelectorAll("input, select, textarea"));
        for (const tentativa of ["exatoLabel", "exatoName", "ngModelContem", "textoContainer"]) {
          for (const inp of todosInputs) {
            if (inp.offsetParent === null || inp.disabled || inp.type === "hidden") continue;
            let match = false;
            if (tentativa === "exatoLabel") {
              if (inp.id) {
                const lbl = document.querySelector(`label[for='${inp.id}']`);
                if (lbl) {
                  const txt = (lbl.textContent || "").toUpperCase();
                  if (c.keywords.some((k) => txt.includes(k.toUpperCase()))) match = true;
                }
              }
              if (!match) {
                let p = inp.parentElement;
                for (let d = 0; d < 6 && p; d++) {
                  const lab = p.querySelector(":scope > label");
                  if (lab) {
                    const txt = (lab.textContent || "").toUpperCase();
                    if (c.keywords.some((k) => txt.includes(k.toUpperCase()))) { match = true; break; }
                  }
                  p = p.parentElement;
                }
              }
            }
            if (!match && tentativa === "exatoName") {
              const attribs = [inp.name, inp.id, inp.getAttribute("placeholder") || "", inp.getAttribute("aria-label") || ""];
              for (const atr of attribs) {
                const atrUp = (atr || "").toUpperCase();
                if (c.keywords.some((k) => atrUp.includes(k.toUpperCase()))) match = true;
              }
            }
            if (!match && tentativa === "ngModelContem") {
              const model = (inp.getAttribute("ng-model") || "").toLowerCase();
              if (model && c.ngModelKeywords.some((k) => model.includes(k.toLowerCase()))) {
                match = true;
              }
            }
            if (!match && tentativa === "textoContainer") {
              let p = inp.parentElement;
              let combined = "";
              for (let d = 0; d < 5 && p; d++) {
                combined += " " + (p.textContent || "").toUpperCase();
                p = p.parentElement;
              }
              if (combined && c.keywords.some((k) => combined.includes(k.toUpperCase()))) {
                match = true;
              }
            }
            if (match) {
              el = inp;
              break;
            }
          }
          if (el) break;
        }

        if (!el && c.keywords.length) {
          el = buscarCampoPrincipal(c.keywords);
        }
      }

      if (el) {
        await preencherElemento(el, c.valor, progressCb, pct, c.rotulo);
      } else {
        console.warn("[CuriaAutomation] Não encontrei campo para:", c.rotulo, "keywords:", c.keywords, "ngModelKeywords:", c.ngModelKeywords);
        passo(`${pct}% - ⚠️ Não encontrei campo ${c.rotulo} no DOM. Preencha manualmente se necessário.`, pct, progressCb);
      }
    }

    await U.sleep(700);
    passo("12% - Formulário principal verificado (Data/Hora/Local/T.Qualificada).", 12, progressCb);
  };

  const clicarLupaFiel = async (tipo) => {
    let alvo = null;
    if (tipo === "NOIVO") {
      alvo =
        document.querySelector(SEL.lupaNoivo) ||
        document.querySelector("a.btn.btn-black img[src*='search']")?.closest("a");
    } else {
      alvo =
        document.querySelector(SEL.lupaNoiva) ||
        (() => {
          const anchors = document.querySelectorAll("a.btn.btn-black");
          for (const a of anchors) {
            if (a.getAttribute("ng-click") && /selectNoiva/i.test(a.getAttribute("ng-click"))) return a;
            const container = a.closest("div, fieldset, td, label");
            if (container && /NOIVA/i.test(container.textContent)) return a;
          }
          return null;
        })();
    }
    if (!alvo) throw new Error(`Botão de lupa do(a) ${tipo} não encontrado (ng-click).`);
    await U.clickElement(alvo, 200, 800);
    return true;
  };

  const localizarModal = async (tituloCandidatos) => {
    const inicio = Date.now();
    while (Date.now() - inicio < U.DEFAULT_TIMEOUT) {
      const modais = document.querySelectorAll(
        ".ui-dialog, .modal, [role='dialog'], .modal-dialog, .ngdialog, .ui-dialog-content"
      );
      for (const m of Array.from(modais).reverse()) {
        if (m.offsetParent === null) continue;
        if (m.classList && m.classList.contains("ui-dialog")) {
          const tit = m.querySelector(".ui-dialog-title");
          if (tit) {
            const txt = (tit.textContent || "").toUpperCase();
            if (tituloCandidatos.some((t) => txt.includes(t))) return m;
          }
          const conteudo = m.querySelector(".ui-dialog-content");
          if (conteudo) {
            const txt = (conteudo.textContent || "").toUpperCase();
            if (tituloCandidatos.some((t) => txt.includes(t))) return m;
          }
        }
        const texto = (m.textContent || "").toUpperCase();
        if (tituloCandidatos.some((t) => texto.includes(t))) return m;
      }
      await U.sleep(200);
    }
    return null;
  };

  const encontrarBotaoPorTextoNoModal = (modal, textos, exact = true) => {
    for (const t of textos) {
      const xpPrioridade = `.//span[contains(concat(' ',normalize-space(@class),' '),' ui-button-text ') and normalize-space()="${t}"]`;
      const it = document.evaluate(xpPrioridade, modal, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const spanPrioridade = it.singleNodeValue;
      if (spanPrioridade) {
        const btn = spanPrioridade.closest("button, a, input[type='button'], input[type='submit']");
        if (btn && btn.offsetParent !== null) return btn;
      }
    }

    const seletores = "button, a, input[type='button'], input[type='submit']";
    const candidatos = modal.querySelectorAll(seletores);
    for (const t of textos) {
      for (const el of candidatos) {
        const span = el.querySelector(".ui-button-text");
        const txt = (
          span?.textContent ||
          el.textContent ||
          el.value ||
          el.getAttribute("aria-label") ||
          ""
        ).trim();
        const igual = exact
          ? txt.toUpperCase() === t.toUpperCase()
          : txt.toUpperCase().includes(t.toUpperCase());
        if (igual && el.offsetParent !== null) return el;
      }
    }
    for (const t of textos) {
      const xp = `.//span[contains(concat(' ',normalize-space(@class),' '),' ui-button-text ') and ${exact ? "normalize-space()=\"" + t + "\"" : "contains(normalize-space(),\"" + t + "\")"}]`;
      const it = document.evaluate(xp, modal, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const span = it.singleNodeValue;
      if (span && span.closest("button")) {
        const btn = span.closest("button");
        if (btn.offsetParent !== null) return btn;
      }
    }
    return null;
  };

  const clicarBotaoModal = async (modal, textos, exact = true) => {
    const b = encontrarBotaoPorTextoNoModal(modal, textos, exact);
    if (b) {
      await U.clickElement(b, 200, 500);
      return true;
    }
    return false;
  };

  const preencherModalCadastroFiel = async (modal, pessoa) => {
    const root = modal.querySelector(".ui-dialog-content") || modal;
    const ehNoiva = pessoa.sexo === "FEMININO";
    console.log(`%c[Curia IA] DUMP MODAL CADASTRO DE FIEL (${ehNoiva ? "NOIVA" : "NOIVO"}) ABAIXO:`, "background:#222;color:#f0f;font-weight:bold");
    dumpTodosOsCampos(root, `CAMPOS DO MODAL CADASTRO - ${ehNoiva ? "NOIVA" : "NOIVO"}`);
    const campos = root.querySelectorAll("input, select, textarea");

    const camposModalEmOrdem = [
      {
        rotulo: "NOME COMPLETO",
        seletorExato: SEL.modalNome,
        name: "nome",
        valor: pessoa.nome,
      },
      {
        rotulo: "SEXO (SELECT: M/F)",
        seletorExato: SEL.modalSexo,
        name: "sexo",
        valor: pessoa.sexo,
        ehSexo: true,
      },
      {
        rotulo: "PROFISSÃO",
        seletorExato: SEL.modalProfissao,
        name: "profissao",
        valor: pessoa.profissao,
      },
      {
        rotulo: "MÃE",
        seletorExato: SEL.modalMae,
        name: "nmae",
        valor: pessoa.mae,
      },
      {
        rotulo: "PAI",
        seletorExato: SEL.modalPai,
        name: "npai",
        valor: pessoa.pai,
      },
    ];

    const matchRotulo = (el, keywords) => {
      const place = (el.getAttribute("placeholder") || "").toUpperCase();
      const name = (el.getAttribute("name") || "").toUpperCase();
      const id = (el.id || "").toUpperCase();
      const model = (el.getAttribute("ng-model") || "").toUpperCase();
      let rotulo = "";
      if (el.id) {
        const lbl = root.querySelector(`label[for='${el.id}']`);
        if (lbl) rotulo = lbl.textContent.toUpperCase();
      }
      let p = el.parentElement;
      let textoPai = "";
      for (let i = 0; i < 6 && p; i++) {
        textoPai += " " + (p.textContent || "").toUpperCase();
        const lab = p.querySelector(":scope > label");
        if (lab) rotulo += " " + (lab.textContent || "").toUpperCase();
        p = p.parentElement;
      }
      const tudo = `${place} ${name} ${id} ${model} ${rotulo} ${textoPai}`;
      return keywords.some((k) => tudo.includes(k.toUpperCase()));
    };

    const setSelectSexoValorExato = async (select, valorOriginal) => {
      if (!select || !valorOriginal) return false;
      const ehMasc = /MASC|M[^A-Z]/.test(valorOriginal.toUpperCase()) || valorOriginal.toUpperCase() === "M";
      const valorOptionExato = ehMasc ? "M" : "F";
      const opts = Array.from(select.options);
      let alvo = null;
      for (const opt of opts) {
        const v = String(opt.value || "").trim().toUpperCase();
        const t = (opt.textContent || "").trim().toUpperCase();
        if (v === valorOptionExato || t === valorOptionExato) {
          alvo = opt;
          break;
        }
      }
      if (alvo) {
        U.setInputValue(select, alvo.value);
        try {
          await aplicarValorAngularViaInjecao(select, alvo.value, { ehSexo: true, ehSelect: true });
        } catch (_) {}
        console.log(`[CuriaAutomation] Modal ${ehNoiva ? "NOIVA" : "NOIVO"}: ✅ SEXO setado option.value="${alvo.value}" (${alvo.textContent})`);
        return true;
      }
      const valor = valorOriginal.toUpperCase().trim();
      const variantes = new Set([
        valor,
        valor.replace(/\s+/g, ""),
        valor.substring(0, 1),
        ehMasc ? "MASC" : "FEM",
        ehMasc ? "M." : "F.",
        ehMasc ? "1" : "2",
        ehMasc ? "M" : "F",
      ]);
      for (const opt of opts) {
        const v = String(opt.value || "").toUpperCase().trim();
        const t = (opt.textContent || "").toUpperCase().trim();
        if (variantes.has(v) || variantes.has(t) || variantes.has(t.replace(/\s+/g, ""))) {
          U.setInputValue(select, opt.value);
          try { await aplicarValorAngularViaInjecao(select, opt.value, { ehSexo: true, ehSelect: true }); } catch (_) {}
          console.log(`[CuriaAutomation] Modal ${ehNoiva ? "NOIVA" : "NOIVO"}: ✅ SEXO setado via variante option.value="${opt.value}"`);
          return true;
        }
      }
      U.setInputValue(select, valorOptionExato);
      return true;
    };

    for (const c of camposModalEmOrdem) {
      if (!c.valor) {
        console.warn(`[CuriaAutomation] Modal ${ehNoiva ? "NOIVA" : "NOIVO"}: sem valor para ${c.rotulo}, pulando.`);
        continue;
      }
      let el = null;
      if (c.seletorExato) {
        try {
          const achou = root.querySelector(c.seletorExato);
          if (achou && achou.offsetParent !== null) el = achou;
        } catch (_) {}
        if (el) {
          console.log(`[CuriaAutomation] Modal ${ehNoiva ? "NOIVA" : "NOIVO"}: Campo ${c.rotulo} ENCONTRADO via SELETOR EXATO ${c.seletorExato} (name="${c.name}"):`, el);
        }
      }
      if (!el && c.name) {
        for (const inp of campos) {
          if ((inp.getAttribute("name") || "").toUpperCase() === c.name.toUpperCase()) {
            el = inp; break;
          }
        }
      }
      if (!el) {
        const keywordsFallback = {
          "NOME COMPLETO": ["NOME COMPLETO", "NOME COMPL", "NOME DO FIEL", "NOME"],
          "SEXO (SELECT: M/F)": ["SEXO", "GÊNERO", "GENERO"],
          "PROFISSÃO": ["PROFISSÃO", "PROFISSAO", "CARGO", "OCUPAÇÃO", "OCUPACAO"],
          "MÃE": ["MÃE", "MAE DO FIEL", "NOME DA MÃE", "MAE"],
          "PAI": ["PAI", "PAI DO FIEL", "NOME DO PAI"],
        };
        const kws = keywordsFallback[c.rotulo] || [c.rotulo];
        for (const inp of campos) {
          if (matchRotulo(inp, kws)) {
            el = inp; break;
          }
        }
      }

      if (el) {
        if (c.ehSexo && el.tagName === "SELECT") {
          await setSelectSexoValorExato(el, c.valor);
        } else {
          try { el.focus(); } catch (_) {}
          U.setInputValue(el, c.valor, { clearFirst: true, dispatchEvents: true, simulateTyping: true });
          await U.sleep(500);
          try {
            await aplicarValorAngularViaInjecao(el, c.valor, { ehSexo: false, ehSelect: false });
          } catch (_) {}
          console.log(`[CuriaAutomation] Modal ${ehNoiva ? "NOIVA" : "NOIVO"}: ✅ Preenchido ${c.rotulo} = "${c.valor}"`, el);
        }
      } else {
        console.warn(
          `[CuriaAutomation] Modal ${ehNoiva ? "NOIVA" : "NOIVO"}: NÃO encontrou campo ${c.rotulo}. seletorExato=${c.seletorExato} | name=${c.name} | valor="${c.valor}"`
        );
      }
      await U.sleep(600);
    }

    await U.sleep(700);
  };

  const cadastrarFiel = async (pessoa, tipo, progressCb, progressStart, progressEnd) => {
    passo(`${progressStart}% - Abrindo lupa do(a) ${tipo}...`, progressStart, progressCb);
    await clicarLupaFiel(tipo);

    passo(`${progressStart + 3}% - Aguardando modal "Localizar Fiel"...`, progressStart + 3, progressCb);
    const modalLocalizar = await localizarModal(["LOCALIZAR FIEL", "PESQUISAR FIEL", "BUSCAR FIEL", "SELECIONAR FIEL"]);
    if (!modalLocalizar) {
      throw new Error(`Modal "Localizar Fiel" (ui-dialog) não abriu para ${tipo}.`);
    }

    passo(`${progressStart + 8}% - Clicando em "Novo cadastro"...`, progressStart + 8, progressCb);
    let clicou = await clicarBotaoModal(modalLocalizar, ["Novo cadastro", "Novo Cadastro", "NOVO CADASTRO"], false);
    if (!clicou) {
      const uiBtns = modalLocalizar.querySelectorAll("button.ui-button");
      for (const b of uiBtns) {
        const txt = (b.textContent || "").toUpperCase();
        if (txt.includes("NOVO") || txt.includes("CADASTRAR")) {
          console.log(`[CuriaAutomation] ${tipo}: fallback clique "Novo cadastro" em:`, b);
          await U.clickElement(b, 200, 500);
          clicou = true;
          break;
        }
      }
    }
    if (!clicou) throw new Error('Botão "Novo cadastro" (jQuery UI / span.ui-button-text) não encontrado.');
    await U.sleep(1400);

    passo(`${progressStart + 14}% - Aguardando modal "Cadastro de Fiel"...`, progressStart + 14, progressCb);
    const modalCadastro = await localizarModal([
      "CADASTRO DE FIEL",
      "NOVO FIEL",
      "INCLUIR FIEL",
      "CADASTRAR FIEL",
      "DADOS DO FIEL",
    ]);
    if (!modalCadastro) {
      throw new Error(`Modal "Cadastro de Fiel" (ui-dialog) não abriu para ${tipo}.`);
    }
    console.log(`[CuriaAutomation] Modal de Cadastro encontrado para ${tipo}:`, modalCadastro);

    passo(`${progressStart + 20}% - Preenchendo dados do(a) ${tipo} (Nome→Sexo→Profissão→Mãe→Pai)...`, progressStart + 20, progressCb);
    await preencherModalCadastroFiel(modalCadastro, pessoa);

    passo(`${progressStart + 26}% - Clicando em "Gravar cadastro" (button span.ui-button-text)...`, progressStart + 26, progressCb);
    const botaoGravar = encontrarBotaoPorTextoNoModal(
      modalCadastro,
      ["Gravar cadastro", "GRAVAR CADASTRO", "Salvar cadastro", "SALVAR CADASTRO"],
      false
    );
    let gravou = false;
    if (botaoGravar) {
      const txtSpan = botaoGravar.querySelector(".ui-button-text")?.textContent?.trim() || "";
      console.log(
        `[CuriaAutomation] ${tipo}: Botão "Gravar cadastro" ENCONTRADO via span.ui-button-text="${txtSpan}". Clicando.`,
        botaoGravar
      );
      await U.clickElement(botaoGravar, 300, 600);
      gravou = true;
    }
    if (!gravou) {
      gravou = await clicarBotaoModal(
        modalCadastro,
        [
          "Gravar",
          "Salvar",
          "SALVAR",
          "Confirmar",
          "CONFIRMAR",
          "Incluir",
          "INCLUIR",
        ],
        false
      );
    }
    if (!gravou) {
      const btn = modalCadastro.querySelector(
        "input[type='submit'], button.ui-button, input[type='button']"
      );
      if (btn) {
        console.warn(`[CuriaAutomation] ${tipo}: fallback genérico salvar em:`, btn);
        await U.clickElement(btn, 300, 1000);
      } else throw new Error(`Botão de salvar cadastro de ${tipo} não encontrado.`);
    }
    await U.sleep(3000);

    passo(`${progressStart + 32}% - Verificando fechamento/associação do(a) ${tipo}...`, progressStart + 32, progressCb);
    let fechou = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 18000) {
      if (!modalCadastro.isConnected || modalCadastro.offsetParent === null) {
        fechou = true;
        break;
      }
      if (modalLocalizar.isConnected && modalLocalizar.offsetParent !== null) {
        const sel = await clicarBotaoModal(
          modalLocalizar,
          ["Selecionar", "SELECIONAR", "Confirmar", "CONFIRMAR", "Associar", "Ok", "OK", "Escolher", "Confirmar seleção"],
          false
        );
        if (sel) {
          console.log(`[CuriaAutomation] ${tipo}: Clicou em Selecionar no modal Localizar Fiel.`);
          await U.sleep(2000);
          const t1 = Date.now();
          while (Date.now() - t1 < 8000) {
            if (!modalLocalizar.isConnected || modalLocalizar.offsetParent === null) break;
            await U.sleep(300);
          }
          break;
        }
      }
      await U.sleep(400);
    }
    if (!fechou && modalCadastro.isConnected && modalCadastro.offsetParent !== null) {
      const fecha = modalCadastro.querySelectorAll(
        "button.ui-dialog-titlebar-close, .ui-icon-closethick, .close, [aria-label='Close'], [data-dismiss='modal']"
      );
      for (const b of fecha) {
        if (b.offsetParent !== null) { try { await U.clickElement(b, 100, 700); break; } catch (_) {} }
      }
    }
    await U.sleep(1300);
    passo(`${progressEnd}% - ${tipo} cadastrado(a) e associado(a).`, progressEnd, progressCb);
  };

  const passo2CadastrarNoivo = async (dados, cb) => cadastrarFiel(dados.noivo, "NOIVO", cb, 14, 40);
  const passo3CadastrarNoiva = async (dados, cb) => cadastrarFiel(dados.noiva, "NOIVA", cb, 44, 70);

  const clicarSalvarContinuar = async (progressCb) => {
    passo("71% - Clicando em Salvar e Continuar (btn-blue / gravarContinuar)...", 71, progressCb);
    let b = document.querySelector(SEL.btnSalvarContinuar);
    if (!b) {
      const cand = document.querySelectorAll("input.btn-blue, input[value*='Continuar'], button.btn-blue, .btn-blue");
      for (const c of cand) {
        if (c.offsetParent === null || c.disabled) continue;
        const txt = ((c.value || "") + " " + (c.textContent || "")).toUpperCase();
        if (txt.includes("SALVAR") && txt.includes("CONTINUAR")) { b = c; break; }
      }
    }
    if (b && b.offsetParent !== null) {
      await U.clickElement(b, 350, 1500);
      await U.sleep(1800);
      passo("75% - Botão Salvar e Continuar acionado. Aguardando formulário recarregar/avançar...", 75, progressCb);
      await U.sleep(2000);
      return true;
    }
    passo("75% - (Botão Salvar e Continuar não encontrado neste momento. Prosseguindo para testemunhas.)", 75, progressCb);
    return false;
  };

  const selecionarOpcaoSelectPorTexto = async (select, texto) => {
    if (!select || !texto) return;
    await U.sleep(150);
    if (select.tagName === "SELECT") {
      U.setInputValue(select, texto);
      await U.sleep(200);
      return;
    }
    try {
      await U.clickElement(select, 150, 300);
    } catch (_) {}
    await U.sleep(250);
    const opcoes = document.querySelectorAll(
      ".dropdown-menu li, .dropdown-item, [role='option'], .select2-results__option, .ng-option, .p-dropdown-item, li, .ui-menu-item, .ui-selectmenu-item"
    );
    for (const op of opcoes) {
      const t = (op.textContent || "").trim();
      if (t && t.toUpperCase() === texto.toUpperCase()) {
        await U.clickElement(op, 120, 300);
        return;
      }
    }
    for (const op of opcoes) {
      const t = (op.textContent || "").toUpperCase();
      if (t.includes(texto.toUpperCase())) {
        await U.clickElement(op, 120, 300);
        return;
      }
    }
  };

  const cadastrarTestemunha = async (dadosTestemunha, tipoTestemunhoDe, n, progressCb) => {
    const startP = 77 + (n - 1) * 11;
    passo(`${startP}% - Adicionando testemunha ${n} (${tipoTestemunhoDe})...`, startP, progressCb);

    let btnAdd = document.querySelector(SEL.btnMaisTestemunha);
    if (!btnAdd) {
      const todos = document.querySelectorAll("input.btn-green, button.btn-green, input[value*='Testemunha']");
      for (const b of todos) {
        if (b.offsetParent !== null && (b.value || "").toUpperCase().includes("TESTEMUNHA")) {
          btnAdd = b; break;
        }
      }
    }
    if (!btnAdd) throw new Error('Botão "+ Testemunha" (btn-green / openModalTestemunha) não encontrado.');
    await U.clickElement(btnAdd, 250, 900);

    passo(`${startP + 3}% - Aguardando modal de testemunha (ui-dialog)...`, startP + 3, progressCb);
    const modal = await localizarModal([
      "TESTEMUNHA",
      "CADASTRAR TESTEMUNHA",
      "NOVA TESTEMUNHA",
      "INCLUIR TESTEMUNHA",
      "DADOS DA TESTEMUNHA",
    ]);
    if (!modal) throw new Error("Modal de testemunha (ui-dialog) não abriu.");

    const root = modal.querySelector(".ui-dialog-content") || modal;

    passo(`${startP + 5}% - Selecionando Tipo: CELEBRAÇÃO...`, startP + 5, progressCb);
    const selects = root.querySelectorAll("select, [role='listbox'], .ui-selectmenu-button, [class*='select'], .p-dropdown, .ng-select");
    let tipoSel = null, testemunhaDeSel = null;
    for (const s of selects) {
      let rotulo = "";
      if (s.id) {
        const l = root.querySelector(`label[for='${s.id}']`);
        if (l) rotulo = l.textContent.toUpperCase();
      }
      let p = s.parentElement;
      for (let i = 0; i < 4 && p; i++) {
        rotulo += " " + (p.textContent || "").toUpperCase();
        p = p.parentElement;
      }
      const ngModel = (s.getAttribute("ng-model") || "").toUpperCase();
      rotulo += " " + ngModel;
      if (!tipoSel && (rotulo.includes("TIPO DE TESTEMUNHA") || rotulo.includes("TIPO TESTEMUNHA") || rotulo.includes("TIPO:") || /TIPO.*TESTEMUNHA/.test(rotulo))) {
        tipoSel = s;
      } else if (
        !testemunhaDeSel &&
        (rotulo.includes("TESTEMUNHA DE") ||
          rotulo.includes("DE QUEM É") ||
          rotulo.includes("ASSOCIADO A") ||
          rotulo.includes("PERTENCE") ||
          /(NOIVO|NOIVA).*TESTEMUNHA/.test(rotulo))
      ) {
        testemunhaDeSel = s;
      }
    }
    if (tipoSel) await selecionarOpcaoSelectPorTexto(tipoSel, "CELEBRAÇÃO");
    await U.sleep(300);

    passo(`${startP + 7}% - Selecionando Testemunha de: ${tipoTestemunhoDe}...`, startP + 7, progressCb);
    if (testemunhaDeSel) {
      await selecionarOpcaoSelectPorTexto(testemunhaDeSel, tipoTestemunhoDe);
    } else {
      for (const s of selects) {
        const t = (s.getAttribute("placeholder") || s.getAttribute("name") || s.id || s.getAttribute("ng-model") || "").toUpperCase();
        if ((t.includes("TESTEMUNHA") || t.includes("TESTEMUNHADE")) && (t.includes("NOIVO") || t.includes("NOIVA"))) {
          await selecionarOpcaoSelectPorTexto(s, tipoTestemunhoDe);
          break;
        }
      }
    }
    await U.sleep(300);

    passo(`${startP + 9}% - Preenchendo nome da testemunha ${n}...`, startP + 9, progressCb);
    const inputs = root.querySelectorAll("input, select, textarea");
    let campoNome = null;
    for (const el of inputs) {
      if (el.tagName === "SELECT") continue;
      const place = (el.getAttribute("placeholder") || "").toUpperCase();
      const name = (el.getAttribute("name") || "").toUpperCase();
      const id = (el.id || "").toUpperCase();
      const model = (el.getAttribute("ng-model") || "").toUpperCase();
      let rotulo = "";
      if (el.id) {
        const l = root.querySelector(`label[for='${el.id}']`);
        if (l) rotulo = l.textContent.toUpperCase();
      }
      const tudo = `${place} ${name} ${id} ${model} ${rotulo}`;
      if (
        !campoNome &&
        (tudo.includes("NOME COMPLETO") ||
          tudo.includes("NOME DA TESTEMUNHA") ||
          tudo.includes("NOME TESTEMUNHA") ||
          (tudo.includes("NOME") &&
            !tudo.includes("MÃE") && !tudo.includes("MAE") &&
            !tudo.includes("PAI") &&
            !tudo.includes("FILIAÇÃO") && !tudo.includes("FILIACAO")))
      ) {
        if (!el.value || el.value.trim() === "") {
          campoNome = el;
          break;
        }
      }
    }
    if (!campoNome && dadosTestemunha) {
      const primeiro = root.querySelector("input[type='text'], input:not([type])");
      if (primeiro && (!primeiro.value || primeiro.value.trim() === "")) campoNome = primeiro;
    }
    if (campoNome && dadosTestemunha) {
      try {
        await preencherElemento(campoNome, dadosTestemunha, progressCb, startP + 9.5, `Nome Testemunha ${n}`, { simularDigitacao: true });
      } catch (e) {
        console.warn("[CuriaAutomation] cadastrarTestemunha: fallback para setInputValue no campo nome:", e);
        U.setInputValue(campoNome, dadosTestemunha, { simulateTyping: true, clearFirst: true, dispatchEvents: true });
        try { await aplicarValorAngularViaInjecao(campoNome, dadosTestemunha, {}); } catch (_) {}
      }
      await U.sleep(600);
    }

    passo(`${startP + 10}% - Salvando testemunha ${n}...`, startP + 10, progressCb);
    const salvou = await clicarBotaoModal(
      modal,
      ["Salvar", "SALVAR", "Gravar", "GRAVAR", "Confirmar", "CONFIRMAR", "OK", "Associar", "Incluir", "INCLUIR"],
      false
    );
    if (!salvou) {
      const fecharBtns = modal.querySelectorAll(
        "input[type='submit'], button.ui-button, input[type='button'], .close, [data-dismiss='modal'], [aria-label='Close'], .ui-dialog-titlebar-close"
      );
      for (const b of fecharBtns) {
        if (b.offsetParent !== null) { try { await U.clickElement(b, 100, 400); break; } catch (_) {} }
      }
    }
    await U.sleep(1200);
  };

  const passo4Testemunhas = async (dados, cb) => {
    passo("77% - Iniciando cadastro das testemunhas (após Salvar e Continuar)...", 77, cb);
    await U.sleep(600);
    if (dados.testemunha_noivo) {
      await cadastrarTestemunha(dados.testemunha_noivo, "NOIVO", 1, cb);
    } else {
      passo("88% - (Sem testemunha do noivo para cadastrar)", 88, cb);
    }
    await U.sleep(900);
    if (dados.testemunha_noiva) {
      await cadastrarTestemunha(dados.testemunha_noiva, "NOIVA", 2, cb);
    } else {
      passo("97% - (Sem testemunha da noiva para cadastrar)", 97, cb);
    }
    await U.sleep(800);
  };

  const STORAGE_KEY = "curia_ia_sessao_automacao";
  const storageGet = async () => {
    try {
      const res = await new Promise((r) => {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get([STORAGE_KEY], (o) => r(o[STORAGE_KEY] || null));
        } else if (typeof browser !== "undefined" && browser.storage && browser.storage.local) {
          browser.storage.local.get(STORAGE_KEY).then((o) => r(o?.[STORAGE_KEY] || null)).catch(() => r(null));
        } else r(null);
      });
      return res || null;
    } catch (_) { return null; }
  };
  const storageSet = async (obj) => {
    try {
      await new Promise((r) => {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ [STORAGE_KEY]: obj }, () => r(true));
        } else if (typeof browser !== "undefined" && browser.storage && browser.storage.local) {
          browser.storage.local.set({ [STORAGE_KEY]: obj }).then(() => r(true)).catch(() => r(false));
        } else r(false);
      });
      return true;
    } catch (_) { return false; }
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

  const estaNaTelaDeTestemunhas = () => {
    try {
      const url = (location.href || "").toLowerCase();
      const temBotaoTestemunha = !!document.querySelector(SEL.btnMaisTestemunha);
      const temTabelaTestemunhas = !!document.querySelector("div[class*='testemunha'] table, table[class*='testemunha'], form[class*='testemunha'], [ng-model*='testemunha']");
      const urlHint = /testemunh|habmatrim|matrim|fhabilita|habilitacao/i.test(url);
      return temBotaoTestemunha || (urlHint && temTabelaTestemunhas);
    } catch (_) { return false; }
  };

  const retomarFluxoAposNavegacao = async (progressCallback = null) => {
    const sessao = await storageGet();
    if (!sessao || !sessao.dados || sessao.etapa !== "aguardando_tela_testemunhas") {
      return { retomou: false, motivo: "sem_sessao_pendente" };
    }
    const tem = estaNaTelaDeTestemunhas();
    if (!tem) {
      return { retomou: false, motivo: "nao_esta_na_tela_testemunhas" };
    }
    try {
      if (progressCallback) passo("77% - Detectada nova tela! Retomando automação: cadastrando TESTEMUNHAS...", 77, progressCallback);
      console.log("[Curia IA] ⚡ RETOMADA DE FLUXO APÓS NAVEGAÇÃO: iniciando passo4Testemunhas...");
      await passo4Testemunhas(sessao.dados, progressCallback);
      passo("100% - Concluído! (Fluxo retomado após Salvar e Continuar) Revise os dados antes de prosseguir manualmente.", 100, progressCallback);
      console.log("[Curia IA] ✅ Fluxo retomado e concluído após navegação.");
      await storageClear();
      return { retomou: true };
    } catch (e) {
      console.error("[Curia IA] ❌ Erro ao retomar fluxo após navegação:", e);
      if (progressCallback) passo(`90% - Erro ao retomar: ${String(e.message||e)}`, 90, progressCallback);
      return { retomou: false, motivo: "erro", erro: String(e.message||e) };
    }
  };

  const executarFluxoCompleto = async (dados, progressCallback) => {
    passo("Iniciando automação na ORDEM EXATA: Data → Local → T.Qualificada → Noivo → Noiva → Salvar e Continuar → Testemunhas.", 2, progressCallback);
    await storageClear();
    await U.sleep(500);
    await passo1FormularioPrincipal(dados, progressCallback);
    await U.sleep(700);
    await passo2CadastrarNoivo(dados, progressCallback);
    await U.sleep(1000);
    await passo3CadastrarNoiva(dados, progressCallback);
    await U.sleep(1100);
    passo("71% - ⚡ Salvando sessão no storage e clicando em Salvar e Continuar (a página vai trocar)...", 71, progressCallback);
    const salvouStorage = await storageSet({
      etapa: "aguardando_tela_testemunhas",
      dados: JSON.parse(JSON.stringify(dados)),
      timestamp: Date.now(),
      progresso: 76,
    });
    console.log("[Curia IA] Sessão salva no storage para retomar após navegação:", salvouStorage, "etapa=aguardando_tela_testemunhas");
    await clicarSalvarContinuar(progressCallback);
    await U.sleep(800);
    if (estaNaTelaDeTestemunhas()) {
      console.log("[Curia IA] Página NÃO navegou (ou já avançou e mantivemos DOM). Iniciando passo4Testemunhas DIRETO.");
      await passo4Testemunhas(dados, progressCallback);
      await storageClear();
      passo("100% - Concluído! Revise os dados antes de prosseguir manualmente.", 100, progressCallback);
      return;
    }
    passo("76% - Página navegando! Aguardando recarregar para retomar Testemunhas automaticamente...", 76, progressCallback);
  };

  return {
    executarFluxoCompleto,
    passo1FormularioPrincipal,
    passo2CadastrarNoivo,
    passo3CadastrarNoiva,
    passo4Testemunhas,
    retomarFluxoAposNavegacao,
    storageGet,
    storageSet,
    storageClear,
    estaNaTelaDeTestemunhas,
  };
})();

try {
  window.CuriaAutomation = CuriaAutomation;
  console.log("[Curia IA] CuriaAutomation carregado ✅");
} catch (_) {}
