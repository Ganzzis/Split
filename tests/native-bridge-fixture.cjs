module.exports = function installBridge({ platform = 'android' } = {}) {
   if (platform === 'ios') window.webkit = {messageHandlers:{bridge:{}}}; else window.androidBridge = {};
   window.calls = []; window.listeners = {}; window.prefs = {}; window.exportedJSON = null;
   const methods = {
    SplitChrome: ['setState','presentSheet','addListener','removeListener'], Share: ['share'], Filesystem: ['readdir', 'writeFile', 'getUri', 'deleteFile'], Preferences: ['get', 'set'], Haptics: ['impact'],
    Keyboard: ['hide', 'addListener', 'removeListener'], App: ['addListener', 'removeListener', 'exitApp'], Dialog: ['alert', 'confirm'], SplitDocuments: ['exportJSON', 'importJSON']
   };
   window.Capacitor = {
    isNativePlatform: () => true,
    PluginHeaders: Object.entries(methods).map(([name, list]) => ({ name, methods: list.map(name => ({ name, rtype: name === 'addListener' ? 'callback' : 'promise' })) })),
    nativeCallback(plugin, method, data, callback) { window.listeners[plugin + '.' + data.eventName] = callback; return 'listener'; },
    async nativePromise(plugin, method, data = {}) {
     window.calls.push({ plugin, method, data });
     if (plugin === 'SplitChrome') { if (method === 'setState') { window.chromeState = data; return {tabsHidden:!!data.modal}; } if (method === 'presentSheet') return window.deferSheet ? new Promise(resolve => window.resolveSheet = resolve) : (window.sheetResponse || {confirmed:false,value:''}); }
     if (plugin === 'Preferences') {
      if (method === 'get') return { value: window.prefs[data.key] ?? null };
      window.prefs[data.key] = data.value; return {};
     }
     if (plugin === 'Filesystem') {
      if (method === 'readdir') return { files: [] };
      if (method === 'getUri') return { uri: 'file://cache/' + data.path };
     }
     if (plugin === 'SplitDocuments') {
      if (method === 'exportJSON') { window.exportedJSON = data.raw; return { saved: true }; }
      return window.importCancelled ? { cancelled: true } : { raw: window.exportedJSON };
     }
     if (plugin === 'Dialog') return { value: false };
     return {};
    }
   };

};
