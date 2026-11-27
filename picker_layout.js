function mountPickerEditor(params, preview, onLayout) {
  let changes;
  if (!params.get("fonts") || !params.get("session")) return payload => payload;

  const open = document.createElement("button");
  open.type = "button";
  open.textContent = "Налаштувати макет";
  open.style.cssText = "width:100%;padding:10px;margin:0 0 10px;border:0;border-radius:10px;font:inherit;color:inherit;background:var(--tg-theme-secondary-bg-color,#eee)";
  preview.after(open);

  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", "Редактор макета");
  dialog.style.cssText = "position:fixed;inset:0;margin:0;width:100%;height:100%;max-width:none;max-height:none;padding:0;border:0;background:var(--tg-theme-bg-color,#fff)";
  const frame = document.createElement("iframe");
  frame.title = "Редактор макета";
  frame.style.cssText = "display:block;width:100%;height:100%;border:0";
  dialog.append(frame);
  document.body.append(dialog);

  open.addEventListener("click", () => {
    const font = params.get("font");
    const query = new URLSearchParams({
      text: params.get("text"),
      mode: font.replace(/-\d+$/, ""),
      font: font.split("-").at(-1),
      fonts: params.get("fonts"),
      layout: params.get("layout") || "[]",
      embedded: "1",
      v: "4",
    });
    frame.src = "layout_editor.html?" + query;
    dialog.showModal();
  });

  window.addEventListener("message", event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || !dialog.open) return;
    if (event.data?.type === "layout-cancel") {
      dialog.close();
    } else if (event.data?.type === "layout-apply" && Array.isArray(event.data.words)) {
      changes = event.data.words;
      params.set("layout", JSON.stringify(changes.map(({font, ...item}) => ({
        ...item, font_number: font,
      }))));
      dialog.close();
      onLayout();
    }
  });
  return payload => changes ? {...payload, words: changes, session: params.get("session")} : payload;
}

function createPickerLayout(params, words, baseFont, preview) {
  let items;
  try { items = JSON.parse(params.get("layout") || "null"); } catch (_) { items = null; }
  const layout = Array.isArray(items) && items.length === words.length && items.every(item =>
    item && Number.isInteger(item.font_number) && item.font_number > 0
    && Number.isFinite(item.x) && Number.isFinite(item.y)
    && (item.size == null || (Number.isFinite(item.size) && item.size >= 50 && item.size <= 200))
  ) ? items : null;
  const mode = baseFont.replace(/-\d+$/, "");
  const ids = words.map((_, i) => layout ? mode + "-" + layout[i].font_number : baseFont);
  const scales = words.map((_, i) => layout ? (layout[i].size ?? 100) / 100 : 1);
  const loaded = new Map();
  const vectors = new Map();

  async function load() {
    await Promise.all([...new Set(ids)].filter(Boolean).map(async id => {
      for (const ext of ["ttf", "otf"]) {
        const url = "fonts/" + id + "." + ext;
        try {
          const family = "Picker-" + id;
          const face = await new FontFace(family, "url(" + url + ")").load();
          document.fonts.add(face);
          loaded.set(id, family);
          if (window.opentype) {
            const response = await fetch(url);
            if (response.ok) vectors.set(id, opentype.parse(await response.arrayBuffer()));
          }
          return;
        } catch (_) {
          if (loaded.has(id)) return;
        }
      }
    }));
  }

  function family(i) {
    const name = loaded.get(ids[i]);
    return name ? '"' + name + '", cursive' : '"Lobster", "Brush Script MT", cursive, system-ui';
  }

  function arrange(nodes, naturalWidth) {
    if (!layout || !naturalWidth) return;
    const width = naturalWidth * 1.25;
    const height = width / 1.75;
    const points = layout.map(item => ({x: item.x * width / 100, y: item.y * height / 100}));
    const left = Math.min(0, ...nodes.map((node, i) => points[i].x - node.offsetWidth / 2));
    const right = Math.max(width, ...nodes.map((node, i) => points[i].x + node.offsetWidth / 2));
    const top = Math.min(0, ...nodes.map((node, i) => points[i].y - node.offsetHeight / 2));
    const bottom = Math.max(height, ...nodes.map((node, i) => points[i].y + node.offsetHeight / 2));
    const fit = Math.min(1, (preview.clientWidth - 32) / (right - left));
    const xOffset = (preview.clientWidth - (right - left) * fit) / 2;
    preview.style.position = "relative";
    preview.style.height = (bottom - top) * fit + 32 + "px";
    nodes.forEach((node, i) => {
      node.style.position = "absolute";
      node.style.left = xOffset + (points[i].x - left) * fit + "px";
      node.style.top = 16 + (points[i].y - top) * fit + "px";
      node.style.transform = "translate(-50%, -50%) scale(" + fit + ")";
    });
  }

  function vector(i) {
    const font = vectors.get(ids[i]);
    return font && [...words[i]].every(char => font.charToGlyphIndex(char)) ? font : null;
  }

  return {scales, load, family, hasFont: i => loaded.has(ids[i]), vector, arrange};
}
