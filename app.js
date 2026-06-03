/**
 * ERFlow — Herramienta de Diagramas Entidad-Relación (Crow's Foot)
 * Versión 2 — Relaciones reales con cardinalidades independientes por extremo.
 *
 * Arquitectura OOP:
 *   Attribute          → modelo de atributo (nombre, PK, FK, NN)
 *   Entity             → modelo de entidad  (nombre, posición, atributos, ports)
 *   Relationship       → modelo de relación (id, nombre, origen, destino,
 *                                            cardinalidadOrigen, cardinalidadDestino)
 *   Diagram            → estado central: entidades + relaciones + serialización JSON
 *   CrowsFootRenderer  → dibuja los símbolos Crow's Foot según tipo de cardinalidad
 *   SVGEntityRenderer  → construye el grupo SVG de una entidad
 *   SVGRelationRenderer→ construye/actualiza el grupo SVG de una relación
 *   App                → coordina todo (pan, zoom, herramientas, modales, I/O)
 */

/* ─────────────────────────────────────────────
   UTILIDADES
───────────────────────────────────────────── */

/** Genera un ID único corto */
function uid() {
  return '_' + Math.random().toString(36).slice(2, 10);
}

/** Convierte coordenadas DOM al espacio del SVG transformado */
function domToSVGPoint(svgEl, clientX, clientY) {
  const pt = svgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(svgEl.getScreenCTM().inverse());
}

/** Cierra cualquier popover de atributo abierto */
function clearPopovers() {
  document.querySelectorAll('.attr-popover').forEach(el => el.remove());
}

/** Crea un elemento SVG con atributos dados */
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
    this.id   = uid();
    this.name = name;
    this.pk   = pk;
    this.fk   = fk;
    this.nn   = nn;
  }

  toJSON() {
    return { id: this.id, name: this.name, pk: this.pk, fk: this.fk, nn: this.nn };
  }

  static fromJSON(d) {
    const a = new Attribute(d.name, d.pk, d.fk, d.nn);
    a.id = d.id;
    return a;
  }
}

/* ─────────────────────────────────────────────
   CLASE: Entity
───────────────────────────────────────────── */
class Entity {
  constructor(name = 'ENTIDAD', x = 100, y = 100) {
    this.id         = uid();
    this.name       = name;
    this.x          = x;
    this.y          = y;
    this.attributes = [];
    this.width      = 200;
    this.headerH    = 38;
    this.attrH      = 26;
    this.footerH    = 28;
  }

  get height() {
    return this.headerH + this.attributes.length * this.attrH + this.footerH;
  }

  addAttribute(attr)    { this.attributes.push(attr); }
  removeAttribute(id)   { this.attributes = this.attributes.filter(a => a.id !== id); }

  /**
   * Devuelve los 4 ports de conexión en coordenadas absolutas del mundo.
   * Cada port tiene { x, y, side }.
   */
  getPorts() {
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    return {
      top:    { x: cx,                  y: this.y,                   side: 'top'    },
      bottom: { x: cx,                  y: this.y + this.height,      side: 'bottom' },
      left:   { x: this.x,              y: cy,                        side: 'left'   },
      right:  { x: this.x + this.width, y: cy,                        side: 'right'  },
    };
  }

  /** Port más cercano a un punto externo (para calcular dónde anclar la línea) */
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
   CLASE: Relationship  ← NUEVA ARQUITECTURA
   Almacena cardinalidades independientes para
   cada extremo (origen y destino).
───────────────────────────────────────────── */
class Relationship {
  /**
   * @param {string} fromId          ID de la entidad origen
   * @param {string} toId            ID de la entidad destino
   * @param {string} cardFrom        Cardinalidad del extremo origen  ('1'|'0..1'|'1..N'|'0..N')
   * @param {string} cardTo          Cardinalidad del extremo destino ('1'|'0..1'|'1..N'|'0..N')
   * @param {string} label           Nombre de la relación (opcional)
   */
  constructor(fromId, toId, cardFrom = '1', cardTo = '0..N', label = '') {
    this.id       = uid();
    this.fromId   = fromId;
    this.toId     = toId;
    this.cardFrom = cardFrom;   // cardinalidad en el extremo de la entidad origen
    this.cardTo   = cardTo;     // cardinalidad en el extremo de la entidad destino
    this.label    = label;
  }

  /**
   * Convierte la cardinalidad textual al tipo Crow's Foot que usa el renderer.
   * '1'    → 'one'       (una barra doble: exactamente uno)
   * '0..1' → 'zero_one'  (círculo + barra: cero o uno)
   * '1..N' → 'one_many'  (barra + pata: uno o muchos)
   * '0..N' → 'zero_many' (círculo + pata: cero o muchos)
   */
  static cardToType(card) {
    const map = { '1': 'one', '0..1': 'zero_one', '1..N': 'one_many', '0..N': 'zero_many' };
    return map[card] || 'one';
  }

  toJSON() {
    return { id: this.id, fromId: this.fromId, toId: this.toId,
             cardFrom: this.cardFrom, cardTo: this.cardTo, label: this.label };
  }

  static fromJSON(d) {
    // Compatibilidad hacia atrás: si el JSON tiene el campo 'cardinality' antiguo,
    // lo convertimos al nuevo esquema de cardinalidades separadas.
    let cardFrom = d.cardFrom;
    let cardTo   = d.cardTo;
    if (!cardFrom || !cardTo) {
      const legacyMap = {
        '1:1': { f: '1',    t: '1'    },
        '1:N': { f: '1',    t: '0..N' },
        'N:1': { f: '0..N', t: '1'    },
        'N:M': { f: '0..N', t: '0..N' },
      };
      const legacy = legacyMap[d.cardinality] || { f: '1', t: '0..N' };
      cardFrom = legacy.f;
      cardTo   = legacy.t;
    }
    const r = new Relationship(d.fromId, d.toId, cardFrom, cardTo, d.label || '');
    r.id = d.id;
    return r;
  }
}

/* ─────────────────────────────────────────────
   CLASE: Diagram
───────────────────────────────────────────── */
class Diagram {
  constructor() {
    this.entities      = [];
    this.relationships = [];
  }

  addEntity(e)      { this.entities.push(e); return e; }
  getEntity(id)     { return this.entities.find(e => e.id === id) || null; }
  addRelationship(r){ this.relationships.push(r); return r; }

  removeEntity(id) {
    this.entities      = this.entities.filter(e => e.id !== id);
    this.relationships = this.relationships.filter(r => r.fromId !== id && r.toId !== id);
  }

  removeRelationship(id) {
    this.relationships = this.relationships.filter(r => r.id !== id);
  }

  toJSON() {
    return {
      version:       '2.0',
      entities:      this.entities.map(e => e.toJSON()),
      relationships: this.relationships.map(r => r.toJSON()),
    };
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
   Dibuja los símbolos Crow's Foot en un extremo
   de la línea, orientados hacia la entidad.
───────────────────────────────────────────── */
class CrowsFootRenderer {
  /**
   * @param {SVGGElement} group    Grupo SVG donde se agregan los elementos
   * @param {string}      type     'one' | 'zero_one' | 'one_many' | 'zero_many'
   * @param {{x,y,side}}  port     Punto de contacto con la entidad
   * @param {{x,y}}       anchor   Punto opuesto (para calcular el ángulo)
   * @param {string}      cssClass Clase CSS para colorear ('cf-mark' o 'cf-mark-dest')
   */
  static draw(group, type, port, anchor, cssClass = 'cf-mark') {
    // Ángulo desde el anchor hacia el port (dirección de llegada a la entidad)
    const angle = Math.atan2(port.y - anchor.y, port.x - anchor.x);
    const TICK  = 7;   // semiancho de las barras perpendiculares

    const mk = (tag, attrs) => {
      const el = svgEl(tag, attrs);
      el.classList.add('cf-mark');
      if (cssClass !== 'cf-mark') el.classList.add(cssClass);
      group.appendChild(el);
      return el;
    };

    // Proyecta un punto a distancia d desde el port hacia el interior de la línea
    const proj = (d) => ({
      x: port.x - Math.cos(angle) * d,
      y: port.y - Math.sin(angle) * d,
    });

    // Coordenadas de una línea perpendicular centrada en `origin`
    const perp = (origin, half) => ({
      x1: origin.x + Math.sin(angle) * half,
      y1: origin.y - Math.cos(angle) * half,
      x2: origin.x - Math.sin(angle) * half,
      y2: origin.y + Math.cos(angle) * half,
    });

    if (type === 'one') {
      // ||  Exactamente uno: dos barras
      const pp1 = perp(proj(6), TICK);
      mk('line', { x1: pp1.x1, y1: pp1.y1, x2: pp1.x2, y2: pp1.y2 });
      const pp2 = perp(proj(13), TICK);
      mk('line', { x1: pp2.x1, y1: pp2.y1, x2: pp2.x2, y2: pp2.y2 });
    }
    else if (type === 'zero_one') {
      // o|  Cero o uno: círculo + barra
      const cp = proj(5);
      mk('circle', { cx: cp.x, cy: cp.y, r: 5 });
      const pp = perp(proj(14), TICK);
      mk('line', { x1: pp.x1, y1: pp.y1, x2: pp.x2, y2: pp.y2 });
    }
    else if (type === 'one_many') {
      // |<  Uno o muchos: barra + pata de cuervo
      const pp = perp(proj(6), TICK);
      mk('line', { x1: pp.x1, y1: pp.y1, x2: pp.x2, y2: pp.y2 });
      const base = proj(14);
      mk('line', { x1: base.x,                             y1: base.y,                             x2: port.x, y2: port.y });
      mk('line', { x1: base.x + Math.sin(angle) * TICK,    y1: base.y - Math.cos(angle) * TICK,    x2: port.x, y2: port.y });
      mk('line', { x1: base.x - Math.sin(angle) * TICK,    y1: base.y + Math.cos(angle) * TICK,    x2: port.x, y2: port.y });
    }
    else if (type === 'zero_many') {
      // o<  Cero o muchos: círculo + pata de cuervo
      const cp = proj(8);
      mk('circle', { cx: cp.x, cy: cp.y, r: 5 });
      const base = proj(17);
      mk('line', { x1: base.x,                             y1: base.y,                             x2: port.x, y2: port.y });
      mk('line', { x1: base.x + Math.sin(angle) * TICK,    y1: base.y - Math.cos(angle) * TICK,    x2: port.x, y2: port.y });
      mk('line', { x1: base.x - Math.sin(angle) * TICK,    y1: base.y + Math.cos(angle) * TICK,    x2: port.x, y2: port.y });
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

    const W  = entity.width;
    const HH = entity.headerH;
    const AH = entity.attrH;

    // ── Caja principal ──
    const box = svgEl('rect', { class: 'entity-box', width: W, height: entity.height, rx: 8 });
    g.appendChild(box);

    // ── Header (fondo) ──
    g.appendChild(svgEl('rect', { class: 'entity-header', width: W, height: HH, rx: 8 }));
    // Tapa la parte inferior del header para no tener bordes redondeados abajo
    g.appendChild(svgEl('rect', { class: 'entity-header', y: HH / 2, width: W, height: HH / 2 }));

    // ── Título ──
    const title = svgEl('text', {
      class: 'entity-title', x: W / 2, y: HH / 2,
      'dominant-baseline': 'middle', 'text-anchor': 'middle',
    });
    title.textContent = entity.name;
    title.style.cursor = 'text';
    title.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      app.startInlineEditTitle(entity, title, g);
    });
    g.appendChild(title);

    // ── Separador header/body ──
    g.appendChild(svgEl('line', { class: 'attr-sep', x1: 0, y1: HH, x2: W, y2: HH }));

    // ── Atributos ──
    entity.attributes.forEach((attr, i) => {
      g.appendChild(SVGEntityRenderer._attrRow(attr, entity, i, app));
    });

    // ── Botón "+ Agregar atributo" ──
    const addY  = HH + entity.attributes.length * AH;
    const addGrp = svgEl('g', { class: 'add-attr-btn' });
    const addBg  = svgEl('rect', { x: 0, y: addY, width: W, height: entity.footerH, rx: 8 });
    addBg.style.fill = 'transparent';
    addGrp.appendChild(addBg);
    const addTxt = svgEl('text', {
      x: W / 2, y: addY + entity.footerH / 2,
      'dominant-baseline': 'middle', 'text-anchor': 'middle',
      'font-family': 'JetBrains Mono, monospace', 'font-size': '11',
      fill: 'var(--fg-subtle)',
    });
    addTxt.textContent = '+ Agregar atributo';
    addGrp.appendChild(addTxt);
    addGrp.addEventListener('click', (e) => { e.stopPropagation(); app.openAttrEditor(entity, null, g); });
    g.appendChild(addGrp);

    // ── Ports de conexión ──
    SVGEntityRenderer._renderPorts(entity, g, app);

    // ── Drag & drop ──
    SVGEntityRenderer._attachDrag(entity, g, app);

    return g;
  }

  static _attrRow(attr, entity, index, app) {
    const W  = entity.width;
    const HH = entity.headerH;
    const AH = entity.attrH;
    const y  = HH + index * AH;

    const row = svgEl('g', { class: 'attr-row', 'data-attr-id': attr.id });

    // Fondo hover
    const bg = svgEl('rect', { x: 0, y, width: W, height: AH, fill: 'transparent' });
    bg.style.cursor = 'pointer';
    bg.addEventListener('mouseenter', () => bg.setAttribute('fill', 'rgba(255,255,255,0.03)'));
    bg.addEventListener('mouseleave', () => bg.setAttribute('fill', 'transparent'));
    row.appendChild(bg);

    // Línea separadora entre atributos
    if (index > 0) {
      row.appendChild(svgEl('line', { class: 'attr-sep', x1: 8, y1: y, x2: W - 8, y2: y }));
    }

    let xOff = 10;
    if (attr.pk) { row.appendChild(SVGEntityRenderer._badge('PK', xOff, y + AH/2, '#f6c90e',        '#2a2000'));        xOff += 26; }
    if (attr.fk) { row.appendChild(SVGEntityRenderer._badge('FK', xOff, y + AH/2, 'var(--accent2)', 'var(--accent2-dim)')); xOff += 26; }

    const nameEl = svgEl('text', {
      x: xOff, y: y + AH / 2,
      'dominant-baseline': 'middle',
      'font-family': 'JetBrains Mono, monospace',
      'font-size': '11.5',
      fill: attr.pk ? '#f6c90e' : (attr.fk ? 'var(--accent2)' : 'var(--fg)'),
    });
    nameEl.textContent = attr.name + (attr.nn ? ' *' : '');
    row.appendChild(nameEl);

    bg.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const gEl = document.querySelector(`[data-id="${entity.id}"]`);
      app.openAttrEditor(entity, attr, gEl);
    });

    return row;
  }

  static _badge(text, x, cy, color, bg) {
    const g  = svgEl('g');
    const rc = svgEl('rect', { x: x - 1, y: cy - 8, width: 22, height: 14, rx: 3, fill: bg });
    const t  = svgEl('text', {
      x: x + 10, y: cy,
      'dominant-baseline': 'middle', 'text-anchor': 'middle',
      'font-family': 'JetBrains Mono, monospace',
      'font-size': '9', 'font-weight': '700', fill: color,
    });
    t.textContent = text;
    g.appendChild(rc);
    g.appendChild(t);
    return g;
  }

  static _renderPorts(entity, g, app) {
    const W = entity.width, H = entity.height;
    [
      { x: W/2, y: 0,   side: 'top'    },
      { x: W/2, y: H,   side: 'bottom' },
      { x: 0,   y: H/2, side: 'left'   },
      { x: W,   y: H/2, side: 'right'  },
    ].forEach(p => {
      const c = svgEl('circle', { class: 'port-dot', cx: p.x, cy: p.y, r: 5, 'data-side': p.side });
      c.addEventListener('mousedown', (e) => {
        if (app.currentTool === 'relation') {
          e.stopPropagation();
          app.startRelationFrom(entity, e);
        }
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
      dragging   = true;
      startMouse = domToSVGPoint(app.svgCanvas, e.clientX, e.clientY);
      startPos   = { x: entity.x, y: entity.y };
      e.stopPropagation();
      e.preventDefault();

      const onMove = (ev) => {
        if (!dragging) return;
        const cur = domToSVGPoint(app.svgCanvas, ev.clientX, ev.clientY);
        entity.x = startPos.x + (cur.x - startMouse.x);
        entity.y = startPos.y + (cur.y - startMouse.y);
        g.setAttribute('transform', `translate(${entity.x}, ${entity.y})`);
        app.updateRelationships(); // redibuja todas las relaciones ancladas
      };
      const onUp = () => {
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}

/* ─────────────────────────────────────────────
   CLASE: SVGRelationRenderer
   Dibuja una relación como curva bezier anclada
   a los bordes de las entidades, con:
   - Nombre de la relación en el centro
   - Cardinalidad en cada extremo (Crow's Foot)
   - Texto de cardinalidad junto a cada entidad
───────────────────────────────────────────── */
class SVGRelationRenderer {
  static render(rel, fromEnt, toEnt, app) {
    const g = svgEl('g');
    g.setAttribute('class', 'rel-group');
    g.setAttribute('data-rel-id', rel.id);

    SVGRelationRenderer.update(g, rel, fromEnt, toEnt);

    // Clic para seleccionar o eliminar
    g.addEventListener('click', (e) => {
      if (app.currentTool === 'delete') { app.deleteRelationship(rel.id); return; }
      e.stopPropagation();
      app.selectElement('relationship', rel.id);
    });

    // Doble clic para editar la relación
    g.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      app.openRelModal(rel.fromId, rel.toId, rel);
    });

    return g;
  }

  /**
   * Recalcula la geometría completa de la relación.
   * Llamado tanto en el renderizado inicial como cada vez
   * que se mueve una de las entidades involucradas.
   */
  static update(g, rel, fromEnt, toEnt) {
    // Limpiar contenido anterior
    while (g.firstChild) g.removeChild(g.firstChild);

    // ── Calcular puertos de anclaje ──
    const fromCenter = { x: fromEnt.x + fromEnt.width / 2, y: fromEnt.y + fromEnt.height / 2 };
    const toCenter   = { x: toEnt.x   + toEnt.width   / 2, y: toEnt.y   + toEnt.height   / 2 };
    const fromPort   = fromEnt.getNearestPort(toCenter);
    const toPort     = toEnt.getNearestPort(fromCenter);

    // ── Puntos de control de la curva bezier ──
    const { c1, c2 } = SVGRelationRenderer._controlPoints(fromPort, toPort);

    // Path de la curva
    const dPath = `M ${fromPort.x} ${fromPort.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${toPort.x} ${toPort.y}`;

    // Línea invisible más ancha para facilitar el clic
    const hitArea = svgEl('path', { d: dPath, fill: 'none', stroke: 'transparent', 'stroke-width': '14' });
    g.appendChild(hitArea);

    // Línea visible
    const line = svgEl('path', { d: dPath, class: 'rel-line' });
    g.appendChild(line);

    // ── Símbolos Crow's Foot en cada extremo ──
    // fromPort: el símbolo de cardinalidad DEL LADO DEL ORIGEN
    //   (se dibuja junto a la entidad origen, orientado hacia ella)
    CrowsFootRenderer.draw(g, Relationship.cardToType(rel.cardFrom), fromPort, toPort,   'cf-mark');
    // toPort: el símbolo de cardinalidad DEL LADO DEL DESTINO
    CrowsFootRenderer.draw(g, Relationship.cardToType(rel.cardTo),   toPort,   fromPort, 'cf-mark-dest');

    // ── Textos de cardinalidad junto a cada entidad ──
    // Posicionados a ~28px del port, perpendicular a la línea
    SVGRelationRenderer._cardLabel(g, rel.cardFrom, fromPort, toPort,   false);
    SVGRelationRenderer._cardLabel(g, rel.cardTo,   toPort,   fromPort, true);

    // ── Nombre de la relación en el punto medio ──
    if (rel.label) {
      const mid = SVGRelationRenderer._bezierMid(fromPort, toPort, c1, c2);
      // Fondo semitransparente detrás del texto
      const txtBg = svgEl('rect', {
        x: mid.x - 36, y: mid.y - 9, width: 72, height: 16, rx: 4,
        fill: 'var(--bg2)', opacity: '0.92',
      });
      g.appendChild(txtBg);
      const lbl = svgEl('text', {
        class: 'rel-name-label',
        x: mid.x, y: mid.y,
        'font-family': 'JetBrains Mono, monospace',
        'font-size': '10',
      });
      lbl.textContent = rel.label;
      g.appendChild(lbl);
    }
  }

  /**
   * Dibuja la etiqueta de cardinalidad textual (ej: "1", "0..N")
   * cerca del port, desplazada lateralmente para no tapar la línea.
   */
  static _cardLabel(g, card, port, anchor, isDest) {
    const angle  = Math.atan2(port.y - anchor.y, port.x - anchor.x);
    const OFFSET = 22; // distancia desde el port
    const PERP   = 14; // desplazamiento lateral

    // Punto proyectado al interior de la línea
    const px = port.x - Math.cos(angle) * OFFSET;
    const py = port.y - Math.sin(angle) * OFFSET;
    // Desplazamiento perpendicular (arriba de la línea)
    const tx = px - Math.sin(angle) * PERP;
    const ty = py + Math.cos(angle) * PERP;

    const lbl = svgEl('text', {
      x: tx, y: ty,
      'dominant-baseline': 'middle',
      'text-anchor': 'middle',
      'font-family': 'JetBrains Mono, monospace',
      'font-size': '10',
      'font-weight': '700',
      fill: isDest ? 'var(--accent2)' : 'var(--accent)',
    });
    lbl.textContent = card;
    g.appendChild(lbl);
  }

  /** Puntos de control de la bezier según lado del port */
  static _controlPoints(from, to) {
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    const off = Math.max(60, Math.min(dx, dy) * 0.4 + 50);

    const c1 = { x: from.x, y: from.y };
    const c2 = { x: to.x,   y: to.y   };

    if (from.side === 'right')  c1.x += off;
    if (from.side === 'left')   c1.x -= off;
    if (from.side === 'bottom') c1.y += off;
    if (from.side === 'top')    c1.y -= off;

    if (to.side === 'right')    c2.x += off;
    if (to.side === 'left')     c2.x -= off;
    if (to.side === 'bottom')   c2.y += off;
    if (to.side === 'top')      c2.y -= off;

    return { c1, c2 };
  }

  /** Punto t=0.5 de la curva bezier cúbica */
  static _bezierMid(p0, p3, p1, p2, t = 0.5) {
    const mt = 1 - t;
    return {
      x: mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x,
      y: mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y,
    };
  }
}

/* ─────────────────────────────────────────────
   CLASE PRINCIPAL: App
───────────────────────────────────────────── */
class App {
  constructor() {
    this.diagram      = new Diagram();
    this.currentTool  = 'select';
    this.selectedId   = null;
    this.selectedType = null;

    // Pan & Zoom
    this.panX = 0; this.panY = 0; this.scale = 1;
    this._isPanning = false; this._panStart = null; this._panOrigin = null;

    // Estado de creación de relación (flujo de 2 clics)
    this._relFromEntity  = null;  // Entity origen seleccionada
    this._relPreviewLine = null;  // Línea de preview mientras se arrastra
    this._editingRel     = null;  // Relationship que se está editando (null = nueva)

    // DOM
    this.svgCanvas     = document.getElementById('svg-canvas');
    this.diagRoot      = document.getElementById('diagram-root');
    this.canvasArea    = document.getElementById('canvas-area');
    this.canvasHint    = document.getElementById('canvas-hint');
    this.zoomLabel     = document.getElementById('zoom-label');
    this.toolIndicator = document.getElementById('tool-indicator-text');

    this._init();
  }

  _init() {
    this._bindToolButtons();
    this._bindTopbarButtons();
    this._bindCanvasEvents();
    this._bindKeyboard();
    this._bindRelModal();
    this._updateToolUI();
    this._loadExample();
  }

  /* ══════════════════════════════════════════
     EJEMPLO INICIAL
     ══════════════════════════════════════════ */
  _loadExample() {
    const cliente = new Entity('CLIENTE', 60, 80);
    cliente.addAttribute(new Attribute('id_cliente', true,  false, true));
    cliente.addAttribute(new Attribute('nombre',     false, false, true));
    cliente.addAttribute(new Attribute('apellido',   false, false, true));
    cliente.addAttribute(new Attribute('email',      false, false, false));

    const pedido = new Entity('PEDIDO', 360, 80);
    pedido.addAttribute(new Attribute('id_pedido',  true,  false, true));
    pedido.addAttribute(new Attribute('fecha',      false, false, true));
    pedido.addAttribute(new Attribute('total',      false, false, true));
    pedido.addAttribute(new Attribute('id_cliente', false, true,  true));

    const producto = new Entity('PRODUCTO', 360, 340);
    producto.addAttribute(new Attribute('id_producto', true,  false, true));
    producto.addAttribute(new Attribute('nombre',      false, false, true));
    producto.addAttribute(new Attribute('precio',      false, false, true));
    producto.addAttribute(new Attribute('stock',       false, false, false));

    this.diagram.addEntity(cliente);
    this.diagram.addEntity(pedido);
    this.diagram.addEntity(producto);

    // Relaciones con cardinalidades explícitas en cada extremo
    this.diagram.addRelationship(new Relationship(cliente.id, pedido.id,   '1',    '0..N', 'realiza'));
    this.diagram.addRelationship(new Relationship(pedido.id,  producto.id, '0..N', '0..N', 'contiene'));

    this.renderAll();
    this.fitView();
  }

  /* ══════════════════════════════════════════
     HERRAMIENTAS
     ══════════════════════════════════════════ */
  _bindToolButtons() {
    document.querySelectorAll('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
    });
    document.getElementById('btn-fit').addEventListener('click',      () => this.fitView());
    document.getElementById('btn-zoom-in').addEventListener('click',  () => this.zoom(1.2));
    document.getElementById('btn-zoom-out').addEventListener('click', () => this.zoom(0.83));
  }

  setTool(tool) {
    this.currentTool = tool;
    this._updateToolUI();
    this._cancelRelPreview();
    this.deselect();
    const hints = {
      entity:   'Clic en el canvas para colocar una entidad',
      relation: 'Clic en la entidad ORIGEN para iniciar la relación',
      delete:   'Clic en una entidad o relación para eliminarla',
      select:   '',
    };
    this._showHint(hints[tool] || '');
  }

  _updateToolUI() {
    document.querySelectorAll('[data-tool]').forEach(b => {
      b.classList.toggle('active', b.dataset.tool === this.currentTool);
    });
    this.canvasArea.className = `canvas-area tool-${this.currentTool}`;
    const names = { select: 'Seleccionar', entity: 'Agregar Entidad',
                    relation: 'Agregar Relación', delete: 'Eliminar' };
    this.toolIndicator.textContent = names[this.currentTool] || this.currentTool;
  }

  _showHint(msg) {
    this.canvasHint.textContent = msg;
    this.canvasHint.classList.toggle('visible', !!msg);
  }

  /* ══════════════════════════════════════════
     TOPBAR
     ══════════════════════════════════════════ */
  _bindTopbarButtons() {
    document.getElementById('btn-new').addEventListener('click',         () => this.newDiagram());
    document.getElementById('btn-save').addEventListener('click',        () => this.saveProject());
    document.getElementById('btn-load').addEventListener('click',        () => document.getElementById('file-input').click());
    document.getElementById('btn-export-png').addEventListener('click',  () => this.exportPNG());
    document.getElementById('btn-export-json').addEventListener('click', () => this.exportJSON());
    document.getElementById('file-input').addEventListener('change', (e) => {
      if (e.target.files[0]) this.loadProject(e.target.files[0]);
      e.target.value = '';
    });
  }

  /* ══════════════════════════════════════════
     CANVAS: pan, zoom, clic
     ══════════════════════════════════════════ */
  _bindCanvasEvents() {
    // Clic en fondo vacío
    this.svgCanvas.addEventListener('click', (e) => {
      if (e.target === this.svgCanvas || e.target.id === 'grid-bg') {
        this.deselect();
        if (this.currentTool === 'entity') {
          const pt = this._screenToWorld(e.clientX, e.clientY);
          this.addEntity(pt.x - 100, pt.y - 50);
        }
        if (this.currentTool === 'relation' && this._relFromEntity) {
          // Clic en vacío durante relación → cancelar
          this._cancelRelPreview();
          this._showHint('Clic en la entidad ORIGEN para iniciar la relación');
        }
      }
    });

    // Pan con botón central
    this.canvasArea.addEventListener('mousedown', (e) => {
      if (e.button === 1) { this._startPan(e); e.preventDefault(); }
    });
    this.canvasArea.addEventListener('mousemove', (e) => {
      if (this._isPanning) this._doPan(e);
      if (this._relFromEntity) this._updateRelPreview(e);
    });
    this.canvasArea.addEventListener('mouseup', (e) => {
      if (e.button === 1) this._endPan();
    });

    // Zoom con rueda
    this.canvasArea.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._zoomAt(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY);
    }, { passive: false });
  }

  _startPan(e) {
    this._isPanning = true;
    this._panStart  = { x: e.clientX, y: e.clientY };
    this._panOrigin = { x: this.panX,  y: this.panY  };
    this.canvasArea.classList.add('panning');
  }
  _doPan(e) {
    this.panX = this._panOrigin.x + (e.clientX - this._panStart.x);
    this.panY = this._panOrigin.y + (e.clientY - this._panStart.y);
    this._applyTransform();
  }
  _endPan() {
    this._isPanning = false;
    this.canvasArea.classList.remove('panning');
  }

  _zoomAt(factor, cx, cy) {
    const pt = this._screenToWorld(cx, cy);
    this.scale = Math.min(Math.max(this.scale * factor, 0.15), 4);
    this.panX  = cx - pt.x * this.scale;
    this.panY  = cy - pt.y * this.scale;
    this._applyTransform();
    this._updateZoomLabel();
  }
  zoom(factor) {
    const r = this.canvasArea.getBoundingClientRect();
    this._zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
  }
  _applyTransform() {
    this.diagRoot.setAttribute('transform', `translate(${this.panX},${this.panY}) scale(${this.scale})`);
  }
  _updateZoomLabel() {
    this.zoomLabel.textContent = `${Math.round(this.scale * 100)}%`;
  }
  _screenToWorld(sx, sy) {
    const r = this.canvasArea.getBoundingClientRect();
    return { x: (sx - r.left - this.panX) / this.scale,
             y: (sy - r.top  - this.panY) / this.scale };
  }

  /* ══════════════════════════════════════════
     TECLADO
     ══════════════════════════════════════════ */
  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
      switch (e.key) {
        case 'v': case 'V': this.setTool('select');   break;
        case 'e': case 'E': this.setTool('entity');   break;
        case 'r': case 'R': this.setTool('relation'); break;
        case 'Delete': case 'Backspace':
          if (this.selectedType === 'entity')       this.deleteEntity(this.selectedId);
          if (this.selectedType === 'relationship') this.deleteRelationship(this.selectedId);
          break;
        case 'Escape':
          this.setTool('select');
          this.deselect();
          this._cancelRelPreview();
          break;
      }
    });
  }

  /* ══════════════════════════════════════════
     ENTIDADES
     ══════════════════════════════════════════ */
  addEntity(x = 100, y = 100) {
    const entity = new Entity(`ENTIDAD_${this.diagram.entities.length + 1}`, x, y);
    this.diagram.addEntity(entity);
    const el = SVGEntityRenderer.render(entity, this);
    this.diagRoot.appendChild(el);
    this._attachEntityRelationListener(el, entity);
    // Auto-editar nombre
    const titleEl = el.querySelector('.entity-title');
    if (titleEl) setTimeout(() => this.startInlineEditTitle(entity, titleEl, el), 50);
    return entity;
  }

  deleteEntity(id) {
    this.diagram.removeEntity(id);
    this.renderAll();
    this.deselect();
  }

  /* ══════════════════════════════════════════
     RELACIONES — FLUJO DE CREACIÓN
     1. Clic en entidad origen → startRelationFrom()
     2. Preview animado mientras el mouse se mueve
     3. Clic en entidad destino → _completeRelation()
     4. Se abre el modal para nombre + cardinalidades
     5. Confirmar → se crea el objeto Relationship
     ══════════════════════════════════════════ */

  /** Paso 1: el usuario hizo clic en la entidad origen */
  startRelationFrom(entity, mouseEvent) {
    if (this._relFromEntity) {
      // Si ya había una entidad origen, el segundo clic es el destino
      if (entity.id !== this._relFromEntity.id) {
        this._completeRelation(entity);
      }
      return;
    }

    this._relFromEntity = entity;
    const cx = entity.x + entity.width  / 2;
    const cy = entity.y + entity.height / 2;

    // Línea de preview punteada
    this._relPreviewLine = svgEl('line', {
      class: 'rel-preview', x1: cx, y1: cy, x2: cx, y2: cy,
    });
    this.diagRoot.appendChild(this._relPreviewLine);

    this._showHint(`Origen: ${entity.name} — ahora clic en la entidad DESTINO`);
  }

  /** Paso 2 (mousemove): actualiza la línea de preview */
  _updateRelPreview(e) {
    if (!this._relFromEntity || !this._relPreviewLine) return;
    const ent   = this._relFromEntity;
    const world = this._screenToWorld(e.clientX, e.clientY);
    const port  = ent.getNearestPort(world);
    this._relPreviewLine.setAttribute('x1', port.x);
    this._relPreviewLine.setAttribute('y1', port.y);
    this._relPreviewLine.setAttribute('x2', world.x);
    this._relPreviewLine.setAttribute('y2', world.y);
  }

  /** Cancela la preview */
  _cancelRelPreview() {
    this._relFromEntity = null;
    if (this._relPreviewLine) { this._relPreviewLine.remove(); this._relPreviewLine = null; }
  }

  /** Paso 3: el usuario hizo clic en la entidad destino */
  _completeRelation(toEntity) {
    if (!this._relFromEntity) return;
    const fromEntity = this._relFromEntity;
    this._cancelRelPreview();

    if (fromEntity.id === toEntity.id) {
      this._showHint('Selecciona una entidad diferente como destino');
      return;
    }

    this._editingRel = null; // nueva relación
    this.openRelModal(fromEntity.id, toEntity.id, null);
  }

  deleteRelationship(id) {
    this.diagram.removeRelationship(id);
    this.renderAll();
    this.deselect();
  }

  /* ══════════════════════════════════════════
     MODAL DE RELACIÓN
     Maneja tanto creación como edición.
     ══════════════════════════════════════════ */
  _bindRelModal() {
    const modal   = document.getElementById('rel-modal');
    const close   = document.getElementById('rel-modal-close');
    const cancel  = document.getElementById('rel-modal-cancel');
    const confirm = document.getElementById('rel-modal-confirm');

    close.addEventListener('click',  () => this._closeRelModal());
    cancel.addEventListener('click', () => this._closeRelModal());
    modal.addEventListener('click',  (e) => { if (e.target === modal) this._closeRelModal(); });

    // Selección de cardinalidad — grupos independientes
    ['card-from-group', 'card-to-group'].forEach(groupId => {
      document.getElementById(groupId).addEventListener('click', (e) => {
        const btn = e.target.closest('.card-sel-btn');
        if (!btn) return;
        document.getElementById(groupId)
          .querySelectorAll('.card-sel-btn')
          .forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this._updateRelPreviewBar();
      });
    });

    // Actualizar preview al cambiar selects o label
    document.getElementById('rel-from').addEventListener('change',  () => this._updateRelPreviewBar());
    document.getElementById('rel-to').addEventListener('change',    () => this._updateRelPreviewBar());
    document.getElementById('rel-label').addEventListener('input',  () => this._updateRelPreviewBar());

    // Confirmar
    confirm.addEventListener('click', () => this._confirmRelModal());
  }

  /**
   * Abre el modal.
   * @param {string}            fromId   ID entidad origen
   * @param {string}            toId     ID entidad destino
   * @param {Relationship|null} relEdit  null = nueva, objeto = editar existente
   */
  openRelModal(fromId = null, toId = null, relEdit = null) {
    this._editingRel = relEdit;

    const modal    = document.getElementById('rel-modal');
    const fromSel  = document.getElementById('rel-from');
    const toSel    = document.getElementById('rel-to');
    const labelInp = document.getElementById('rel-label');
    const titleEl  = document.getElementById('rel-modal-title');
    const confirmBtn = document.getElementById('rel-modal-confirm');

    titleEl.textContent  = relEdit ? 'Editar Relación' : 'Nueva Relación';
    confirmBtn.textContent = relEdit ? 'Guardar Cambios' : 'Crear Relación';

    // Poblar selects de entidades
    const opts = this.diagram.entities.map(e =>
      `<option value="${e.id}">${e.name}</option>`
    ).join('');
    fromSel.innerHTML = opts;
    toSel.innerHTML   = opts;

    if (fromId) fromSel.value = fromId;
    if (toId)   toSel.value   = toId;

    // Valores por defecto o de la relación en edición
    const defCardFrom = relEdit ? relEdit.cardFrom : '1';
    const defCardTo   = relEdit ? relEdit.cardTo   : '0..N';
    labelInp.value    = relEdit ? (relEdit.label || '') : '';

    this._setCardSelection('card-from-group', defCardFrom);
    this._setCardSelection('card-to-group',   defCardTo);

    this._updateRelPreviewBar();
    modal.classList.remove('hidden');

    // Focus al campo de nombre
    setTimeout(() => labelInp.focus(), 80);
  }

  /** Activa el botón correcto en un grupo de cardinalidades */
  _setCardSelection(groupId, value) {
    const group = document.getElementById(groupId);
    group.querySelectorAll('.card-sel-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.value === value);
    });
  }

  /** Lee la cardinalidad seleccionada en un grupo */
  _getCardSelection(groupId) {
    const btn = document.getElementById(groupId).querySelector('.card-sel-btn.selected');
    return btn ? btn.dataset.value : '1';
  }

  /** Actualiza la barra de preview ENTIDAD (card) ——nombre—— (card) ENTIDAD */
  _updateRelPreviewBar() {
    const fromId  = document.getElementById('rel-from').value;
    const toId    = document.getElementById('rel-to').value;
    const label   = document.getElementById('rel-label').value.trim() || '···';
    const cardFrom = this._getCardSelection('card-from-group');
    const cardTo   = this._getCardSelection('card-to-group');

    const fromEnt = this.diagram.getEntity(fromId);
    const toEnt   = this.diagram.getEntity(toId);

    document.getElementById('rpb-from-name').textContent = fromEnt ? fromEnt.name : '—';
    document.getElementById('rpb-to-name').textContent   = toEnt   ? toEnt.name   : '—';
    document.getElementById('rpb-from-card').textContent = cardFrom;
    document.getElementById('rpb-to-card').textContent   = cardTo;
    document.getElementById('rpb-label-preview').textContent = label;

    // Colorear el badge destino diferente
    document.getElementById('rpb-to-card').className = 'rpb-card dest';
  }

  /** Confirma la creación o edición de la relación */
  _confirmRelModal() {
    const fromId   = document.getElementById('rel-from').value;
    const toId     = document.getElementById('rel-to').value;
    const label    = document.getElementById('rel-label').value.trim();
    const cardFrom = this._getCardSelection('card-from-group');
    const cardTo   = this._getCardSelection('card-to-group');

    if (!fromId || !toId) { alert('Selecciona las entidades'); return; }
    if (fromId === toId)  { alert('Las entidades deben ser distintas'); return; }

    if (this._editingRel) {
      // Edición: actualizar objeto existente y re-renderizar
      this._editingRel.fromId   = fromId;
      this._editingRel.toId     = toId;
      this._editingRel.cardFrom = cardFrom;
      this._editingRel.cardTo   = cardTo;
      this._editingRel.label    = label;
      this.renderAll();
    } else {
      // Creación: nuevo objeto
      const rel = new Relationship(fromId, toId, cardFrom, cardTo, label);
      this.diagram.addRelationship(rel);
      this._renderOneRelationship(rel);
    }

    this._closeRelModal();
    // Volver a modo selección sin llamar _cancelRelPreview (la preview ya fue
    // eliminada en _completeRelation; llamarla de nuevo causaría NotFoundError).
    this.currentTool = 'select';
    this._updateToolUI();
    this._showHint('');
  }

  _closeRelModal() {
    document.getElementById('rel-modal').classList.add('hidden');
    this._editingRel = null;
  }

  /* ══════════════════════════════════════════
     SELECCIÓN
     ══════════════════════════════════════════ */
  selectElement(type, id) {
    this.deselect();
    this.selectedId   = id;
    this.selectedType = type;
    const sel = type === 'entity'
      ? this.diagRoot.querySelector(`[data-id="${id}"]`)
      : this.diagRoot.querySelector(`[data-rel-id="${id}"]`);
    if (sel) sel.classList.add('selected');
  }

  deselect() {
    this.selectedId = null; this.selectedType = null;
    this.diagRoot.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
  }

  /* ══════════════════════════════════════════
     EDICIÓN INLINE DEL NOMBRE DE ENTIDAD
     ══════════════════════════════════════════ */
  startInlineEditTitle(entity, titleEl, groupEl) {
    const bbox = titleEl.getBoundingClientRect();
    const input = document.createElement('input');
    input.type      = 'text';
    input.value     = entity.name;
    input.className = 'svg-inline-input';
    input.style.left      = bbox.left + 'px';
    input.style.top       = (bbox.top - 4) + 'px';
    input.style.width     = (entity.width * this.scale) + 'px';
    input.style.textAlign = 'center';
    document.body.appendChild(input);
    input.focus(); input.select();

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
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') input.remove();
    });
  }

  /* ══════════════════════════════════════════
     EDITOR DE ATRIBUTOS (POPOVER)
     ══════════════════════════════════════════ */
  openAttrEditor(entity, attr, groupEl) {
    clearPopovers();
    const isNew = !attr;
    if (isNew) attr = new Attribute('', false, false, false);

    const pop = document.createElement('div');
    pop.className = 'attr-popover';

    const rect = groupEl.getBoundingClientRect();
    pop.style.left = (rect.right + 8) + 'px';
    pop.style.top  = rect.top + 'px';
    pop.innerHTML = `
      <h4>${isNew ? 'Nuevo Atributo' : 'Editar Atributo'}</h4>
      <div class="attr-popover-row">
        <input type="text" id="ap-name" placeholder="nombre_atributo" value="${attr.name}" />
      </div>
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
    if (!isNew) {
      pop.querySelector('#ap-del').addEventListener('click', () => {
        entity.removeAttribute(attr.id);
        this._refreshEntity(entity);
        pop.remove();
      });
    }
    pop.querySelector('#ap-save').addEventListener('click', () => {
      const name = pop.querySelector('#ap-name').value.trim();
      if (!name) { pop.querySelector('#ap-name').focus(); return; }
      attr.name = name;
      attr.pk   = pop.querySelector('#ap-pk').checked;
      attr.fk   = pop.querySelector('#ap-fk').checked;
      attr.nn   = pop.querySelector('#ap-nn').checked;
      if (isNew) entity.addAttribute(attr);
      this._refreshEntity(entity);
      pop.remove();
    });
    pop.querySelector('#ap-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  pop.querySelector('#ap-save').click();
      if (e.key === 'Escape') pop.remove();
    });
    setTimeout(() => {
      const dismiss = (e) => {
        if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', dismiss); }
      };
      document.addEventListener('mousedown', dismiss);
    }, 100);
    requestAnimationFrame(() => {
      const pr = pop.getBoundingClientRect();
      if (pr.right > window.innerWidth)   pop.style.left = (rect.left - pr.width - 8) + 'px';
      if (pr.bottom > window.innerHeight) pop.style.top  = (window.innerHeight - pr.height - 10) + 'px';
    });
  }

  _refreshEntity(entity) {
    const old = this.diagRoot.querySelector(`[data-id="${entity.id}"]`);
    if (old) {
      const neu = SVGEntityRenderer.render(entity, this);
      this._attachEntityRelationListener(neu, entity);
      this.diagRoot.replaceChild(neu, old);
    }
    this.updateRelationships();
  }

  /* ══════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════ */

  /** Renderiza todo el diagrama desde cero */
  renderAll() {
    while (this.diagRoot.firstChild) this.diagRoot.removeChild(this.diagRoot.firstChild);

    // Relaciones primero (debajo de las entidades)
    this.diagram.relationships.forEach(rel => this._renderOneRelationship(rel));

    // Entidades encima
    this.diagram.entities.forEach(entity => {
      const el = SVGEntityRenderer.render(entity, this);
      this._attachEntityRelationListener(el, entity);
      this.diagRoot.appendChild(el);
    });
  }

  /**
   * Renderiza una sola relación y la inserta ANTES de las entidades
   * para que quede debajo en el orden Z.
   */
  _renderOneRelationship(rel) {
    const from = this.diagram.getEntity(rel.fromId);
    const to   = this.diagram.getEntity(rel.toId);
    if (!from || !to) return;

    const el = SVGRelationRenderer.render(rel, from, to, this);
    const firstEntity = this.diagRoot.querySelector('.entity-group');
    if (firstEntity) this.diagRoot.insertBefore(el, firstEntity);
    else             this.diagRoot.appendChild(el);
  }

  /**
   * Recalcula la geometría de TODAS las relaciones.
   * Llamado cada vez que una entidad se mueve (drag).
   */
  updateRelationships() {
    this.diagram.relationships.forEach(rel => {
      const g    = this.diagRoot.querySelector(`[data-rel-id="${rel.id}"]`);
      const from = this.diagram.getEntity(rel.fromId);
      const to   = this.diagram.getEntity(rel.toId);
      if (g && from && to) SVGRelationRenderer.update(g, rel, from, to);
    });
  }

  /**
   * Adjunta el listener que permite usar una entidad como DESTINO
   * cuando el usuario está en modo relación y ya seleccionó el origen.
   */
  _attachEntityRelationListener(el, entity) {
    el.removeEventListener('mousedown', el._relListener);
    el._relListener = (e) => {
      if (this.currentTool === 'relation' && this._relFromEntity) {
        e.stopPropagation();
        this._completeRelation(entity);
      }
    };
    el.addEventListener('mousedown', el._relListener);
  }

  /* ══════════════════════════════════════════
     VISTA
     ══════════════════════════════════════════ */
  fitView() {
    if (!this.diagram.entities.length) return;
    const pad = 60;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.diagram.entities.forEach(e => {
      minX = Math.min(minX, e.x);         minY = Math.min(minY, e.y);
      maxX = Math.max(maxX, e.x+e.width); maxY = Math.max(maxY, e.y+e.height);
    });
    const cW = maxX - minX + pad * 2;
    const cH = maxY - minY + pad * 2;
    const r  = this.canvasArea.getBoundingClientRect();
    this.scale = Math.max(Math.min(r.width / cW, r.height / cH, 1.5), 0.15);
    this.panX  = (r.width  - cW * this.scale) / 2 - (minX - pad) * this.scale;
    this.panY  = (r.height - cH * this.scale) / 2 - (minY - pad) * this.scale;
    this._applyTransform();
    this._updateZoomLabel();
  }

  /* ══════════════════════════════════════════
     GUARDAR / CARGAR / EXPORTAR
     ══════════════════════════════════════════ */
  newDiagram() {
    if (this.diagram.entities.length > 0) {
      if (!confirm('¿Crear un nuevo diagrama? Se perderán los cambios no guardados.')) return;
    }
    this.diagram = new Diagram();
    this.deselect();
    this.renderAll();
  }

  saveProject() {
    this._download(JSON.stringify(this.diagram.toJSON(), null, 2), 'erflow-diagram.json', 'application/json');
  }

  exportJSON() { this.saveProject(); }

  loadProject(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        this.diagram = Diagram.fromJSON(JSON.parse(e.target.result));
        this.renderAll();
        this.fitView();
      } catch (err) {
        alert('Error al cargar: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  exportPNG() {
    if (!this.diagram.entities.length) { alert('No hay entidades para exportar'); return; }
    const pad = 60;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.diagram.entities.forEach(e => {
      minX = Math.min(minX, e.x);         minY = Math.min(minY, e.y);
      maxX = Math.max(maxX, e.x+e.width); maxY = Math.max(maxY, e.y+e.height);
    });
    const W = maxX - minX + pad * 2;
    const H = maxY - minY + pad * 2;
    const SC = 2;

    const clone = this.svgCanvas.cloneNode(true);
    clone.setAttribute('width',  W * SC);
    clone.setAttribute('height', H * SC);
    clone.querySelector('#diagram-root').setAttribute('transform',
      `translate(${(pad - minX) * SC}, ${(pad - minY) * SC}) scale(${SC})`);

    const bg = svgEl('rect', { width: '100%', height: '100%', fill: '#0f1117' });
    clone.insertBefore(bg, clone.firstChild);
    const gridBg = clone.querySelector('#grid-bg');
    if (gridBg) gridBg.setAttribute('fill', 'none');

    const style = document.createElement('style');
    style.textContent = `
      text { font-family: 'JetBrains Mono', monospace; }
      .entity-box    { fill:#161b25; stroke:#3a4560; stroke-width:1.5; }
      .entity-header { fill:#1d2433; }
      .entity-title  { font-size:13px; font-weight:600; fill:#e8ecf4; }
      .rel-line      { stroke:#4f9eff; stroke-width:1.8; fill:none; opacity:0.85; }
      .cf-mark       { stroke:#4f9eff; stroke-width:1.8; fill:none; }
      .cf-mark-dest  { stroke:#a78bfa; stroke-width:1.8; fill:none; }
      .rel-name-label{ font-size:10px; fill:#8896b0; }
      .attr-sep      { stroke:#2a3347; stroke-width:0.5; }
    `;
    clone.insertBefore(style, clone.firstChild);

    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = W * SC; canvas.height = H * SC;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(png => this._download(URL.createObjectURL(png), 'erflow-diagram.png', null, true), 'image/png');
    };
    img.src = url;
  }

  _download(content, filename, type, isUrl = false) {
    const a = document.createElement('a');
    a.href     = isUrl ? content : `data:${type};charset=utf-8,${encodeURIComponent(content)}`;
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
}

/* ─────────────────────────────────────────────
   BOOTSTRAP
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  window.erApp = new App();
});