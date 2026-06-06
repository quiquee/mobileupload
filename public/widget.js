/*
  mobileupload widget — VendeOro design
  Usage:
    <div id="mi-uploader"></div>
    <script src="http://servidor:3456/widget.js"></script>
    <script>
      MobileUpload.init('mi-uploader', {
        serverUrl: 'http://servidor:3456',
        docType: 'dni'   // 'dni' | 'nie' | 'driver' | 'passport'
      }).then(urls => console.log('Fotos:', urls));
      // For passport: urls has 1 entry.
      // For dni/nie/driver: urls has 2 entries — [front, back].
      // The promise resolves only once all required photos are received.
    </script>
*/

(function (global) {

  // Doc-type configuration -------------------------------------------------
  // needsBothSides: whether two photos (front + back) are required
  const DOC_CONFIG = {
    passport: { label: 'Pasaporte',          needsBothSides: false },
    dni:      { label: 'DNI',                needsBothSides: true  },
    nie:      { label: 'NIE',                needsBothSides: true  },
    driver:   { label: 'Permiso de conducir', needsBothSides: true  },
  };

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=Montserrat:wght@200;300;400&display=swap');

    .mu-root *, .mu-root *::before, .mu-root *::after { box-sizing: border-box; }

    .mu-root {
      font-family: 'Montserrat', sans-serif;
      background: #0d0d0d;
      border: 1px solid rgba(201,168,76,0.18);
      border-radius: 4px;
      padding: 32px 28px;
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      min-width: 280px;
      max-width: 400px;
      width: 100%;
      position: relative;
      overflow: hidden;
    }

    .mu-root::before {
      content: '';
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse at 20% 0%, rgba(184,142,40,0.08) 0%, transparent 60%),
        radial-gradient(ellipse at 80% 100%, rgba(184,142,40,0.06) 0%, transparent 60%);
      pointer-events: none;
    }

    .mu-ornament {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 20px; opacity: 0.5; width: 100%;
    }
    .mu-ornament-line {
      flex: 1; height: 1px;
      background: linear-gradient(to right, transparent, #c9a84c);
    }
    .mu-ornament-line.r { background: linear-gradient(to left, transparent, #c9a84c); }
    .mu-ornament-diamond {
      width: 6px; height: 6px;
      border: 1px solid #c9a84c;
      transform: rotate(45deg); flex-shrink: 0;
    }

    .mu-title {
      font-family: 'Cormorant Garamond', serif;
      font-size: 1.4rem; font-weight: 300;
      letter-spacing: 0.15em;
      background: linear-gradient(135deg, #9a7a28 0%, #e8c96d 40%, #f5e090 55%, #c9a84c 100%);
      -webkit-background-clip: text; background-clip: text; color: transparent;
      margin-bottom: 4px; text-align: center;
    }

    .mu-subtitle {
      font-size: 0.55rem; font-weight: 200;
      letter-spacing: 0.4em; text-transform: uppercase;
      color: #7a6030; margin-bottom: 24px; text-align: center;
    }

    .mu-qr-wrap {
      background: #fff;
      padding: 10px; border-radius: 3px;
      margin-bottom: 16px;
      transition: opacity 0.4s;
    }
    .mu-qr-wrap a.mu-qr-link { display: inline-block; cursor: pointer; text-decoration: none; }
    .mu-qr-wrap.dimmed { opacity: 0.35; }

    .mu-hint {
      font-size: 0.58rem; font-weight: 300;
      letter-spacing: 0.2em; text-transform: uppercase;
      color: rgba(201,168,76,0.5);
      margin-bottom: 20px; text-align: center;
    }

    .mu-waiting {
      display: none;
      font-size: 0.65rem; font-weight: 300;
      letter-spacing: 0.25em; text-transform: uppercase;
      color: rgba(201,168,76,0.7);
      margin-bottom: 20px; text-align: center;
    }
    .mu-waiting .mu-dot {
      display: inline-block;
      animation: mu-blink 1.4s infinite;
    }
    .mu-waiting .mu-dot:nth-child(2) { animation-delay: 0.2s; }
    .mu-waiting .mu-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes mu-blink { 0%,80%,100%{opacity:0} 40%{opacity:1} }

    .mu-divider {
      display: flex; align-items: center; gap: 8px;
      width: 100%; margin-bottom: 16px; opacity: 0.3;
    }
    .mu-divider-line {
      flex: 1; height: 1px;
      background: rgba(201,168,76,0.4);
    }
    .mu-divider-dot {
      width: 3px; height: 3px; border-radius: 50%;
      background: #c9a84c;
    }

    /* Slot grid — 1 or 2 slots depending on docType */
    .mu-slots {
      display: flex;
      gap: 10px;
      width: 100%;
      margin-bottom: 12px;
    }

    .mu-slot {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .mu-slot-label {
      font-size: 0.5rem;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: rgba(201,168,76,0.5);
    }

    .mu-slot-box {
      width: 100%;
      aspect-ratio: 4/3;
      border: 1px dashed rgba(201,168,76,0.25);
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #111;
      position: relative;
      transition: border-color 0.3s;
    }
    .mu-slot-box.filled {
      border-color: rgba(201,168,76,0.55);
      border-style: solid;
    }
    .mu-slot-box.pending {
      border-color: rgba(201,168,76,0.18);
    }

    .mu-slot-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      color: rgba(201,168,76,0.2);
    }
    .mu-slot-placeholder svg { width: 24px; height: 24px; }
    .mu-slot-placeholder span {
      font-size: 0.45rem;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }

    .mu-slot-img {
      width: 100%; height: 100%;
      object-fit: cover; display: block;
      animation: mu-fadein 0.4s ease;
    }

    .mu-slot-tick {
      position: absolute; top: 4px; right: 5px;
      width: 14px; height: 14px;
      background: rgba(125,184,125,0.85);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }
    .mu-slot-tick svg { width: 8px; height: 8px; stroke: #fff; }

    @keyframes mu-fadein { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }

    .mu-progress {
      font-size: 0.52rem; letter-spacing: 0.3em; text-transform: uppercase;
      color: rgba(201,168,76,0.4); margin-bottom: 8px; text-align: center;
    }
    .mu-progress span { color: #c9a84c; }

    .mu-complete-badge {
      display: none;
      margin-top: 4px;
      font-size: 0.55rem; letter-spacing: 0.3em; text-transform: uppercase;
      color: #7db87d; text-align: center;
    }
  `;

  const MobileUpload = {
    /**
     * @param {string} containerId  — id of the host element
     * @param {object} options
     * @param {string} options.serverUrl — base URL of the mobileupload server
     * @param {string} [options.docType] — 'dni' | 'nie' | 'driver' | 'passport'
     *                                     defaults to 'dni'
     * @returns {Promise<string[]>} resolves with all photo URLs when the
     *          required number of photos has been received.
     *          passport → 1 URL; others → 2 URLs [front, back]
     */
    init(containerId, options = {}) {
      const serverUrl = (options.serverUrl || '').replace(/\/$/, '');
      const docType   = options.docType && DOC_CONFIG[options.docType]
        ? options.docType
        : 'dni';

      const container = document.getElementById(containerId);
      if (!container) throw new Error(`Elemento #${containerId} no encontrado`);

      const style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);

      return new Promise((resolve) => {
        loadScript(`${serverUrl}/socket.io/socket.io.js`, () => {
          loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', () => {
            start(container, serverUrl, docType, resolve);
          });
        });
      });
    },
  };

  function start(container, serverUrl, docType, resolve) {
    const cfg        = DOC_CONFIG[docType];
    const needsBoth  = cfg.needsBothSides;
    const totalSlots = needsBoth ? 2 : 1;

    fetch(`${serverUrl}/api/session`)
      .then(r => r.json())
      .then(({ id, publicUrl }) => {
        // publicUrl comes from config.json via the server; fall back to serverUrl
        // so the QR always points to the correct LAN address.
        const qrBase    = (publicUrl || serverUrl).replace(/\/$/, '');
        const cb        = Date.now().toString(36); // Cache buster
        const uploadUrl = `${qrBase}/upload?id=${id}&docType=${docType}&v=${cb}`;
        const photos    = [];   // accumulates received URLs in order

        // Build slot HTML
        const slotsHtml = needsBoth
          ? `<div class="mu-slots" id="mu-slots-${id}">
               <div class="mu-slot">
                 <div class="mu-slot-label">Anverso</div>
                 <div class="mu-slot-box pending" id="mu-slot-front-${id}">
                   <div class="mu-slot-placeholder">
                     ${ICON_CARD}
                     <span>Frente</span>
                   </div>
                 </div>
               </div>
               <div class="mu-slot">
                 <div class="mu-slot-label">Reverso</div>
                 <div class="mu-slot-box pending" id="mu-slot-back-${id}">
                   <div class="mu-slot-placeholder">
                     ${ICON_CARD}
                     <span>Reverso</span>
                   </div>
                 </div>
               </div>
             </div>`
          : `<div class="mu-slots" id="mu-slots-${id}">
               <div class="mu-slot">
                 <div class="mu-slot-label">Fotografía</div>
                 <div class="mu-slot-box pending" id="mu-slot-front-${id}">
                   <div class="mu-slot-placeholder">
                     ${ICON_CARD}
                     <span>Documento</span>
                   </div>
                 </div>
               </div>
             </div>`;

        container.innerHTML = `
          <div class="mu-root">
            <div class="mu-ornament">
              <div class="mu-ornament-line"></div>
              <div class="mu-ornament-diamond"></div>
              <div class="mu-ornament-line r"></div>
            </div>
            <div class="mu-title">${cfg.label}</div>
            <div class="mu-subtitle">Envío desde dispositivo móvil</div>
            <div class="mu-qr-wrap" id="mu-qr-${id}"></div>
            <div class="mu-hint">Escanea con tu móvil para enviar fotos</div>
            <div class="mu-waiting">
              Esperando fotografía
              <span class="mu-dot">.</span><span class="mu-dot">.</span><span class="mu-dot">.</span>
            </div>
            <div class="mu-divider" id="mu-divider-${id}" style="display:none">
              <div class="mu-divider-line"></div>
              <div class="mu-divider-dot"></div>
              <div class="mu-divider-line"></div>
            </div>
            ${slotsHtml}
            <div class="mu-progress" id="mu-progress-${id}" style="display:none">
              Fotos recibidas: <span>0</span> / ${totalSlots}
            </div>
            <div class="mu-complete-badge" id="mu-complete-${id}">
              ✓ Documento completo
            </div>
          </div>`;

        new QRCode(document.getElementById(`mu-qr-${id}`), {
          text: uploadUrl, width: 160, height: 160,
          colorDark: '#000000', colorLight: '#ffffff',
        });

        // Make the generated QR clickable: wrap its contents in an anchor
        (function makeQrClickable() {
          const qrContainer = document.getElementById(`mu-qr-${id}`);
          if (!qrContainer) return;
          // Create link pointing to the same upload URL shown in the QR
          const link = document.createElement('a');
          link.href = uploadUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.className = 'mu-qr-link';
          link.setAttribute('aria-label', 'Abrir URL de subida');
          link.style.display = 'inline-block';
          link.style.cursor = 'pointer';

          // Move the existing QR children into the anchor
          while (qrContainer.firstChild) {
            link.appendChild(qrContainer.firstChild);
          }
          qrContainer.appendChild(link);
        })();

        const socket = io(serverUrl);
        socket.emit('join', id);

        socket.on('mobile-connected', () => {
          container.querySelector('.mu-qr-wrap').classList.add('dimmed');
          container.querySelector('.mu-hint').style.display = 'none';
          container.querySelector('.mu-waiting').style.display = 'block';
        });

        socket.on('photo-ready', ({ url, slot }) => {
          // slot is 'front' or 'back' (sent by upload.html via metadata)
          // fall back to index order if not provided
          const slotKey  = slot || (photos.length === 0 ? 'front' : 'back');
          const absUrl   = `${serverUrl}${url}`;
          photos.push(absUrl);

          // Update UI
          const divider  = document.getElementById(`mu-divider-${id}`);
          const progress = document.getElementById(`mu-progress-${id}`);
          const waiting  = container.querySelector('.mu-waiting');
          const qrWrap   = container.querySelector('.mu-qr-wrap');
          const hint     = container.querySelector('.mu-hint');

          waiting.style.display = 'none';
          divider.style.display = 'flex';
          progress.style.display = 'block';
          progress.querySelector('span').textContent = photos.length;

          // Fill the slot thumbnail
          const slotBoxId = slotKey === 'back'
            ? `mu-slot-back-${id}`
            : `mu-slot-front-${id}`;
          const slotBox = document.getElementById(slotBoxId);
          if (slotBox) {
            slotBox.classList.remove('pending');
            slotBox.classList.add('filled');
            slotBox.innerHTML = `
              <img class="mu-slot-img" src="${absUrl}" alt="${slotKey}" />
              <div class="mu-slot-tick">
                <svg fill="none" viewBox="0 0 10 10" stroke="currentColor">
                  <polyline points="2,5 4,7.5 8,3" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>`;
          }

          const done = photos.length >= totalSlots;

          if (done) {
            // All required photos received — hide QR, show completion
            qrWrap.style.display = 'none';
            hint.style.display = 'none';
            document.getElementById(`mu-complete-${id}`).style.display = 'block';
            resolve(photos);
          } else {
            // Still waiting for more — update QR hint
            qrWrap.classList.remove('dimmed');
            hint.style.display = 'block';
            hint.textContent = needsBoth
              ? 'Escanea de nuevo para enviar el reverso'
              : 'Escanea para enviar más fotos';
          }
        });
      });
  }

  // Small card icon used in empty slots
  const ICON_CARD = `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
    <rect x="2" y="5" width="20" height="14" rx="2"/>
    <line x1="2" y1="10" x2="22" y2="10"/>
    <line x1="6" y1="15" x2="10" y2="15"/>
  </svg>`;

  function loadScript(src, cb) {
    const s = document.createElement('script');
    s.src = src;
    s.onload = cb;
    document.head.appendChild(s);
  }

  global.MobileUpload = MobileUpload;
})(window);
