# MobileUpload

A tool that lets a mobile device send photos to a desktop browser in real time, using QR codes and WebSockets. Designed for use in local networks (e.g. a point-of-sale workstation where a clerk scans a QR code with their phone to attach photos to a transaction).

---

## How it works

1. The desktop page (or any page embedding `widget.js`) requests a unique session ID from the server and renders a QR code pointing to the upload URL.
2. The mobile user scans the QR code with their phone and opens the upload page in the browser.
3. The mobile page notifies the server that it is ready; the server relays this over a WebSocket to the desktop.
4. The user selects or photographs an image on the phone and taps **Send**.
5. The server saves the file and emits a `photo-ready` event to the desktop session; the desktop widget shows the photo immediately.
6. The mobile user can send additional photos in the same session.

---

## Project structure

```
mobileupload/
├── server.js          # Node.js / Express server
├── package.json
└── public/            # Static files served by the server
    ├── index.html     # Demo desktop page
    ├── widget.js      # Embeddable desktop widget (client library)
    ├── upload.html    # Mobile upload page
    └── uploads/       # Uploaded photos (auto-created at runtime)
```

---

## Server

**File:** `server.js`

**Runtime:** Node.js  
**Key dependencies:** Express 5, Socket.IO 4, Multer 2, uuid

### Responsibilities

- Serves all static files under `public/`.
- Manages upload sessions identified by a UUID.
- Persists uploaded images to `public/uploads/` on disk.
- Pushes real-time events to the desktop via WebSocket rooms (one room per session ID).

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/session` | Creates a new session. Returns `{ id: "<uuid>", publicUrl: "<url>" }`. |
| `GET` | `/api/config` | Exposes the public URL so the widget can build QR codes correctly. Returns `{ publicUrl: "<url>" }`. |
| `GET` | `/upload` | Serves the mobile upload page (`upload.html`). Uses no-cache headers so phones always receive the latest version. |
| `GET` | `/api/mobile-ready/:id` | Called by the mobile page on load. Emits `mobile-connected` to the desktop via Socket.IO. |
| `POST` | `/api/upload/:id` | Receives a photo (`multipart/form-data`, field `photo`) and an optional `slot` field (e.g., 'front' or 'back'). Saves it with a timestamped filename to avoid collisions. Emits `photo-ready` to the desktop. |

### Socket.IO events

| Direction | Event | Payload | Description |
|-----------|-------|---------|-------------|
| Client → Server | `join` | `id` (string) | Desktop widget joins the room for its session. |
| Server → Desktop | `mobile-connected` | — | Mobile has opened the upload page. |
| Server → Desktop | `photo-ready` | `{ url: string }` | A photo was uploaded; `url` is the public path under `/uploads/`. |

### Configuration

The server can be configured via environment variables or a `config.json` file in the project root. If the file is not present, environment variables are used. The `config.json` supports the following properties:
```json
{
  "port": 3456,
  "host": "0.0.0.0",
  "publicUrl": "http://192.168.1.100:3456"
}
```

Set these environment variables before starting the server (they take precedence over `config.json`):

| Variable | `config.json` Key | Default | Description |
|----------|-------------------|---------|-------------|
| `PORT` | `port` | `3456` | TCP port to listen on. |
| `HOST` | `host` | `'0.0.0.0'` | IP address to bind to. |
| `PUBLIC_URL` | `publicUrl` | `` `http://localhost:${PORT}` `` | The base URL accessible by phones to upload images. |

### Starting the server

```bash
npm install
node server.js
```

### File storage

Uploaded files are saved to `public/uploads/` with the naming pattern `<session-id>_<timestamp><ext>`. The directory is created automatically on first run. Files are not deleted automatically.

Upload size limit: **20 MB** per file.

---

## Client (frontend)

The frontend consists of three files, all served statically by the server.

### `public/widget.js` — Desktop widget (embeddable library)

This is the main integration point for host applications. It is a self-contained IIFE that exposes a single global: `MobileUpload`.

**Usage**

```html
<div id="my-uploader"></div>
<script src="http://<server>:3456/widget.js"></script>
<script>
  MobileUpload.init('my-uploader', { serverUrl: 'http://<server>:3456' })
    .then(urls => {
      // urls — array of absolute URLs of every photo received in this session
      console.log('Photos received:', urls);
    });
</script>
```

**What it does**

1. Dynamically loads `socket.io.js` and the QRCode library from a CDN.
2. Calls `GET /api/session` to obtain a session UUID.
3. Renders a styled card inside the target container with:
   - A QR code pointing to `/upload?id=<uuid>`.
   - A "waiting" indicator that activates once the mobile connects.
   - A photo gallery that fills in as photos arrive.
   - A photo counter.
4. Opens a Socket.IO connection and joins the session room.
5. On `photo-ready`, appends the new image to the gallery and resolves the promise with the current list of URLs. The promise resolves on every new photo (i.e. it resolves multiple times — each call to `.then()` receives the full array up to that point).

**Options**

| Option | Type | Description |
|--------|------|-------------|
| `serverUrl` | `string` | Base URL of the mobileupload server. No trailing slash. |

### `public/index.html` — Demo desktop page

A standalone demonstration page that embeds the widget. It reads the `docType` URL parameter (`?docType=dni|nie|driver|passport`):
- **If no `docType` is present**, it shows a selector menu with the available document types.
- **If a `docType` is given**, it launches the widget immediately in that specific mode requesting specific photos (e.g., 2 photos for front/back).

It initialises `MobileUpload` against `window.location.origin`, so it works out of the box when opened from the same server. Styled with the VendeOro dark-gold design language.

Open it in a desktop browser at `http://<server>:3456/`.

### `public/upload.html` — Mobile upload page

Opened on the user's phone by scanning the QR code. It uses query parameters such as the session `id` and `docType` to dictate the capture flow.

**Flow on the phone:**

1. On load, calls `GET /api/mobile-ready/:id` to signal the desktop.
2. Based on `docType`, an intro screen explains the requirements (e.g., 2 photos for DNI/NIE/Driver's License, or 1 photo for Passport) and displays an SVG mockup of the document snippet to guide the user.
3. Presents two buttons: **Cámara** (opens the device camera directly) and **Galería** (opens the photo gallery).
4. Shows a preview of the selected image, with an option to rotate the image.
5. **Send** button posts the image and an optional `slot` ('front'/'back') field to `POST /api/upload/:id`.
6. Handles a multi-step completion if the document type requires multiple photos. Displays a green confirmation screen when all required parts are successfully uploaded.

The page dynamically tracks the process and updates its step indicators.

---

## Embedding in another application

The widget is designed to be dropped into any web page on the same local network:

```html
<!-- 1. Add a container element -->
<div id="uploader"></div>

<!-- 2. Load the widget script from the mobileupload server -->
<script src="http://192.168.1.20:3456/widget.js"></script>

<!-- 3. Initialise and handle received photos -->
<script>
  MobileUpload.init('uploader', { serverUrl: 'http://192.168.1.20:3456' })
    .then(urls => {
      // called each time a new photo arrives
      const latest = urls[urls.length - 1];
      console.log('New photo URL:', latest);
    });
</script>
```

The host page must be able to reach the mobileupload server. Both the desktop browser and the mobile device must be on the same network (or the server must be publicly reachable).
