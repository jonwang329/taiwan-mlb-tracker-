(() => {
  function apply(node) {
    const text = String(node.textContent || '').trim();
    if (/^球隊(?:今日)?有賽/.test(text)) {
      const normalized = text.replace(/^球隊今日有賽\s*·?\s*/, '球隊有賽 ').replace(/^球隊有賽\s*·?\s*/, '球隊有賽 ');
      if (node.textContent !== normalized) node.textContent = normalized;
      node.style.color = '#68788b';
      node.style.opacity = '0.72';
      node.style.fontWeight = '600';
      return;
    }
    node.style.color = '';
    node.style.opacity = '';
    node.style.fontWeight = '';
  }

  function refresh() {
    document.querySelectorAll('.summary-today').forEach(apply);
  }

  const observer = new MutationObserver(refresh);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  refresh();
})();
