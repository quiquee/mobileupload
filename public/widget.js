/*
  MobileUpload widget
  Returns a single final object after mobile user presses "Terminar".
*/

(function (global) {
  const DOC_CONFIG = {
    passport: { label: 'Pasaporte', needsBothSides: false },
    dni: { label: 'DNI', needsBothSides: true },
    nie: { label: 'NIE', needsBothSides: true },
    driver: { label: 'Permiso de conducir', needsBothSides: true }
  };

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&family=Manrope:wght@400;500;600&display=swap');

    .mu-root, .mu-root * { box-sizing: border-box; }

    .mu-root {
      width: 100%;
      max-width: 760px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 18px;
      background: linear-gradient(180deg, #10141d, #0b1017);
      color: #e8ebf1;
      font-family: 'Manrope', sans-serif;
      padding: 20px;
      display: grid;
      grid-template-columns: 220px 1fr;
      gap: 18px;
    }

    .mu-left {
      border-right: 1px solid rgba(255, 255, 255, 0.08);
      padding-right: 18px;
    }

    .mu-brand {
      font-family: 'Outfit', sans-serif;
      color: #cfad63;
      font-size: 2rem;
      font-weight: 500;
      margin-bottom: 6px;
    }

    .mu-doc {
      color: #b7c0d2;
      font-size: 0.95rem;
      margin-bottom: 14px;
    }

    .mu-qr {
      background: #fff;
      padding: 8px;
      border-radius: 10px;
      width: fit-content;
      margin-bottom: 10px;
    }

    .mu-qr a {
      display: block;
      text-decoration: none;
      cursor: pointer;
    }

    .mu-status {
      color: #c3cbdb;
      font-size: 0.87rem;
      line-height: 1.4;
      min-height: 40px;
    }

    .mu-right {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .mu-slots {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .mu-slot {
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.02);
    }

    .mu-slot-label {
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      color: #d8deea;
      font-size: 0.82rem;
      padding: 8px 10px;
    }

    .mu-slot-body {
      aspect-ratio: 4 / 3;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #8d98af;
      font-size: 0.85rem;
      background: #0a0f16;
      overflow: hidden;
    }

    .mu-slot-body img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .mu-json {
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      background: rgba(0, 0, 0, 0.26);
      padding: 10px;
      display: none;
    }

    .mu-json h3 {
      font-family: 'Outfit', sans-serif;
      color: #cfad63;
      font-size: 0.92rem;
      margin-bottom: 8px;
      font-weight: 500;
    }

    .mu-json pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      color: #dfe5f1;
      font-size: 0.77rem;
      line-height: 1.35;
      max-height: 220px;
      overflow: auto;
    }

    @media (max-width: 820px) {
      .mu-root {
        grid-template-columns: 1fr;
      }
      .mu-left {
        border-right: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding-right: 0;
        padding-bottom: 14px;
      }
    }

    @media (max-width: 520px) {
      .mu-slots {
        grid-template-columns: 1fr;
      }
    }
  `;

  const MobileUpload = {
    init(containerId, options = {}) {
      const serverUrl = (options.serverUrl || '').replace(/\/$/, '');
      const docType = options.docType && DOC_CONFIG[options.docType] ? options.docType : 'dni';

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
    const cfg = DOC_CONFIG[docType];
    const needsBothSides = cfg.needsBothSides;

    fetch(`${serverUrl}/api/session`)
      .then((response) => response.json())
      .then(({ id, publicUrl }) => {
        const qrBase = (publicUrl || serverUrl).replace(/\/$/, '');
        const uploadUrl = `${qrBase}/upload?id=${id}&docType=${docType}&v=${Date.now().toString(36)}`;

        container.innerHTML = renderWidgetHtml({ id, docType, docLabel: cfg.label, needsBothSides });

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

        socket.on('mobile-connected', () => {
          const status = document.getElementById(`mu-status-${id}`);
          if (status) status.textContent = 'Movil conectado. Esperando envio de documento.';
        });

        socket.on('session-complete', (payload) => {
          const normalized = normalizeResult(payload, serverUrl, docType, id);
          fillSlots(id, normalized.photosBySlot, needsBothSides);
          fillJson(id, normalized.documentData);

          const status = document.getElementById(`mu-status-${id}`);
          if (status) status.textContent = 'Documento procesado correctamente.';

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

  function fillSlots(id, photosBySlot, needsBothSides) {
    const frontEl = document.getElementById(`mu-slot-front-${id}`);
    if (frontEl && photosBySlot.front) {
      frontEl.innerHTML = `<img src="${photosBySlot.front}" alt="Anverso" />`;
    }

    if (needsBothSides) {
      const backEl = document.getElementById(`mu-slot-back-${id}`);
      if (backEl && photosBySlot.back) {
        backEl.innerHTML = `<img src="${photosBySlot.back}" alt="Reverso" />`;
      }
    }
  }

  function fillJson(id, documentData) {
    const panel = document.getElementById(`mu-json-${id}`);
    const pre = document.getElementById(`mu-json-pre-${id}`);
    if (!panel || !pre || !documentData) return;

    pre.textContent = JSON.stringify(documentData, null, 2);
    panel.style.display = 'block';
  }

  function renderWidgetHtml({ id, docLabel, needsBothSides }) {
    const slots = needsBothSides
      ? `
        <div class="mu-slot">
          <div class="mu-slot-label">Anverso</div>
          <div class="mu-slot-body" id="mu-slot-front-${id}">Pendiente</div>
        </div>
        <div class="mu-slot">
          <div class="mu-slot-label">Reverso</div>
          <div class="mu-slot-body" id="mu-slot-back-${id}">Pendiente</div>
        </div>
      `
      : `
        <div class="mu-slot">
          <div class="mu-slot-label">Documento</div>
          <div class="mu-slot-body" id="mu-slot-front-${id}">Pendiente</div>
        </div>
      `;

    return `
      <section class="mu-root">
        <aside class="mu-left">
          <div class="mu-brand">VendeOro</div>
          <div class="mu-doc">${docLabel}</div>
          <div class="mu-qr" id="mu-qr-box-${id}"></div>
          <div class="mu-status" id="mu-status-${id}">Escanea el codigo QR para abrir la carga en el movil.</div>
        </aside>
        <section class="mu-right">
          <div class="mu-slots">${slots}</div>
          <div class="mu-json" id="mu-json-${id}">
            <h3>Datos extraidos</h3>
            <pre id="mu-json-pre-${id}"></pre>
          </div>
        </section>
      </section>
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
