const w = window as unknown as { __zeremInjected?: boolean };
if (!w.__zeremInjected) {
  w.__zeremInjected = true;

  function emit() {
    chrome.runtime
      .sendMessage({
        type: 'SIGNAL',
        url: window.location.href,
        title: document.title,
        domain: window.location.hostname.replace(/^www\./, ''),
        ts: Date.now(),
      })
      .catch(() => {});
  }

  emit();

  const _pushState = history.pushState;
  const _replaceState = history.replaceState;
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    _pushState.apply(this, args);
    setTimeout(emit, 300);
  };
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    _replaceState.apply(this, args);
    setTimeout(emit, 300);
  };
  window.addEventListener('popstate', () => setTimeout(emit, 300));

  const titleEl = document.querySelector('title');
  if (titleEl) {
    new MutationObserver(() => emit()).observe(titleEl, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  document.addEventListener('visibilitychange', () => {
    chrome.runtime
      .sendMessage({
        type: 'VISIBILITY',
        visible: document.visibilityState === 'visible',
        url: window.location.href,
        domain: window.location.hostname.replace(/^www\./, ''),
        ts: Date.now(),
      })
      .catch(() => {});
  });
}
