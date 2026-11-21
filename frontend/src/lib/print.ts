/**
 * Print a single element in isolation.
 *
 * `window.print()` on the whole page prints the entire app shell and, on iOS/PWA,
 * an Ionic modal keeps its content inside a shadow scroll container with a fixed
 * height — the result is a blank or truncated invoice. Instead we clone the target
 * into a same-origin iframe, copy the document's styles (and a <base> so font/asset
 * URLs resolve), lay the sheet out at A4 width, then print only that.
 */
export function printElement(el: HTMLElement, title = 'چاپ'): void {
  const clone = el.cloneNode(true) as HTMLElement;
  // Strip on-screen-only controls that were marked to hide when printing.
  clone.querySelectorAll('.print-hidden').forEach((node) => node.remove());

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('title', title);
  frame.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  const doc = win?.document;
  const cleanup = () => frame.remove();

  // Fallback if a sandboxed context blocks the iframe document.
  if (!win || !doc) {
    cleanup();
    window.print();
    return;
  }

  doc.open();
  doc.write(
    `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">` +
      `<base href="${document.baseURI || window.location.origin + '/'}"><title>${title}</title>` +
      `</head><body></body></html>`,
  );

  // Bring over the app stylesheet(s) and any injected <style> so Tailwind utilities apply.
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
    doc.head.appendChild(node.cloneNode(true));
  });

  doc.close();

  doc.body.style.cssText =
    'margin:0;background:#fff;color:#0f172a;' +
    "font-family:'Vazirmatn Variable','Vazirmatn',-apple-system,BlinkMacSystemFont,sans-serif;";
  const wrap = doc.createElement('div');
  wrap.style.cssText = 'box-sizing:border-box;width:794px;max-width:100%;margin:0 auto;padding:8mm 6mm;';
  wrap.appendChild(clone);
  doc.body.appendChild(wrap);

  const doPrint = () => {
    try {
      win.focus();
      win.print();
    } finally {
      // Keep the frame a moment longer so iOS/Safari can read its content, then remove it.
      window.setTimeout(cleanup, 1500);
    }
  };
  // Give stylesheets/fonts/images a beat to settle before opening the print dialog.
  if (doc.readyState === 'complete') window.setTimeout(doPrint, 350);
  else win.addEventListener('load', () => window.setTimeout(doPrint, 350), { once: true });
}

/** Print the invoice sheet rendered inside the open invoice-detail modal. */
export function printInvoiceSheet(): void {
  const scope = document.querySelector('.invoice-detail-modal') ?? document;
  const sheet = scope.querySelector('.invoice-print-sheet') as HTMLElement | null;
  if (!sheet) {
    window.print();
    return;
  }
  printElement(sheet, 'چاپ فاکتور');
}
