console.log("[Curia IA] Service Worker iniciado.");

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Curia IA] Extensão instalada/atualizada.");
  chrome.storage.local.set({
    backendUrl: "http://localhost:8000",
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "PING") {
    sendResponse({ ok: true });
  }
  return true;
});
