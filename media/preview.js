// @ts-check
(function () {
  const vscode = acquireVsCodeApi();
  const content = /** @type {HTMLElement} */ (document.getElementById('content'));

  const uri = document.body.dataset.uri;
  if (uri) vscode.setState({ uri });

  /** @type {{scrollEditorWithPreview: boolean, doubleClickToSwitchToEditor: boolean}} */
  let settings = { scrollEditorWithPreview: true, doubleClickToSwitchToEditor: true };

  /** Пока true, скролл вызван синхронизацией из редактора — эхо отправлять не нужно. */
  let syncingFromEditor = false;
  let syncTimer = 0;

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;

    if (message.type === 'update') {
      if (message.settings) {
        settings = message.settings;
        applySettings(message.settings);
      }
      const previousAnchor = topmostVisibleLine();
      content.innerHTML = message.html || '';
      if (previousAnchor !== null) scrollToLine(previousAnchor, false);
      return;
    }

    if (message.type === 'scrollTo' && typeof message.line === 'number') {
      scrollToLine(message.line, true);
    }
  });

  function applySettings(next) {
    const root = document.documentElement;
    if (typeof next.fontSize === 'number') root.style.setProperty('--jira-font-size', next.fontSize + 'px');
    if (typeof next.fontFamily === 'string' && next.fontFamily) {
      root.style.setProperty('--jira-font-family', next.fontFamily);
    }
    if (typeof next.maxWidth === 'number') {
      root.style.setProperty('--jira-max-width', next.maxWidth > 0 ? next.maxWidth + 'px' : 'none');
    }
  }

  /** Все элементы с привязкой к строке исходника, в порядке появления. */
  function lineElements() {
    return /** @type {HTMLElement[]} */ (Array.from(content.querySelectorAll('[data-line]')));
  }

  function lineOf(element) {
    const value = Number(element.getAttribute('data-line'));
    return Number.isFinite(value) ? value : null;
  }

  /** Номер строки исходника для верхней видимой части превью. */
  function topmostVisibleLine() {
    const elements = lineElements();
    for (const element of elements) {
      const rect = element.getBoundingClientRect();
      if (rect.bottom > 0) return lineOf(element);
    }
    return elements.length ? lineOf(elements[elements.length - 1]) : null;
  }

  /**
   * Прокручивает превью так, чтобы строка исходника оказалась вверху.
   * Между двумя ближайшими якорями положение интерполируется — так скролл
   * не «прыгает» на длинных абзацах и блоках кода.
   */
  function scrollToLine(line, markAsSync) {
    const elements = lineElements();
    if (!elements.length) return;

    let before = null;
    let after = null;
    for (const element of elements) {
      const value = lineOf(element);
      if (value === null) continue;
      if (value <= line) before = { element, line: value };
      else {
        after = { element, line: value };
        break;
      }
    }

    let target;
    if (!before) {
      target = 0;
    } else {
      const beforeTop = documentTop(before.element);
      if (!after || after.line === before.line) {
        target = beforeTop;
      } else {
        const ratio = (line - before.line) / (after.line - before.line);
        target = beforeTop + (documentTop(after.element) - beforeTop) * ratio;
      }
    }

    if (markAsSync) {
      syncingFromEditor = true;
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        syncingFromEditor = false;
      }, 200);
    }
    window.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
  }

  function documentTop(element) {
    return element.getBoundingClientRect().top + window.scrollY - 8;
  }

  let scrollPending = false;
  window.addEventListener(
    'scroll',
    () => {
      if (syncingFromEditor || !settings.scrollEditorWithPreview || scrollPending) return;
      scrollPending = true;
      window.requestAnimationFrame(() => {
        scrollPending = false;
        const line = topmostVisibleLine();
        if (line !== null) vscode.postMessage({ type: 'revealLine', line });
      });
    },
    { passive: true },
  );

  content.addEventListener('dblclick', (event) => {
    if (!settings.doubleClickToSwitchToEditor) return;
    const target = /** @type {HTMLElement | null} */ (event.target);
    const anchored = target && target.closest('[data-line]');
    if (!anchored) return;
    const line = lineOf(/** @type {HTMLElement} */ (anchored));
    if (line !== null) vscode.postMessage({ type: 'clickLine', line });
  });

  vscode.postMessage({ type: 'ready' });
})();
