function mountPickerEditor(params, preview, words, onLayout, selection) {
  const fonts = (params.get("fonts") || "").split(",").map(Number).filter(n => n > 0);
  const sendUnchanged = payload => payload;
  sendUnchanged.sync = () => {};
  if (!fonts.length || !params.get("session")) return sendUnchanged;

  const baseFont = Number(params.get("font").split("-").at(-1));
  let layout;
  try { layout = JSON.parse(params.get("layout") || "null"); } catch (_) { layout = null; }
  if (!Array.isArray(layout) || layout.length !== words.length) layout = null;
  let selected = 0;
  let drag;
  let localAll = words.length > 1;

  const panel = document.createElement("section");
  panel.className = "layout-controls";
  panel.innerHTML = `
    <div class="layout-row">
      <label>Шрифт <select aria-label="Номер шрифту"></select></label>
      <label>Розмір <input type="range" min="80" max="120" step="1"
        aria-label="Розмір слова"><output></output></label>
    </div>
    <div class="layout-words" aria-label="Вибір слова"></div>`;
  const style = document.createElement("style");
  style.textContent = `
    .layout-controls { margin:0 0 10px; padding:8px; border-radius:10px;
      background:var(--tg-theme-secondary-bg-color,#eee); font-size:14px; }
    .layout-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; }
    .layout-row label { display:flex; align-items:center; gap:6px; }
    .layout-row label:last-child { flex:1; }
    .layout-row input[type=range] { width:85px; flex:1; }
    .layout-row select,.layout-words button { border:1px solid #8888; border-radius:8px;
      min-height:30px; padding:3px 8px; font:inherit; color:inherit;
      background:var(--tg-theme-bg-color,#fff); }
    .layout-row output { min-width:4ch; text-align:right; }
    .layout-words { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
    .layout-words button[aria-pressed=true] { border-color:var(--tg-theme-button-color,#2481cc); }
    #preview .word.layout-draggable { touch-action:none; user-select:none; cursor:grab; }
    #preview .word.layout-dragging { z-index:2; cursor:grabbing; }
    #preview .word.layout-selected { outline:1px dashed var(--tg-theme-button-color,#2481cc); outline-offset:3px; }
  `;
  document.head.append(style);
  preview.after(panel);
  if (!selection && words.length > 1) {
    const label = document.createElement("label");
    const all = document.createElement("input");
    all.type = "checkbox";
    all.checked = localAll;
    label.append(all, " Усі слова разом");
    panel.prepend(label);
    all.addEventListener("change", () => { localAll = all.checked; sync(); });
    selection = {get: () => localAll ? words.map((_, i) => i) : [selected],
      select: i => { selected = i; localAll = false; all.checked = false; }};
  }
  const select = panel.querySelector("select");
  const slider = panel.querySelector("input[type=range]");
  const output = panel.querySelector("output");
  const nodes = [...preview.children];
  const targets = () => selection ? selection.get() : [selected];
  const chips = words.map((word, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = word;
    button.addEventListener("click", () => choose(i));
    panel.querySelector(".layout-words").append(button);
    return button;
  });
  panel.querySelector(".layout-words").hidden = words.length < 2;
  for (const number of fonts) select.add(new Option("№" + number, number));

  function sync() {
    const indexes = targets();
    const active = indexes.includes(selected) ? selected : indexes[0];
    select.value = layout?.[active]?.font_number ?? baseFont;
    slider.value = layout?.[active]?.size ?? 100;
    output.textContent = slider.value + "%";
    chips.forEach((chip, i) => {
      chip.setAttribute("aria-pressed", indexes.includes(i));
      nodes[i].classList.toggle("layout-selected", indexes.length === 1 && indexes[0] === i);
    });
  }

  function choose(i) {
    selected = i;
    selection?.select(i);
    sync();
  }

  function initialLayout() {
    return words.map((_, i) => ({
      font_number: baseFont, size: 100, x: 50, y: (i + 1) * 100 / (words.length + 1),
    }));
  }

  function publish(fontChanged = false) {
    params.set("layout", JSON.stringify(layout));
    sync();
    onLayout(fontChanged);
  }

  function change(key, value) {
    layout ??= initialLayout();
    for (const i of targets()) layout[i][key] = value;
    publish(key === "font_number");
  }
  select.addEventListener("change", () => change("font_number", Number(select.value)));
  slider.addEventListener("input", () => change("size", Number(slider.value)));

  nodes.forEach((node, i) => {
    node.classList.add("layout-draggable");
    node.addEventListener("pointerdown", event => {
      if (event.button !== 0 || drag) return;
      const indexes = targets();
      drag = {id: event.pointerId, x: event.clientX, y: event.clientY,
        indexes: indexes.length === words.length ? indexes : [i], dx: 0, dy: 0};
      node.setPointerCapture(event.pointerId);
    });
    node.addEventListener("pointermove", event => {
      if (drag?.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      drag.dx = dx;
      drag.dy = dy;
      for (const index of drag.indexes) {
        nodes[index].style.translate = dx + "px " + dy + "px";
        nodes[index].classList.add("layout-dragging");
      }
    });
    node.addEventListener("lostpointercapture", event => {
      if (drag?.id !== event.pointerId) return;
      const move = drag;
      drag = null;
      if (!move.moved) { choose(i); return; }
      layout ??= initialLayout();
      const width = Number(preview.dataset.layoutWidth) || preview.clientWidth;
      const height = Number(preview.dataset.layoutHeight) || preview.clientHeight;
      const limit = (axis, delta) => {
        const values = move.indexes.map(index => layout[index][axis]);
        return Math.max(-Math.min(...values), Math.min(100 - Math.max(...values), delta));
      };
      const dx = limit("x", move.dx * 100 / width);
      const dy = limit("y", move.dy * 100 / height);
      for (const index of move.indexes) {
        layout[index].x += dx;
        layout[index].y += dy;
        nodes[index].style.translate = "";
        nodes[index].classList.remove("layout-dragging");
      }
      if (move.indexes.length === 1) choose(i);
      publish();
    });
  });
  sync();
  const submit = payload => layout ? {
    ...payload, session: params.get("session"),
    words: layout.map(({font_number, size, x, y}) => ({
      font: font_number, size, x: +x.toFixed(2), y: +y.toFixed(2),
    })),
  } : payload;
  submit.sync = sync;
  return submit;
}

const pickerFontCache = new Map();

function loadPickerFont(id) {
  if (pickerFontCache.has(id)) return pickerFontCache.get(id);
  const pending = (async () => {
    for (const ext of ["ttf", "otf"]) {
      const url = "fonts/" + id + "." + ext;
      const family = "Picker-" + id;
      try {
        const face = await new FontFace(family, "url(" + url + ")").load();
        document.fonts.add(face);
      } catch (_) {
        continue;
      }
      let vector;
      if (window.opentype) {
        try {
          const response = await fetch(url);
          if (response.ok) vector = opentype.parse(await response.arrayBuffer());
        } catch (_) { /* Canvas can draw the loaded font. */ }
      }
      return {family, vector};
    }
    return {};
  })();
  pickerFontCache.set(id, pending);
  return pending;
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
      const {family, vector} = await loadPickerFont(id);
      if (family) loaded.set(id, family);
      if (vector) vectors.set(id, vector);
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
    preview.dataset.layoutWidth = width * fit;
    preview.dataset.layoutHeight = height * fit;
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
