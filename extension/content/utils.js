const CuriaUtils = (() => {
  const DEFAULT_TIMEOUT = 15000;
  const DEFAULT_DELAY = 600;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const waitForElement = (selector, options = {}) => {
    const {
      timeout = DEFAULT_TIMEOUT,
      root = document,
      multiple = false,
      visible = false,
    } = options;

    return new Promise((resolve, reject) => {
      const start = Date.now();

      const check = () => {
        let results;
        try {
          if (multiple) {
            results = Array.from(root.querySelectorAll(selector));
          } else {
            results = root.querySelector(selector);
          }
        } catch (e) {
          results = multiple ? [] : null;
        }

        const hasResults = multiple ? results.length > 0 : !!results;

        if (hasResults) {
          if (visible) {
            const list = multiple ? results : [results];
            const allVisible = list.every((el) => {
              if (!el || !(el instanceof HTMLElement)) return false;
              const style = window.getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                style.opacity !== "0" &&
                rect.width > 0 &&
                rect.height > 0
              );
            });
            if (allVisible) {
              resolve(results);
              return;
            }
          } else {
            resolve(results);
            return;
          }
        }

        if (Date.now() - start > timeout) {
          reject(new Error(`waitForElement timeout: ${selector}`));
          return;
        }
        requestAnimationFrame(check);
      };

      check();
    });
  };

  const findButtonByText = (text, root = document, exact = true) => {
    const selectors = ["button", "a", "span", "div", "input[type='button']", "input[type='submit']"];
    for (const sel of selectors) {
      const els = root.querySelectorAll(sel);
      for (const el of els) {
        const t = (el.textContent || el.value || "").trim();
        if (exact ? t === text : t.includes(text)) {
          return el;
        }
      }
    }
    return null;
  };

  const findButtonByTextContains = (text, root = document) => {
    return findButtonByText(text, root, false);
  };

  const setInputValue = (input, value, options = {}) => {
    const { clearFirst = true, dispatchEvents = true, simulateTyping = false } = options;
    if (!input) return;

    if (input.tagName === "SELECT") {
      const foundOption = Array.from(input.options).find(
        (opt) =>
          opt.value === value ||
          opt.textContent.trim() === value ||
          opt.textContent.trim().toUpperCase() === value.toUpperCase()
      );
      if (foundOption) {
        input.value = foundOption.value;
      } else if (value) {
        input.value = value;
      }
      if (dispatchEvents) {
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
      }
      return;
    }

    try {
      input.focus();
    } catch (_) {}

    if (clearFirst && input.value) {
      try { input.select(); } catch (_) {}
      try { document.execCommand("delete", false, null); } catch (_) {}
      input.value = "";
      if (dispatchEvents) {
        input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Backspace", code: "Backspace", which: 8, keyCode: 8 }));
        input.dispatchEvent(new KeyboardEvent("keyup",   { bubbles: true, cancelable: true, key: "Backspace", code: "Backspace", which: 8, keyCode: 8 }));
        input.dispatchEvent(new Event("input",  { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    if (simulateTyping && value && typeof value === "string" && value.length < 120) {
      let current = "";
      for (let i = 0; i < value.length; i++) {
        const ch = value.charAt(i);
        const chUp = ch.toUpperCase();
        const keyCode = ch === "/" ? 191 : ch === ":" ? 186 : chUp.charCodeAt(0);
        try {
          input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: ch, code: `Key${chUp}`, which: keyCode, keyCode }));
        } catch (_) {}
        current += ch;
        input.value = current;
        try {
          input.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true, cancelable: true, key: ch, which: keyCode, keyCode, charCode: keyCode }));
        } catch (_) {}
        try {
          input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: ch, code: `Key${chUp}`, which: keyCode, keyCode }));
        } catch (_) {}
        try {
          input.dispatchEvent(new Event("input", { bubbles: true }));
        } catch (_) {}
      }
    } else {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (nativeInputValueSetter) {
        try { nativeInputValueSetter.call(input, value ?? ""); } catch (_) { input.value = value ?? ""; }
      } else {
        input.value = value ?? "";
      }
    }

    if (dispatchEvents) {
      try {
        input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter", code: "Enter", which: 13, keyCode: 13 }));
      } catch (_) {}
      try {
        input.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (_) {}
      try {
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (_) {}
      try {
        input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: "Enter", code: "Enter", which: 13, keyCode: 13 }));
      } catch (_) {}
      try {
        input.dispatchEvent(new Event("blur", { bubbles: true }));
      } catch (_) {}
    }
  };

  const findByLabel = (labelText, root = document) => {
    const labels = root.querySelectorAll("label");
    for (const label of labels) {
      if ((label.textContent || "").trim().toUpperCase().includes(labelText.toUpperCase())) {
        const forAttr = label.getAttribute("for");
        if (forAttr) {
          const el = root.querySelector(`#${forAttr}`);
          if (el) return el;
        }
        const next = label.nextElementSibling;
        if (next && (next.tagName === "INPUT" || next.tagName === "SELECT" || next.tagName === "TEXTAREA")) {
          return next;
        }
        const parent = label.parentElement;
        if (parent) {
          const input = parent.querySelector("input, select, textarea");
          if (input) return input;
        }
      }
    }
    return null;
  };

  const findByPlaceholder = (placeholderText, root = document) => {
    const t = placeholderText.toLowerCase();
    return (
      root.querySelector(
        `input[placeholder i='${placeholderText}'], textarea[placeholder i='${placeholderText}']`
      ) ||
      Array.from(root.querySelectorAll("input, textarea")).find(
        (el) => (el.getAttribute("placeholder") || "").toLowerCase().includes(t)
      )
    );
  };

  const findByNameOrId = (name, root = document) => {
    return (
      root.querySelector(`#${name}`) ||
      root.querySelector(`[name='${name}']`) ||
      root.querySelector(`[ng-model*='${name}']`) ||
      root.querySelector(`[formcontrolname='${name}']`)
    );
  };

  const clickElement = async (el, delayBefore = 150, delayAfter = 300) => {
    if (!el) throw new Error("Elemento nulo para clique");
    await sleep(delayBefore);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "auto", block: "center" });
    }
    el.click();
    await sleep(delayAfter);
  };

  const waitForTextInBody = async (text, timeout = DEFAULT_TIMEOUT) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (document.body.innerText.includes(text)) return true;
      await sleep(200);
    }
    return false;
  };

  const waitForElementDisappear = async (selector, timeout = DEFAULT_TIMEOUT) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (!el) return true;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return true;
      await sleep(200);
    }
    return false;
  };

  const getLatestModal = () => {
    const modals = document.querySelectorAll(".modal, [role='dialog'], .ui-dialog, .modal-dialog, .modal-content");
    if (modals.length === 0) return null;
    return modals[modals.length - 1];
  };

  return {
    sleep,
    waitForElement,
    findButtonByText,
    findButtonByTextContains,
    setInputValue,
    findByLabel,
    findByPlaceholder,
    findByNameOrId,
    clickElement,
    waitForTextInBody,
    waitForElementDisappear,
    getLatestModal,
    DEFAULT_DELAY,
    DEFAULT_TIMEOUT,
  };
})();

try {
  window.CuriaUtils = CuriaUtils;
  console.log("[Curia IA] CuriaUtils carregado ✅");
} catch (_) {}
