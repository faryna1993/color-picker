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
