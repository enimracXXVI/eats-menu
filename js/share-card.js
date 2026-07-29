// Builds the "share today's purchases" card and drives the actual share
// flow from the Today screen's share button. The same builder is reused
// unstyled-different by screens/shared.js for the live read-only page a
// shared link opens — one visual definition, two uses (an exported PNG,
// and a real DOM node someone actually visits).
import { el, fmtMoney, fmtTime, showToast } from "./dom.js";
import { api } from "./api.js";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// `isoDate` is "YYYY-MM-DD" — parsed as local midnight rather than handed
// to `new Date(isoDate)` directly, which JS treats as UTC midnight and can
// roll the displayed weekday/date back a day depending on the viewer's own
// timezone offset.
function fmtWeekdayDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAY_NAMES[date.getDay()]} · ${String(d).padStart(2, "0")} ${MONTH_NAMES[m - 1]} ${y}`;
}

export function buildShareCardNode({ display_name, date, purchases, settings }) {
  const spent = purchases.reduce((sum, p) => sum + p.price_paid, 0);

  // No per-item price and no allowance/remaining figures anywhere on this
  // card — this gets shared with people who have no business seeing what
  // someone's personal daily budget is. Just what was eaten, and when.
  const rows = purchases.length
    ? purchases.map((p) =>
        el("div", { className: "share-card__ticket-row" }, [
          el("span", { className: "share-card__ticket-row-name" }, p.item_name),
          el("span", { className: "share-card__ticket-row-meta u-tabular" }, `${fmtTime(p.timestamp)} · ${p.units}×`),
        ])
      )
    : [el("p", { className: "share-card__ticket-empty" }, "Nothing purchased that day.")];

  return el("div", { className: "share-card" }, [
    el("div", { className: "share-card__accent" }),
    el("div", { className: "share-card__body" }, [
      el("div", { className: "share-card__header" }, [
        el("img", { className: "share-card__logo", src: "assets/icons/logo.svg", alt: "eats" }),
        el("span", { className: "chip" }, display_name),
      ]),
      el("p", { className: "share-card__date" }, fmtWeekdayDate(date)),
      el("div", { className: "share-card__headline-block" }, [
        el("p", { className: "share-card__headline" }, "Purchased today"),
        el("div", { className: "share-card__headline-rule" }),
        el("p", { className: "share-card__subheadline" }, [
          el("strong", {}, `${purchases.length} item${purchases.length === 1 ? "" : "s"}`),
          ` · ${fmtMoney(spent, settings.currency)} total`,
        ]),
      ]),
      el("div", { className: "share-card__ticket" }, [
        el("div", { className: "share-card__ticket-rows" }, rows),
        // Decorative only — the perforation itself, spanning the ticket's
        // full height so its punched circles land on the ticket's real
        // top/bottom edges. Positioned so the row meta (time · qty) has
        // real room to sit past it, not the sliver a fixed side column left.
        el("div", { className: "share-card__ticket-perf" }),
      ]),
      el("div", { className: "share-card__footer" }, [el("div", { className: "share-card__footer-rule" }), "eats Tab"]),
    ]),
  ]);
}

// Loaded on demand, same reasoning as the barcode scanner's ZXing import —
// no build step and no dependency to install for the common case where
// nobody ever taps Share.
const HTML_TO_IMAGE_URL = "https://esm.sh/html-to-image@1";

let htmlToImagePromise = null;
function loadHtmlToImage() {
  if (!htmlToImagePromise) htmlToImagePromise = import(HTML_TO_IMAGE_URL);
  return htmlToImagePromise;
}

// html-to-image needs the node actually laid out in the document to
// measure it accurately — .share-card-stage parks it off-screen at a fixed
// width instead of hidden, so the capture always matches what the card
// looks like at its real intended size, regardless of the viewport this
// happens to run in.
async function renderCardToBlob(data) {
  const node = buildShareCardNode(data);
  const stage = el("div", { className: "share-card-stage" }, [node]);
  document.body.append(stage);
  try {
    const htmlToImage = await loadHtmlToImage();
    return await htmlToImage.toBlob(node, { pixelRatio: 2, cacheBust: true });
  } finally {
    stage.remove();
  }
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

// The whole "Share" button flow: renders the image, fetches the signed
// read-only link, then hands both to the OS share sheet. The link travels
// inside the shared text rather than Web Share's own `url` field — several
// mobile browsers silently drop `url` when a `files` payload is also
// present, but files+text together is reliably supported.
export async function shareToday({ user, purchases, settings }) {
  const date = todayIsoDate();

  let blob, link;
  try {
    [blob, link] = await Promise.all([
      renderCardToBlob({ display_name: user.display_name, date, purchases, settings }),
      api.getShareLink(user.user_id, date),
    ]);
  } catch {
    return; // api.js (or the image render) already reported why
  }

  const shareUrl = `${location.origin}${location.pathname}?shared=${link.token}`;
  const file = new File([blob], "eats-tab-today.png", { type: "image/png" });
  const text = `My eats Tab today — ${shareUrl}`;

  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
    } catch (err) {
      if (err && err.name !== "AbortError") showToast("Couldn't share.");
    }
    return;
  }

  // No Web Share (or no file support, e.g. most desktop browsers) — the
  // feature still has to work there, just as a download + a copied link
  // instead of the native share sheet.
  const objectUrl = URL.createObjectURL(blob);
  const downloadLink = el("a", { href: objectUrl, download: "eats-tab-today.png" }, []);
  document.body.append(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(objectUrl);

  try {
    await navigator.clipboard.writeText(shareUrl);
    showToast("Image downloaded, link copied");
  } catch {
    showToast("Image downloaded");
  }
}
