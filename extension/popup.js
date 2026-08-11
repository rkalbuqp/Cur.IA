const $ = (id) => document.getElementById(id);
const statusEl = $("status");

const mostrarStatus = (msg, tipo = "ok") => {
  statusEl.textContent = msg;
  statusEl.className = `status ${tipo}`;
  setTimeout(() => (statusEl.className = "status"), 3500);
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const dados = await chrome.storage.local.get("backendUrl");
    $("backendUrl").value = dados.backendUrl || "http://localhost:8000";
  } catch (e) {
    console.error(e);
  }

  $("saveBtn").addEventListener("click", async () => {
    const url = ($("backendUrl").value || "").trim().replace(/\/+$/, "");
    if (!url) {
      mostrarStatus("Informe a URL do backend.", "err");
      return;
    }
    try {
      await chrome.storage.local.set({ backendUrl: url });
      mostrarStatus("Configurações salvas! Recarregue a página do Cúria Online.");
    } catch (e) {
      mostrarStatus("Erro ao salvar: " + e.message, "err");
    }
  });
});
