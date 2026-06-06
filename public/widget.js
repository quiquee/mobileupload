/*
  mobileupload widget — VendeOro design
  Usage:
    <div id="mi-uploader"></div>
    <script src="http://servidor:3456/widget.js"></script>
    <script>
      MobileUpload.init('mi-uploader', { serverUrl: 'http://servidor:3456' })
        .then(urls => console.log('Fotos:', urls));
    </script>
*/

(function (global) {
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
      max-width: 380px;
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

    .mu-gallery {
      display: none;
      width: 100%;
      display: none;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-bottom: 12px;
    }

    .mu-photo-item {
      position: relative;
      width: calc(50% - 4px);
      aspect-ratio: 4/3;
      border-radius: 3px;
      overflow: hidden;
      border: 1px solid rgba(201,168,76,0.2);
      animation: mu-fadein 0.4s ease;
    }
    @keyframes mu-fadein { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }

    .mu-photo-item img {
      width: 100%; height: 100%; object-fit: cover; display: block;
    }
    .mu-photo-index {
      position: absolute; bottom: 4px; right: 6px;
      font-size: 0.5rem; letter-spacing: 0.15em;
      color: rgba(255,255,255,0.6);
      font-family: 'Montserrat', sans-serif;
    }

    .mu-counter {
      font-size: 0.55rem; letter-spacing: 0.3em; text-transform: uppercase;
      color: rgba(201,168,76,0.4); margin-bottom: 8px; text-align: center;
    }
    .mu-counter span { color: #c9a84c; }
  `;

  const MobileUpload = {
    init(containerId, options = {}) {
      const serverUrl = (options.serverUrl || '').replace(/\/$/, '');
      const container = document.getElementById(containerId);
      if (!container) throw new Error(`Elemento #${containerId} no encontrado`);

      const style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);

      return new Promise((resolve) => {
        loadScript(`${serverUrl}/socket.io/socket.io.js`, () => {
          loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', () => {
            start(container, serverUrl, resolve);
          });
        });
      });
    },
  };

  function start(container, serverUrl, resolve) {
    fetch(`${serverUrl}/api/session`)
      .then(r => r.json())
      .then(({ id }) => {
        const uploadUrl = `${serverUrl}/upload?id=${id}`;
        const photos = [];

        container.innerHTML = `
          <div class="mu-root">
            <div class="mu-ornament">
              <div class="mu-ornament-line"></div>
              <div class="mu-ornament-diamond"></div>
              <div class="mu-ornament-line r"></div>
            </div>
            <div class="mu-title">Fotografías</div>
            <div class="mu-subtitle">Envío desde dispositivo móvil</div>
            <div class="mu-qr-wrap" id="mu-qr-${id}"></div>
            <div class="mu-hint">Escanea con tu móvil para enviar fotos</div>
            <div class="mu-waiting">
              Esperando fotografía
              <span class="mu-dot">.</span><span class="mu-dot">.</span><span class="mu-dot">.</span>
            </div>
            <div class="mu-gallery" id="mu-gallery-${id}"></div>
            <div class="mu-counter" id="mu-counter-${id}" style="display:none">
              Fotos recibidas: <span>0</span>
            </div>
          </div>`;

        new QRCode(document.getElementById(`mu-qr-${id}`), {
          text: uploadUrl, width: 160, height: 160,
          colorDark: '#000000', colorLight: '#ffffff',
        });

        const socket = io(serverUrl);
        socket.emit('join', id);

        socket.on('mobile-connected', () => {
          container.querySelector('.mu-qr-wrap').classList.add('dimmed');
          container.querySelector('.mu-hint').style.display = 'none';
          container.querySelector('.mu-waiting').style.display = 'block';
        });

        socket.on('photo-ready', ({ url }) => {
          photos.push(`${serverUrl}${url}`);

          const qrWrap = container.querySelector('.mu-qr-wrap');
          const waiting = container.querySelector('.mu-waiting');
          const gallery = document.getElementById(`mu-gallery-${id}`);
          const counter = document.getElementById(`mu-counter-${id}`);
          const hint = container.querySelector('.mu-hint');

          qrWrap.classList.remove('dimmed');
          waiting.style.display = 'none';
          hint.textContent = 'Escanea para enviar más fotos';
          hint.style.display = 'block';

          // Show gallery
          gallery.style.display = 'flex';
          const item = document.createElement('div');
          item.className = 'mu-photo-item';
          item.innerHTML = `
            <img src="${serverUrl}${url}" alt="Foto ${photos.length}" />
            <span class="mu-photo-index">${photos.length}</span>`;
          gallery.appendChild(item);

          // Counter
          counter.style.display = 'block';
          counter.querySelector('span').textContent = photos.length;

          if (photos.length === 1) {
            // Insert divider before gallery on first photo
            const divider = document.createElement('div');
            divider.className = 'mu-divider';
            divider.innerHTML = `<div class="mu-divider-line"></div><div class="mu-divider-dot"></div><div class="mu-divider-line"></div>`;
            gallery.parentNode.insertBefore(divider, gallery);
          }

          resolve(photos);
        });
      });
  }

  function loadScript(src, cb) {
    const s = document.createElement('script');
    s.src = src;
    s.onload = cb;
    document.head.appendChild(s);
  }

  global.MobileUpload = MobileUpload;
})(window);
