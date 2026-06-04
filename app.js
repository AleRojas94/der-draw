/**
 * ERFlow — Herramienta de Diagramas Entidad-Relación (Crow's Foot)
 * Versión 2 — Relaciones reales con cardinalidades independientes por extremo.
 */

/* ─────────────────────────────────────────────
   UTILIDADES
───────────────────────────────────────────── */
function uid() { return '_' + Math.random().toString(36).slice(2, 10); }

function domToSVGPoint(svgEl, clientX, clientY) {
  const pt = svgEl.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(svgEl.getScreenCTM().inverse());
}

function clearPopovers() {
  document.querySelectorAll('.attr-popover').forEach(el => el.remove());
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/* ─────────────────────────────────────────────
   CLASE: Attribute
───────────────────────────────────────────── */
class Attribute {
  constructor(name = 'atributo', pk = false, fk = false, nn = false) {
    this.id = uid(); this.name = name; this.pk = pk; this.fk = fk; this.nn = nn;
  }
  toJSON() { return { id: this.id, name: this.name, pk: this.pk, fk: this.fk, nn: this.nn }; }
  static fromJSON(d) { const a = new Attribute(d.name, d.pk, d.fk, d.nn); a.id = d.id; return a; }
}

/* ─────────────────────────────────────────────
   CLASE: Entity
───────────────────────────────────────────── */
class Entity {
  constructor(name = 'ENTIDAD', x = 100, y = 100) {
    this.id = uid(); this.name = name; this.x = x; this.y = y;
    this.attributes = []; this.width = 200; this.headerH = 38; this.attrH = 26; this.footerH = 28;
  }
  get height() { return this.headerH + this.attributes.length * this.attrH + this.footerH; }
  addAttribute(attr)  { this.attributes.push(attr); }
  removeAttribute(id) { this.attributes = this.attributes.filter(a => a.id !== id); }
  getPorts() {
    const cx = this.x + this.width / 2, cy = this.y + this.height / 2;
    return {
      top:    { x: cx,                  y: this.y,                  side: 'top'    },
      bottom: { x: cx,                  y: this.y + this.height,    side: 'bottom' },
      left:   { x: this.x,              y: cy,                      side: 'left'   },
      right:  { x: this.x + this.width, y: cy,                      side: 'right'  },
    };
  }
  getNearestPort(point) {
    let nearest = null, minDist = Infinity;
    for (const port of Object.values(this.getPorts())) {
      const d = Math.hypot(port.x - point.x, port.y - point.y);
      if (d < minDist) { minDist = d; nearest = port; }
    }
    return nearest;
  }
  toJSON() {
    return { id: this.id, name: this.name, x: this.x, y: this.y,
             attributes: this.attributes.map(a => a.toJSON()) };
  }
  static fromJSON(d) {
    const e = new Entity(d.name, d.x, d.y);
    e.id = d.id;
    e.attributes = (d.attributes || []).map(a => Attribute.fromJSON(a));
    return e;
  }
}

/* ─────────────────────────────────────────────
   CLASE: Relationship
───────────────────────────────────────────── */
class Relationship {
  constructor(fromId, toId, cardFrom = '1', cardTo = '0..N', label = '') {
    this.id = uid(); this.fromId = fromId; this.toId = toId;
    this.cardFrom = cardFrom; this.cardTo = cardTo; this.label = label;
  }
  static cardToType(card) {
    const map = { '1': 'one', '0..1': 'zero_one', '1..N': 'one_many', '0..N': 'zero_many' };
    return map[card] || 'one';
  }
  toJSON() {
    return { id: this.id, fromId: this.fromId, toId: this.toId,
             cardFrom: this.cardFrom, cardTo: this.cardTo, label: this.label };
  }
  static fromJSON(d) {
    let cardFrom = d.cardFrom, cardTo = d.cardTo;
    if (!cardFrom || !cardTo) {
      const m = { '1:1':{f:'1',t:'1'}, '1:N':{f:'1',t:'0..N'}, 'N:1':{f:'0..N',t:'1'}, 'N:M':{f:'0..N',t:'0..N'} };
      const lg = m[d.cardinality] || {f:'1',t:'0..N'};
      cardFrom = lg.f; cardTo = lg.t;
    }
    const r = new Relationship(d.fromId, d.toId, cardFrom, cardTo, d.label || '');
    r.id = d.id; return r;
  }
}

/* ─────────────────────────────────────────────
   CLASE: Diagram
───────────────────────────────────────────── */
class Diagram {
  constructor() { this.entities = []; this.relationships = []; }
  addEntity(e)       { this.entities.push(e); return e; }
  getEntity(id)      { return this.entities.find(e => e.id === id) || null; }
  addRelationship(r) { this.relationships.push(r); return r; }
  removeEntity(id) {
    this.entities      = this.entities.filter(e => e.id !== id);
    this.relationships = this.relationships.filter(r => r.fromId !== id && r.toId !== id);
  }
  removeRelationship(id) { this.relationships = this.relationships.filter(r => r.id !== id); }
  toJSON() {
    return { version: '2.0',
             entities:      this.entities.map(e => e.toJSON()),
             relationships: this.relationships.map(r => r.toJSON()) };
  }
  static fromJSON(d) {
    const diag = new Diagram();
    diag.entities      = (d.entities      || []).map(e => Entity.fromJSON(e));
    diag.relationships = (d.relationships || []).map(r => Relationship.fromJSON(r));
    return diag;
  }
}

/* ─────────────────────────────────────────────
   CLASE: CrowsFootRenderer

   Convención única y consistente:
   ─────────────────────────────────────────────
   • `port`   = punto donde la línea toca la entidad.
   • `anchor` = punto opuesto al port desde donde viene la línea.
                Siempre debe ser el port DEL OTRO EXTREMO de la relación.

   • angle = atan2(port - anchor)
             → apunta desde anchor HACIA port (hacia la entidad).
   • dx = cos(angle), dy = sin(angle)
             → vector unitario que apunta HACIA la entidad.

   • Para moverse desde port HACIA el interior de la línea (alejarse de la entidad):
             punto = { x: port.x - dx*d,  y: port.y - dy*d }
             Con d > 0 el punto se aleja del borde de la entidad.

   • Perpendicular al eje de la línea:
             vector perp = (-dy, dx)   [rotación 90° antihoraria de (dx,dy)]
───────────────────────────────────────────── */
class CrowsFootRenderer {
  static draw(group, type, port, anchor, cssClass = 'cf-mark') {
    const angle = Math.atan2(port.y - anchor.y, port.x - anchor.x);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    const TICK       = 7;
    const CROW_BASE  = 12;
    const BAR_OFFSET = 26;
    const CIR_OFFSET = 28;

    const mk = (tag, attrs) => {
      const el = svgEl(tag, attrs);
      el.classList.add('cf-mark');
      if (cssClass !== 'cf-mark') el.classList.add(cssClass);
      group.appendChild(el);
      return el;
    };

    // Punto a distancia d desde el port, alejándose de la entidad (hacia la línea)
    const inward = (d) => ({ x: port.x - dx * d, y: port.y - dy * d });

    // Barra perpendicular al eje centrada en origin, semiancho half
    const perp = (origin, half) => ({
      x1: origin.x + (-dy) * half, y1: origin.y + dx * half,
      x2: origin.x - (-dy) * half, y2: origin.y - dx * half,
    });

    if (type === 'one') {
      // ──||──  dos barras
      const pp1 = perp(inward(BAR_OFFSET - 12), TICK);
      mk('line', { x1: pp1.x1, y1: pp1.y1, x2: pp1.x2, y2: pp1.y2 });
      const pp2 = perp(inward(BAR_OFFSET), TICK);
      mk('line', { x1: pp2.x1, y1: pp2.y1, x2: pp2.x2, y2: pp2.y2 });
    }
    else if (type === 'zero_one') {
      // ──o|──  barra + círculo
      const pp = perp(inward(BAR_OFFSET - 12), TICK);
      mk('line', { x1: pp.x1, y1: pp.y1, x2: pp.x2, y2: pp.y2 });
      const cp = inward(CIR_OFFSET);
      mk('circle', { cx: cp.x, cy: cp.y, r: 5 });
    }
    else if (type === 'one_many') {
      // ──|──<  barra + pata con punta hacia la línea
      // La punta (tip) está a CROW_BASE px del port, hacia la línea.
      // Los tres extremos abiertos de la pata parten del port y sus lados.
      const tip = inward(CROW_BASE);
      mk('line', { x1: port.x,              y1: port.y,             x2: tip.x, y2: tip.y });
      mk('line', { x1: port.x + (-dy)*TICK, y1: port.y + dx*TICK,  x2: tip.x, y2: tip.y });
      mk('line', { x1: port.x - (-dy)*TICK, y1: port.y - dx*TICK,  x2: tip.x, y2: tip.y });
      const pp = perp(inward(BAR_OFFSET), TICK);
      mk('line', { x1: pp.x1, y1: pp.y1, x2: pp.x2, y2: pp.y2 });
    }
    else if (type === 'zero_many') {
      // ──o──<  círculo + pata con punta hacia la línea
      const tip = inward(CROW_BASE);
      mk('line', { x1: port.x,              y1: port.y,             x2: tip.x, y2: tip.y });
      mk('line', { x1: port.x + (-dy)*TICK, y1: port.y + dx*TICK,  x2: tip.x, y2: tip.y });
      mk('line', { x1: port.x - (-dy)*TICK, y1: port.y - dx*TICK,  x2: tip.x, y2: tip.y });
      const cp = inward(CIR_OFFSET);
      mk('circle', { cx: cp.x, cy: cp.y, r: 5 });
    }
  }
}

/* ─────────────────────────────────────────────
   CLASE: SVGEntityRenderer
───────────────────────────────────────────── */
class SVGEntityRenderer {
  static render(entity, app) {
    const g  = svgEl('g');
    g.setAttribute('class', 'entity-group');
    g.setAttribute('data-id', entity.id);
    g.setAttribute('transform', `translate(${entity.x}, ${entity.y})`);

    const W = entity.width, HH = entity.headerH, AH = entity.attrH;

    g.appendChild(svgEl('rect', { class: 'entity-box', width: W, height: entity.height, rx: 8 }));
    g.appendChild(svgEl('rect', { class: 'entity-header', width: W, height: HH, rx: 8 }));
    g.appendChild(svgEl('rect', { class: 'entity-header', y: HH / 2, width: W, height: HH / 2 }));

    const title = svgEl('text', { class: 'entity-title', x: W/2, y: HH/2,
      'dominant-baseline': 'middle', 'text-anchor': 'middle' });
    title.textContent = entity.name;
    title.style.cursor = 'text';
    title.addEventListener('dblclick', (e) => { e.stopPropagation(); app.startInlineEditTitle(entity, title, g); });
    g.appendChild(title);

    g.appendChild(svgEl('line', { class: 'attr-sep', x1: 0, y1: HH, x2: W, y2: HH }));
    entity.attributes.forEach((attr, i) => g.appendChild(SVGEntityRenderer._attrRow(attr, entity, i, app)));

    const addY = HH + entity.attributes.length * AH;
    const addGrp = svgEl('g', { class: 'add-attr-btn' });
    const addBg  = svgEl('rect', { x: 0, y: addY, width: W, height: entity.footerH, rx: 8 });
    addBg.style.fill = 'transparent';
    addGrp.appendChild(addBg);
    const addTxt = svgEl('text', { x: W/2, y: addY + entity.footerH/2,
      'dominant-baseline': 'middle', 'text-anchor': 'middle',
      'font-family': 'JetBrains Mono, monospace', 'font-size': '11', fill: 'var(--fg-subtle)' });
    addTxt.textContent = '+ Agregar atributo';
    addGrp.appendChild(addTxt);
    addGrp.addEventListener('click', (e) => { e.stopPropagation(); app.openAttrEditor(entity, null, g); });
    g.appendChild(addGrp);

    SVGEntityRenderer._renderPorts(entity, g, app);
    SVGEntityRenderer._attachDrag(entity, g, app);
    return g;
  }

  static _attrRow(attr, entity, index, app) {
    const W = entity.width, HH = entity.headerH, AH = entity.attrH;
    const y = HH + index * AH;
    const row = svgEl('g', { class: 'attr-row', 'data-attr-id': attr.id });

    const bg = svgEl('rect', { x: 0, y, width: W, height: AH, fill: 'transparent' });
    bg.style.cursor = 'pointer';
    bg.addEventListener('mouseenter', () => bg.setAttribute('fill', 'rgba(255,255,255,0.03)'));
    bg.addEventListener('mouseleave', () => bg.setAttribute('fill', 'transparent'));
    row.appendChild(bg);

    if (index > 0) row.appendChild(svgEl('line', { class: 'attr-sep', x1: 8, y1: y, x2: W-8, y2: y }));

    let xOff = 10;
    if (attr.pk) { row.appendChild(SVGEntityRenderer._badge('PK', xOff, y+AH/2, '#f6c90e', '#2a2000')); xOff += 26; }
    if (attr.fk) { row.appendChild(SVGEntityRenderer._badge('FK', xOff, y+AH/2, 'var(--accent2)', 'var(--accent2-dim)')); xOff += 26; }

    const nameEl = svgEl('text', { x: xOff, y: y+AH/2, 'dominant-baseline': 'middle',
      'font-family': 'JetBrains Mono, monospace', 'font-size': '11.5',
      fill: attr.pk ? '#f6c90e' : (attr.fk ? 'var(--accent2)' : 'var(--fg)') });
    nameEl.textContent = attr.name + (attr.nn ? ' *' : '');
    row.appendChild(nameEl);

    bg.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      app.openAttrEditor(entity, attr, document.querySelector(`[data-id="${entity.id}"]`));
    });
    return row;
  }

  static _badge(text, x, cy, color, bg) {
    const g = svgEl('g');
    g.appendChild(svgEl('rect', { x: x-1, y: cy-8, width: 22, height: 14, rx: 3, fill: bg }));
    const t = svgEl('text', { x: x+10, y: cy, 'dominant-baseline': 'middle', 'text-anchor': 'middle',
      'font-family': 'JetBrains Mono, monospace', 'font-size': '9', 'font-weight': '700', fill: color });
    t.textContent = text;
    g.appendChild(t);
    return g;
  }

  static _renderPorts(entity, g, app) {
    const W = entity.width, H = entity.height;
    [{ x:W/2, y:0, side:'top' }, { x:W/2, y:H, side:'bottom' },
     { x:0, y:H/2, side:'left' }, { x:W, y:H/2, side:'right' }].forEach(p => {
      const c = svgEl('circle', { class: 'port-dot', cx: p.x, cy: p.y, r: 5, 'data-side': p.side });
      c.addEventListener('mousedown', (e) => {
        if (app.currentTool === 'relation') { e.stopPropagation(); app.startRelationFrom(entity, e); }
      });
      g.appendChild(c);
    });
  }

  static _attachDrag(entity, g, app) {
    let dragging = false, startMouse, startPos;
    g.addEventListener('mousedown', (e) => {
      if (app.currentTool === 'delete') { app.deleteEntity(entity.id); return; }
      if (app.currentTool === 'relation') return;
      if (e.button !== 0) return;
      app.selectElement('entity', entity.id);
      dragging = true;
      startMouse = domToSVGPoint(app.svgCanvas, e.clientX, e.clientY);
      startPos   = { x: entity.x, y: entity.y };
      e.stopPropagation(); e.preventDefault();
      const onMove = (ev) => {
        if (!dragging) return;
        const cur = domToSVGPoint(app.svgCanvas, ev.clientX, ev.clientY);
        entity.x = startPos.x + (cur.x - startMouse.x);
        entity.y = startPos.y + (cur.y - startMouse.y);
        g.setAttribute('transform', `translate(${entity.x}, ${entity.y})`);
        app.updateRelationships();
      };
      const onUp = () => { dragging = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}

/* ─────────────────────────────────────────────
   CLASE: SVGRelationRenderer
───────────────────────────────────────────── */
class SVGRelationRenderer {
  static render(rel, fromEnt, toEnt, app) {
    const g = svgEl('g');
    g.setAttribute('class', 'rel-group');
    g.setAttribute('data-rel-id', rel.id);
    SVGRelationRenderer.update(g, rel, fromEnt, toEnt);
    g.addEventListener('click', (e) => {
      if (app.currentTool === 'delete') { app.deleteRelationship(rel.id); return; }
      e.stopPropagation(); app.selectElement('relationship', rel.id);
    });
    g.addEventListener('dblclick', (e) => { e.stopPropagation(); app.openRelModal(rel.fromId, rel.toId, rel); });
    return g;
  }

  static update(g, rel, fromEnt, toEnt) {
    while (g.firstChild) g.removeChild(g.firstChild);

    const fromCenter = { x: fromEnt.x + fromEnt.width/2,  y: fromEnt.y + fromEnt.height/2 };
    const toCenter   = { x: toEnt.x   + toEnt.width/2,    y: toEnt.y   + toEnt.height/2   };
    const fromPort   = fromEnt.getNearestPort(toCenter);
    const toPort     = toEnt.getNearestPort(fromCenter);

    // ── Línea recta entre los dos ports ──────────────────────────────────
    // Una línea recta simplifica completamente el cálculo del ángulo:
    // angle = atan2(toPort - fromPort) es constante y predecible,
    // por lo que los marcadores Crow's Foot siempre quedan alineados.

    // Área de clic invisible más ancha (facilita la selección)
    g.appendChild(svgEl('line', {
      x1: fromPort.x, y1: fromPort.y, x2: toPort.x, y2: toPort.y,
      stroke: 'transparent', 'stroke-width': '14', fill: 'none',
    }));

    // Línea visible
    g.appendChild(svgEl('line', {
      x1: fromPort.x, y1: fromPort.y, x2: toPort.x, y2: toPort.y,
      class: 'rel-line',
    }));

    // Crow's Foot: anchor = port del otro extremo.
    // Con línea recta: atan2(fromPort - toPort) es exactamente perpendicular
    // al borde del port, garantizando alineación perfecta.
    CrowsFootRenderer.draw(g, Relationship.cardToType(rel.cardFrom), fromPort, toPort,   'cf-mark');
    CrowsFootRenderer.draw(g, Relationship.cardToType(rel.cardTo),   toPort,   fromPort, 'cf-mark-dest');

    // Etiquetas de cardinalidad
    SVGRelationRenderer._cardLabel(g, rel.cardFrom, fromPort, toPort,   false);
    SVGRelationRenderer._cardLabel(g, rel.cardTo,   toPort,   fromPort, true);

    // Nombre de la relación en el punto medio de la línea
    if (rel.label) {
      const mid = { x: (fromPort.x + toPort.x) / 2, y: (fromPort.y + toPort.y) / 2 };
      g.appendChild(svgEl('rect', {
        x: mid.x - 36, y: mid.y - 9, width: 72, height: 16, rx: 4,
        fill: 'var(--bg2)', opacity: '0.92',
      }));
      const lbl = svgEl('text', { class: 'rel-name-label', x: mid.x, y: mid.y,
        'font-family': 'JetBrains Mono, monospace', 'font-size': '10' });
      lbl.textContent = rel.label;
      g.appendChild(lbl);
    }
  }

  static _cardLabel(g, card, port, anchor, isDest) {
    const angle = Math.atan2(port.y - anchor.y, port.x - anchor.x);
    const OFFSET = 22, PERP = 14;
    const px = port.x - Math.cos(angle) * OFFSET;
    const py = port.y - Math.sin(angle) * OFFSET;
    const tx = px - Math.sin(angle) * PERP;
    const ty = py + Math.cos(angle) * PERP;
    const lbl = svgEl('text', { x: tx, y: ty, 'dominant-baseline': 'middle', 'text-anchor': 'middle',
      'font-family': 'JetBrains Mono, monospace', 'font-size': '10', 'font-weight': '700',
      fill: isDest ? 'var(--accent2)' : 'var(--accent)' });
    lbl.textContent = card;
    g.appendChild(lbl);
  }


}

/* ─────────────────────────────────────────────
   CLASE PRINCIPAL: App
───────────────────────────────────────────── */
class App {
  constructor() {
    this.diagram = new Diagram();
    this.currentTool = 'select'; this.selectedId = null; this.selectedType = null;
    this.panX = 0; this.panY = 0; this.scale = 1;
    this._isPanning = false; this._panStart = null; this._panOrigin = null;
    this._relFromEntity = null; this._relPreviewLine = null; this._editingRel = null;
    this.svgCanvas     = document.getElementById('svg-canvas');
    this.diagRoot      = document.getElementById('diagram-root');
    this.canvasArea    = document.getElementById('canvas-area');
    this.canvasHint    = document.getElementById('canvas-hint');
    this.zoomLabel     = document.getElementById('zoom-label');
    this.toolIndicator = document.getElementById('tool-indicator-text');
    this._init();
  }

  _init() {
    this._bindToolButtons(); this._bindTopbarButtons(); this._bindCanvasEvents();
    this._bindKeyboard(); this._bindRelModal(); this._updateToolUI(); this._loadExample();
  }

  _loadExample() {
    const cliente = new Entity('CLIENTE', 60, 80);
    cliente.addAttribute(new Attribute('id_cliente', true, false, true));
    cliente.addAttribute(new Attribute('nombre', false, false, true));
    cliente.addAttribute(new Attribute('apellido', false, false, true));
    cliente.addAttribute(new Attribute('email', false, false, false));
    const pedido = new Entity('PEDIDO', 360, 80);
    pedido.addAttribute(new Attribute('id_pedido', true, false, true));
    pedido.addAttribute(new Attribute('fecha', false, false, true));
    pedido.addAttribute(new Attribute('total', false, false, true));
    pedido.addAttribute(new Attribute('id_cliente', false, true, true));
    const producto = new Entity('PRODUCTO', 360, 340);
    producto.addAttribute(new Attribute('id_producto', true, false, true));
    producto.addAttribute(new Attribute('nombre', false, false, true));
    producto.addAttribute(new Attribute('precio', false, false, true));
    producto.addAttribute(new Attribute('stock', false, false, false));
    this.diagram.addEntity(cliente);
    this.diagram.addEntity(pedido);
    this.diagram.addEntity(producto);
    this.diagram.addRelationship(new Relationship(cliente.id, pedido.id,   '1',    '0..N', 'realiza'));
    this.diagram.addRelationship(new Relationship(pedido.id,  producto.id, '0..N', '0..N', 'contiene'));
    this.renderAll(); this.fitView();
  }

  _bindToolButtons() {
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
    });
    document.getElementById('btn-fit').addEventListener('click',      () => this.fitView());
    document.getElementById('btn-zoom-in').addEventListener('click',  () => this.zoom(1.2));
    document.getElementById('btn-zoom-out').addEventListener('click', () => this.zoom(0.83));
  }

  setTool(tool) {
    this.currentTool = tool; this._updateToolUI(); this._cancelRelPreview(); this.deselect();
    const hints = { entity: 'Clic en el canvas para colocar una entidad',
                    relation: 'Clic en la entidad ORIGEN para iniciar la relación',
                    delete: 'Clic en una entidad o relación para eliminarla', select: '' };
    this._showHint(hints[tool] || '');
  }

  _updateToolUI() {
    document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === this.currentTool));
    this.canvasArea.className = `canvas-area tool-${this.currentTool}`;
    const names = { select: 'Seleccionar', entity: 'Agregar Entidad', relation: 'Agregar Relación', delete: 'Eliminar' };
    this.toolIndicator.textContent = names[this.currentTool] || this.currentTool;
  }

  _showHint(msg) { this.canvasHint.textContent = msg; this.canvasHint.classList.toggle('visible', !!msg); }

  _bindTopbarButtons() {
    document.getElementById('btn-new').addEventListener('click',         () => this.newDiagram());
    document.getElementById('btn-save').addEventListener('click',        () => this.saveProject());
    document.getElementById('btn-load').addEventListener('click',        () => document.getElementById('file-input').click());
    document.getElementById('btn-export-png').addEventListener('click',  () => this.exportPNG());
    document.getElementById('btn-export-json').addEventListener('click', () => this.exportJSON());
    document.getElementById('file-input').addEventListener('change', (e) => {
      if (e.target.files[0]) this.loadProject(e.target.files[0]); e.target.value = '';
    });
  }

  _bindCanvasEvents() {
    this.svgCanvas.addEventListener('click', (e) => {
      if (e.target === this.svgCanvas || e.target.id === 'grid-bg') {
        this.deselect();
        if (this.currentTool === 'entity') {
          const pt = this._screenToWorld(e.clientX, e.clientY);
          this.addEntity(pt.x - 100, pt.y - 50);
        }
        if (this.currentTool === 'relation' && this._relFromEntity) {
          this._cancelRelPreview();
          this._showHint('Clic en la entidad ORIGEN para iniciar la relación');
        }
      }
    });
    this.canvasArea.addEventListener('mousedown', (e) => { if (e.button === 1) { this._startPan(e); e.preventDefault(); } });
    this.canvasArea.addEventListener('mousemove', (e) => { if (this._isPanning) this._doPan(e); if (this._relFromEntity) this._updateRelPreview(e); });
    this.canvasArea.addEventListener('mouseup',   (e) => { if (e.button === 1) this._endPan(); });
    this.canvasArea.addEventListener('wheel', (e) => { e.preventDefault(); this._zoomAt(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY); }, { passive: false });
  }

  _startPan(e) { this._isPanning = true; this._panStart = {x:e.clientX,y:e.clientY}; this._panOrigin = {x:this.panX,y:this.panY}; this.canvasArea.classList.add('panning'); }
  _doPan(e)    { this.panX = this._panOrigin.x+(e.clientX-this._panStart.x); this.panY = this._panOrigin.y+(e.clientY-this._panStart.y); this._applyTransform(); }
  _endPan()    { this._isPanning = false; this.canvasArea.classList.remove('panning'); }

  _zoomAt(factor, cx, cy) {
    const pt = this._screenToWorld(cx, cy);
    this.scale = Math.min(Math.max(this.scale * factor, 0.15), 4);
    this.panX = cx - pt.x * this.scale; this.panY = cy - pt.y * this.scale;
    this._applyTransform(); this._updateZoomLabel();
  }
  zoom(factor) { const r = this.canvasArea.getBoundingClientRect(); this._zoomAt(factor, r.left+r.width/2, r.top+r.height/2); }
  _applyTransform() { this.diagRoot.setAttribute('transform', `translate(${this.panX},${this.panY}) scale(${this.scale})`); }
  _updateZoomLabel() { this.zoomLabel.textContent = `${Math.round(this.scale*100)}%`; }
  _screenToWorld(sx, sy) { const r = this.canvasArea.getBoundingClientRect(); return { x:(sx-r.left-this.panX)/this.scale, y:(sy-r.top-this.panY)/this.scale }; }

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      switch (e.key) {
        case 'v': case 'V': this.setTool('select'); break;
        case 'e': case 'E': this.setTool('entity'); break;
        case 'r': case 'R': this.setTool('relation'); break;
        case 'Delete': case 'Backspace':
          if (this.selectedType === 'entity')       this.deleteEntity(this.selectedId);
          if (this.selectedType === 'relationship') this.deleteRelationship(this.selectedId);
          break;
        case 'Escape': this.setTool('select'); this.deselect(); this._cancelRelPreview(); break;
      }
    });
  }

  addEntity(x = 100, y = 100) {
    const entity = new Entity(`ENTIDAD_${this.diagram.entities.length + 1}`, x, y);
    this.diagram.addEntity(entity);
    const el = SVGEntityRenderer.render(entity, this);
    this.diagRoot.appendChild(el);
    this._attachEntityRelationListener(el, entity);
    const titleEl = el.querySelector('.entity-title');
    if (titleEl) setTimeout(() => this.startInlineEditTitle(entity, titleEl, el), 50);
    return entity;
  }

  deleteEntity(id) { this.diagram.removeEntity(id); this.renderAll(); this.deselect(); }

  startRelationFrom(entity, mouseEvent) {
    if (this._relFromEntity) {
      if (entity.id !== this._relFromEntity.id) this._completeRelation(entity);
      return;
    }
    this._relFromEntity = entity;
    const cx = entity.x + entity.width/2, cy = entity.y + entity.height/2;
    this._relPreviewLine = svgEl('line', { class: 'rel-preview', x1: cx, y1: cy, x2: cx, y2: cy });
    this.diagRoot.appendChild(this._relPreviewLine);
    this._showHint(`Origen: ${entity.name} — ahora clic en la entidad DESTINO`);
  }

  _updateRelPreview(e) {
    if (!this._relFromEntity || !this._relPreviewLine) return;
    const world = this._screenToWorld(e.clientX, e.clientY);
    const port  = this._relFromEntity.getNearestPort(world);
    this._relPreviewLine.setAttribute('x1', port.x); this._relPreviewLine.setAttribute('y1', port.y);
    this._relPreviewLine.setAttribute('x2', world.x); this._relPreviewLine.setAttribute('y2', world.y);
  }

  _cancelRelPreview() {
    this._relFromEntity = null;
    if (this._relPreviewLine) { this._relPreviewLine.remove(); this._relPreviewLine = null; }
  }

  _completeRelation(toEntity) {
    if (!this._relFromEntity) return;
    const fromEntity = this._relFromEntity;
    this._cancelRelPreview();
    if (fromEntity.id === toEntity.id) { this._showHint('Selecciona una entidad diferente como destino'); return; }
    this._editingRel = null;
    this.openRelModal(fromEntity.id, toEntity.id, null);
  }

  deleteRelationship(id) { this.diagram.removeRelationship(id); this.renderAll(); this.deselect(); }

  _bindRelModal() {
    const modal = document.getElementById('rel-modal');
    document.getElementById('rel-modal-close').addEventListener('click',  () => this._closeRelModal());
    document.getElementById('rel-modal-cancel').addEventListener('click', () => this._closeRelModal());
    modal.addEventListener('click', (e) => { if (e.target === modal) this._closeRelModal(); });
    ['card-from-group','card-to-group'].forEach(groupId => {
      document.getElementById(groupId).addEventListener('click', (e) => {
        const btn = e.target.closest('.card-sel-btn'); if (!btn) return;
        document.getElementById(groupId).querySelectorAll('.card-sel-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected'); this._updateRelPreviewBar();
      });
    });
    document.getElementById('rel-from').addEventListener('change', () => this._updateRelPreviewBar());
    document.getElementById('rel-to').addEventListener('change',   () => this._updateRelPreviewBar());
    document.getElementById('rel-label').addEventListener('input', () => this._updateRelPreviewBar());
    document.getElementById('rel-modal-confirm').addEventListener('click', () => this._confirmRelModal());
  }

  openRelModal(fromId = null, toId = null, relEdit = null) {
    this._editingRel = relEdit;
    const modal = document.getElementById('rel-modal');
    const fromSel = document.getElementById('rel-from'), toSel = document.getElementById('rel-to');
    const labelInp = document.getElementById('rel-label');
    document.getElementById('rel-modal-title').textContent   = relEdit ? 'Editar Relación' : 'Nueva Relación';
    document.getElementById('rel-modal-confirm').textContent = relEdit ? 'Guardar Cambios' : 'Crear Relación';
    const opts = this.diagram.entities.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    fromSel.innerHTML = opts; toSel.innerHTML = opts;
    if (fromId) fromSel.value = fromId;
    if (toId)   toSel.value   = toId;
    labelInp.value = relEdit ? (relEdit.label || '') : '';
    this._setCardSelection('card-from-group', relEdit ? relEdit.cardFrom : '1');
    this._setCardSelection('card-to-group',   relEdit ? relEdit.cardTo   : '0..N');
    this._updateRelPreviewBar();
    modal.classList.remove('hidden');
    setTimeout(() => labelInp.focus(), 80);
  }

  _setCardSelection(groupId, value) {
    document.getElementById(groupId).querySelectorAll('.card-sel-btn')
      .forEach(b => b.classList.toggle('selected', b.dataset.value === value));
  }

  _getCardSelection(groupId) {
    const btn = document.getElementById(groupId).querySelector('.card-sel-btn.selected');
    return btn ? btn.dataset.value : '1';
  }

  _updateRelPreviewBar() {
    const fromId = document.getElementById('rel-from').value;
    const toId   = document.getElementById('rel-to').value;
    const label  = document.getElementById('rel-label').value.trim() || '···';
    const cardFrom = this._getCardSelection('card-from-group');
    const cardTo   = this._getCardSelection('card-to-group');
    const fromEnt  = this.diagram.getEntity(fromId);
    const toEnt    = this.diagram.getEntity(toId);
    document.getElementById('rpb-from-name').textContent     = fromEnt ? fromEnt.name : '—';
    document.getElementById('rpb-to-name').textContent       = toEnt   ? toEnt.name   : '—';
    document.getElementById('rpb-from-card').textContent     = cardFrom;
    document.getElementById('rpb-to-card').textContent       = cardTo;
    document.getElementById('rpb-label-preview').textContent = label;
    document.getElementById('rpb-to-card').className         = 'rpb-card dest';
  }

  _confirmRelModal() {
    const fromId   = document.getElementById('rel-from').value;
    const toId     = document.getElementById('rel-to').value;
    const label    = document.getElementById('rel-label').value.trim();
    const cardFrom = this._getCardSelection('card-from-group');
    const cardTo   = this._getCardSelection('card-to-group');
    if (!fromId || !toId) { alert('Selecciona las entidades'); return; }
    if (fromId === toId)  { alert('Las entidades deben ser distintas'); return; }
    if (this._editingRel) {
      this._editingRel.fromId = fromId; this._editingRel.toId = toId;
      this._editingRel.cardFrom = cardFrom; this._editingRel.cardTo = cardTo; this._editingRel.label = label;
      this.renderAll();
    } else {
      const rel = new Relationship(fromId, toId, cardFrom, cardTo, label);
      this.diagram.addRelationship(rel);
      this._renderOneRelationship(rel);
    }
    this._closeRelModal();
    this.currentTool = 'select'; this._updateToolUI(); this._showHint('');
  }

  _closeRelModal() { document.getElementById('rel-modal').classList.add('hidden'); this._editingRel = null; }

  selectElement(type, id) {
    this.deselect(); this.selectedId = id; this.selectedType = type;
    const sel = type === 'entity'
      ? this.diagRoot.querySelector(`[data-id="${id}"]`)
      : this.diagRoot.querySelector(`[data-rel-id="${id}"]`);
    if (sel) sel.classList.add('selected');
  }

  deselect() {
    this.selectedId = null; this.selectedType = null;
    this.diagRoot.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
  }

  startInlineEditTitle(entity, titleEl, groupEl) {
    const bbox = titleEl.getBoundingClientRect();
    const input = document.createElement('input');
    input.type = 'text'; input.value = entity.name; input.className = 'svg-inline-input';
    input.style.left = bbox.left + 'px'; input.style.top = (bbox.top - 4) + 'px';
    input.style.width = (entity.width * this.scale) + 'px'; input.style.textAlign = 'center';
    document.body.appendChild(input); input.focus(); input.select();
    const commit = () => {
      entity.name = input.value.trim().toUpperCase() || entity.name;
      input.remove();
      const old = this.diagRoot.querySelector(`[data-id="${entity.id}"]`);
      if (old) {
        const neu = SVGEntityRenderer.render(entity, this);
        this._attachEntityRelationListener(neu, entity);
        this.diagRoot.replaceChild(neu, old);
      }
      this.updateRelationships();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => { if (e.key==='Enter'){e.preventDefault();commit();} if(e.key==='Escape')input.remove(); });
  }

  openAttrEditor(entity, attr, groupEl) {
    clearPopovers();
    const isNew = !attr;
    if (isNew) attr = new Attribute('', false, false, false);
    const pop = document.createElement('div');
    pop.className = 'attr-popover';
    const rect = groupEl.getBoundingClientRect();
    pop.style.left = (rect.right + 8) + 'px'; pop.style.top = rect.top + 'px';
    pop.innerHTML = `
      <h4>${isNew ? 'Nuevo Atributo' : 'Editar Atributo'}</h4>
      <div class="attr-popover-row"><input type="text" id="ap-name" placeholder="nombre_atributo" value="${attr.name}" /></div>
      <div class="attr-popover-flags">
        <label class="flag-checkbox"><input type="checkbox" id="ap-pk" ${attr.pk?'checked':''}> PK</label>
        <label class="flag-checkbox"><input type="checkbox" id="ap-fk" ${attr.fk?'checked':''}> FK</label>
        <label class="flag-checkbox"><input type="checkbox" id="ap-nn" ${attr.nn?'checked':''}> NN</label>
      </div>
      <div class="attr-popover-actions">
        ${!isNew ? '<button class="btn-xs del" id="ap-del">Eliminar</button>' : ''}
        <button class="btn-xs" id="ap-cancel">Cancelar</button>
        <button class="btn-xs primary" id="ap-save">${isNew ? 'Agregar' : 'Guardar'}</button>
      </div>`;
    document.body.appendChild(pop);
    pop.querySelector('#ap-name').focus();
    pop.querySelector('#ap-cancel').addEventListener('click', () => pop.remove());
    if (!isNew) pop.querySelector('#ap-del').addEventListener('click', () => { entity.removeAttribute(attr.id); this._refreshEntity(entity); pop.remove(); });
    pop.querySelector('#ap-save').addEventListener('click', () => {
      const name = pop.querySelector('#ap-name').value.trim();
      if (!name) { pop.querySelector('#ap-name').focus(); return; }
      attr.name = name; attr.pk = pop.querySelector('#ap-pk').checked;
      attr.fk = pop.querySelector('#ap-fk').checked; attr.nn = pop.querySelector('#ap-nn').checked;
      if (isNew) entity.addAttribute(attr);
      this._refreshEntity(entity); pop.remove();
    });
    pop.querySelector('#ap-name').addEventListener('keydown', (e) => { if(e.key==='Enter')pop.querySelector('#ap-save').click(); if(e.key==='Escape')pop.remove(); });
    setTimeout(() => {
      const dismiss = (e) => { if (!pop.contains(e.target)){pop.remove();document.removeEventListener('mousedown',dismiss);} };
      document.addEventListener('mousedown', dismiss);
    }, 100);
    requestAnimationFrame(() => {
      const pr = pop.getBoundingClientRect();
      if (pr.right  > window.innerWidth)  pop.style.left = (rect.left - pr.width - 8) + 'px';
      if (pr.bottom > window.innerHeight) pop.style.top  = (window.innerHeight - pr.height - 10) + 'px';
    });
  }

  _refreshEntity(entity) {
    const old = this.diagRoot.querySelector(`[data-id="${entity.id}"]`);
    if (old) { const neu = SVGEntityRenderer.render(entity, this); this._attachEntityRelationListener(neu, entity); this.diagRoot.replaceChild(neu, old); }
    this.updateRelationships();
  }

  renderAll() {
    while (this.diagRoot.firstChild) this.diagRoot.removeChild(this.diagRoot.firstChild);
    this.diagram.relationships.forEach(rel => this._renderOneRelationship(rel));
    this.diagram.entities.forEach(entity => {
      const el = SVGEntityRenderer.render(entity, this);
      this._attachEntityRelationListener(el, entity);
      this.diagRoot.appendChild(el);
    });
  }

  _renderOneRelationship(rel) {
    const from = this.diagram.getEntity(rel.fromId), to = this.diagram.getEntity(rel.toId);
    if (!from || !to) return;
    const el = SVGRelationRenderer.render(rel, from, to, this);
    const firstEntity = this.diagRoot.querySelector('.entity-group');
    if (firstEntity) this.diagRoot.insertBefore(el, firstEntity);
    else             this.diagRoot.appendChild(el);
  }

  updateRelationships() {
    this.diagram.relationships.forEach(rel => {
      const g    = this.diagRoot.querySelector(`[data-rel-id="${rel.id}"]`);
      const from = this.diagram.getEntity(rel.fromId);
      const to   = this.diagram.getEntity(rel.toId);
      if (g && from && to) SVGRelationRenderer.update(g, rel, from, to);
    });
  }

  _attachEntityRelationListener(el, entity) {
    el.removeEventListener('mousedown', el._relListener);
    el._relListener = (e) => { if (this.currentTool === 'relation' && this._relFromEntity) { e.stopPropagation(); this._completeRelation(entity); } };
    el.addEventListener('mousedown', el._relListener);
  }

  fitView() {
    if (!this.diagram.entities.length) return;
    const pad = 60; let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    this.diagram.entities.forEach(e => { minX=Math.min(minX,e.x); minY=Math.min(minY,e.y); maxX=Math.max(maxX,e.x+e.width); maxY=Math.max(maxY,e.y+e.height); });
    const cW=maxX-minX+pad*2, cH=maxY-minY+pad*2, r=this.canvasArea.getBoundingClientRect();
    this.scale = Math.max(Math.min(r.width/cW, r.height/cH, 1.5), 0.15);
    this.panX  = (r.width -cW*this.scale)/2-(minX-pad)*this.scale;
    this.panY  = (r.height-cH*this.scale)/2-(minY-pad)*this.scale;
    this._applyTransform(); this._updateZoomLabel();
  }

  newDiagram() {
    if (this.diagram.entities.length > 0 && !confirm('¿Crear un nuevo diagrama? Se perderán los cambios no guardados.')) return;
    this.diagram = new Diagram(); this.deselect(); this.renderAll();
  }

  saveProject()  { this._download(JSON.stringify(this.diagram.toJSON(), null, 2), 'erflow-diagram.json', 'application/json'); }
  exportJSON()   { this.saveProject(); }

  loadProject(file) {
    const reader = new FileReader();
    reader.onload = (e) => { try { this.diagram = Diagram.fromJSON(JSON.parse(e.target.result)); this.renderAll(); this.fitView(); } catch(err) { alert('Error al cargar: ' + err.message); } };
    reader.readAsText(file);
  }

  exportPNG() {
    if (!this.diagram.entities.length) { alert('No hay entidades para exportar'); return; }
    const pad=60; let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    this.diagram.entities.forEach(e => { minX=Math.min(minX,e.x);minY=Math.min(minY,e.y);maxX=Math.max(maxX,e.x+e.width);maxY=Math.max(maxY,e.y+e.height); });
    const W=maxX-minX+pad*2, H=maxY-minY+pad*2, SC=2;
    const clone = this.svgCanvas.cloneNode(true);
    clone.setAttribute('width', W*SC); clone.setAttribute('height', H*SC);
    clone.querySelector('#diagram-root').setAttribute('transform', `translate(${(pad-minX)*SC},${(pad-minY)*SC}) scale(${SC})`);
    const bg = svgEl('rect', { width:'100%', height:'100%', fill:'#0f1117' });
    clone.insertBefore(bg, clone.firstChild);
    const gridBg = clone.querySelector('#grid-bg'); if (gridBg) gridBg.setAttribute('fill','none');
    const style = document.createElement('style');
    style.textContent = `text{font-family:'JetBrains Mono',monospace}.entity-box{fill:#161b25;stroke:#3a4560;stroke-width:1.5}.entity-header{fill:#1d2433}.entity-title{font-size:13px;font-weight:600;fill:#e8ecf4}.rel-line{stroke:#4f9eff;stroke-width:1.8;fill:none;opacity:.85}.cf-mark{stroke:#4f9eff;stroke-width:1.8;fill:none}.cf-mark-dest{stroke:#a78bfa;stroke-width:1.8;fill:none}.rel-name-label{font-size:10px;fill:#8896b0}.attr-sep{stroke:#2a3347;stroke-width:.5}`;
    clone.insertBefore(style, clone.firstChild);
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], {type:'image/svg+xml'});
    const url = URL.createObjectURL(blob), img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas'); canvas.width=W*SC; canvas.height=H*SC;
      canvas.getContext('2d').drawImage(img,0,0); URL.revokeObjectURL(url);
      canvas.toBlob(png => this._download(URL.createObjectURL(png),'erflow-diagram.png',null,true),'image/png');
    };
    img.src = url;
  }

  _download(content, filename, type, isUrl=false) {
    const a = document.createElement('a');
    a.href = isUrl ? content : `data:${type};charset=utf-8,${encodeURIComponent(content)}`;
    a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
}

document.addEventListener('DOMContentLoaded', () => { window.erApp = new App(); });
