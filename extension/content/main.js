(async () => {
  console.log("[Curia IA] Content Script carregado em:", window.location.href);

  const tentarInicializar = () => {
    if (typeof CuriaWidget !== "undefined" && typeof CuriaWidget.init === "function") {
      CuriaWidget.init();
      console.log("[Curia IA] Widget inicializado com sucesso.");
      return true;
    }
    return false;
  };

  if (document.readyState === "complete" || document.readyState === "interactive") {
    if (!tentarInicializar()) {
      let tentativas = 0;
      const intervalo = setInterval(() => {
        tentativas++;
        if (tentarInicializar() || tentativas > 20) clearInterval(intervalo);
      }, 200);
    }
  } else {
    window.addEventListener("DOMContentLoaded", () => {
      if (!tentarInicializar()) {
        let tentativas = 0;
        const intervalo = setInterval(() => {
          tentativas++;
          if (tentarInicializar() || tentativas > 20) clearInterval(intervalo);
        }, 200);
      }
    });
  }

  window.addEventListener("load", () => {
    setTimeout(() => {
      if (typeof CuriaWidget !== "undefined" && !document.getElementById("curia-ia-widget")) {
        CuriaWidget.init();
      }
    }, 1500);
  });
})();
