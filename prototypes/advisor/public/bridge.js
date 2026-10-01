(() => {
  const hostOrigin = __HOST_ORIGIN__;
  let port, state = {}, pending = new Map(), sequence = 0, failed = false;
  const reportError = () => { failed = true; port?.postMessage({ type:'artifact-error' }); };
  window.addEventListener('error', reportError);
  window.addEventListener('unhandledrejection', reportError);
  window.addEventListener('message', event => {
    if (port || event.source !== parent || ![hostOrigin].flat().includes(event.origin) || event.data?.type !== 'banking:init' || !event.ports[0]) return;
    port = event.ports[0]; state = event.data.state || {};
    function theme(value) { document.documentElement.dataset.theme = value; window.dispatchEvent(new Event('banking:theme')); }
    theme(event.data.theme);
    const api = Object.freeze({
      context: Object.freeze(event.data.context),
      get state() { return structuredClone(state); },
      updateState(value) {
        if (!value || Array.isArray(value) || typeof value !== 'object' || JSON.stringify(value).length > 8000) return;
        state = structuredClone(value); port.postMessage({ type: 'state', state });
      },
      request(tool) { return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Request timed out.')); }, 3000);
        pending.set(id, { resolve, reject, timer }); port.postMessage({ type: 'tool', id, tool });
      }); }
    });
    Object.defineProperty(window, 'banking', { value: api, writable: false, configurable: false });
    port.onmessage = ({ data }) => {
      if (data?.type === 'theme') theme(data.theme);
      if (data?.type === 'result' && pending.has(data.id)) {
        const item = pending.get(data.id); clearTimeout(item.timer); pending.delete(data.id);
        data.error ? item.reject(new Error(data.error)) : item.resolve(data.value);
      }
    };
    port.start();
    const ready = () => {
      window.dispatchEvent(new Event('banking:ready')); port.postMessage({ type: 'ready' });
      if (failed) port.postMessage({ type:'artifact-error' });
      let scheduled = false;
      new ResizeObserver(() => {
        if (scheduled) return; scheduled = true;
        requestAnimationFrame(() => { scheduled = false; port.postMessage({ type:'resize', height:Math.ceil(document.body.getBoundingClientRect().height) }); });
      }).observe(document.body);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true }); else ready();
  });
})();
