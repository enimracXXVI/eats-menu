// Barcode scanning modal, shared by the login screen (scan-to-log-in) and
// the Admin "add user" form (attach a barcode to a new account). ZXing is
// pulled in on demand from esm.sh rather than vendored — this app has no
// build step and no dependencies to install, and the scanner is the only
// place that ever needs it.
import { openSheet, el } from "./dom.js";

const ZXING_URL = "https://esm.sh/@zxing/library@0.20.0";

let readerPromise = null;
function loadReader() {
  if (!readerPromise) {
    readerPromise = import(ZXING_URL).then((mod) => new mod.BrowserMultiFormatReader());
  }
  return readerPromise;
}

// Opens the shared bottom sheet with a live camera feed and decodes
// continuously until the first hit, then calls onDecode(text) and closes
// itself. The reader/camera stream is always torn down on close, however it
// closes (a decode, the backdrop, drag-dismiss, or back) — openSheet's
// onClose already covers all of those paths.
export function openBarcodeScanner({ onDecode }) {
  const video = el("video", { className: "scanner__video", autoplay: true, muted: true, playsinline: true }, []);
  const hint = el("p", { className: "scanner__hint" }, "Point the camera at a barcode");
  const body = el("div", { className: "scanner" }, [video, hint]);

  let stopped = false;
  let reader = null;
  let controls = null;

  // Two ZXing API shapes exist across versions: newer ones resolve
  // decodeFromConstraints with an IScannerControls (controls.stop()),
  // older ones expect reader.reset() instead. Handle whichever is present.
  function stopScanning() {
    if (controls && controls.stop) controls.stop();
    else if (reader && reader.reset) reader.reset();
  }

  const close = openSheet("Scan barcode", body, null, () => {
    stopped = true;
    stopScanning();
  });

  loadReader()
    .then((r) => {
      if (stopped) return null;
      reader = r;
      return reader.decodeFromConstraints({ video: { facingMode: "environment" } }, video, (result) => {
        if (stopped || !result) return;
        stopped = true;
        stopScanning();
        onDecode(result.getText());
        close();
      });
    })
    .then((maybeControls) => {
      if (maybeControls) controls = maybeControls;
    })
    .catch(() => {
      if (!stopped) hint.textContent = "Couldn't access the camera.";
    });

  return close;
}
