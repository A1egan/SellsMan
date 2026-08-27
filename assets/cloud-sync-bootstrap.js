(function(root) {
  'use strict';

  async function boot() {
    if (!root.CloudSync) return;
    const host = root.location && root.location.hostname ? root.location.hostname : '';
    const isLocalTest = host === '127.0.0.1' || host === 'localhost';
    if (isLocalTest) {
      await root.CloudSync.init();
      return;
    }
    try {
      const module = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      root.supabase = { createClient: module.createClient };
    } catch (error) {
      console.error('Cloud sync client failed to load', error);
    }
    await root.CloudSync.init();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : window);
