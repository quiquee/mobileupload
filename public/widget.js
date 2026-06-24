/*
  MobileUpload widget
  Returns a single final object after mobile user presses "Terminar".
*/

(function (global) {
  const VALID_DOC_TYPES = ['passport', 'dni', 'nie', 'driver'];

  const CSS = `
    .mu-root, .mu-root * { box-sizing: border-box; }

    .mu-root {
      display: flex;
      justify-content: center;
    }

    .mu-qr {
      background: #fff;
      padding: 8px;
      border-radius: 10px;
      width: fit-content;
    }

    .mu-qr a {
      display: block;
      text-decoration: none;
      cursor: pointer;
    }
  `;

  const MobileUpload = {
    init(containerId, options = {}) {
      const serverUrl = (options.serverUrl || '').replace(/\/$/, '');
      const docType = VALID_DOC_TYPES.includes(options.docType) ? options.docType : 'dni';

      const container = document.getElementById(containerId);
      if (!container) throw new Error(`Elemento #${containerId} no encontrado`);

      ensureStyle();

      return new Promise((resolve, reject) => {
        loadScript(`${serverUrl}/socket.io/socket.io.js`, () => {
          loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', () => {
            startSession(container, serverUrl, docType, resolve, reject);
          });
        });
      });
    }
  };

  function startSession(container, serverUrl, docType, resolve, reject) {
    fetch(`${serverUrl}/api/session`)
      .then((response) => response.json())
      .then(({ id, publicUrl }) => {
        const qrBase = (publicUrl || serverUrl).replace(/\/$/, '');
        const uploadUrl = `${qrBase}/upload?id=${id}&docType=${docType}&v=${Date.now().toString(36)}`;

        container.innerHTML = renderWidgetHtml({ id });

        new QRCode(document.getElementById(`mu-qr-box-${id}`), {
          text: uploadUrl,
          width: 180,
          height: 180,
          colorDark: '#000000',
          colorLight: '#ffffff'
        });

        makeQrClickable(id, uploadUrl);

        const socket = io(serverUrl);
        let settled = false;

        socket.emit('join', id);

        socket.on('session-complete', (payload) => {
          console.log('[MobileUpload] session-complete payload', payload);
          const normalized = normalizeResult(payload, serverUrl, docType, id);
          console.log('[MobileUpload] resolved result', normalized);

          if (!settled) {
            settled = true;
            resolve(normalized);
          }
        });

        socket.on('connect_error', () => {
          if (!settled) {
            settled = true;
            reject(new Error('No se pudo conectar al socket del servidor.'));
          }
        });
      })
      .catch((error) => {
        reject(error);
      });
  }

  function normalizeResult(payload, serverUrl, fallbackDocType, id) {
    const photos = payload && payload.photos ? payload.photos : {};
    const front = photos.front ? absoluteUrl(serverUrl, photos.front) : null;
    const back = photos.back ? absoluteUrl(serverUrl, photos.back) : null;
    const photoUrls = [front, back].filter(Boolean);

    return {
      id: (payload && payload.id) || id,
      docType: (payload && payload.docType) || fallbackDocType,
      photos: photoUrls,
      photosBySlot: { front, back },
      documentData: payload && payload.documentData ? payload.documentData : null
    };
  }

  function absoluteUrl(serverUrl, relativeOrAbsolute) {
    if (!relativeOrAbsolute) return null;
    if (/^https?:\/\//i.test(relativeOrAbsolute)) return relativeOrAbsolute;
    return `${serverUrl}${relativeOrAbsolute}`;
  }

  function renderWidgetHtml({ id }) {
    return `
      <div class="mu-root">
        <div class="mu-qr" id="mu-qr-box-${id}"></div>
      </div>
    `;
  }

  function makeQrClickable(id, uploadUrl) {
    const container = document.getElementById(`mu-qr-box-${id}`);
    if (!container) return;

    const link = document.createElement('a');
    link.href = uploadUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    while (container.firstChild) {
      link.appendChild(container.firstChild);
    }

    container.appendChild(link);
  }

  function ensureStyle() {
    if (document.getElementById('mu-widget-style')) return;
    const style = document.createElement('style');
    style.id = 'mu-widget-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function loadScript(src, callback) {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (typeof callback === 'function') callback();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.onload = callback;
    document.head.appendChild(script);
  }

  global.MobileUpload = MobileUpload;
})(window);
