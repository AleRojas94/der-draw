import { svgEl } from '../utils/svg.js';
import { CrowsFootRenderer } from './CrowsFootRenderer.js';
import { Relationship } from '../models/Relationship.js';

export class SVGRelationRenderer {
  static render(rel, fromEnt, toEnt, app) {
    const g = svgEl('g');
    g.setAttribute('class', 'rel-group');
    g.setAttribute('data-rel-id', rel.id);
    SVGRelationRenderer.update(g, rel, fromEnt, toEnt);
    g.addEventListener('click', (e) => {
      if (app.currentTool === 'delete') { app.deleteRelationship(rel.id); return; }
      e.stopPropagation(); app.selectElement('relationship', rel.id);
    });
    g.addEventListener('dblclick', (e) => {
      e.stopPropagation(); app.openRelModal(rel.fromId, rel.toId, rel);
    });
    return g;
  }

  static update(g, rel, fromEnt, toEnt, fromPort = null, toPort = null) {
    while (g.firstChild) g.removeChild(g.firstChild);

    // Relación autoreferenciada (misma entidad en ambos extremos)
    if (rel.fromId === rel.toId) {
      SVGRelationRenderer._updateSelfRef(g, rel, fromEnt);
      return;
    }

    const fromCenter = { x: fromEnt.x + fromEnt.width/2,  y: fromEnt.y + fromEnt.height/2 };
    const toCenter   = { x: toEnt.x   + toEnt.width/2,    y: toEnt.y   + toEnt.height/2   };
    // Usar ports pre-calculados (con offset) si se proporcionan, sino calcular normalmente
    fromPort = fromPort || fromEnt.getNearestPort(toCenter);
    toPort   = toPort   || toEnt.getNearestPort(fromCenter);

    // Área de clic invisible
    g.appendChild(svgEl('line', {
      x1: fromPort.x, y1: fromPort.y, x2: toPort.x, y2: toPort.y,
      stroke: 'transparent', 'stroke-width': '14', fill: 'none',
    }));

    // Línea visible (continua = identificadora, discontinua = regular)
    g.appendChild(svgEl('line', {
      x1: fromPort.x, y1: fromPort.y, x2: toPort.x, y2: toPort.y,
      class: rel.identifying ? 'rel-line rel-line-identifying' : 'rel-line rel-line-regular',
    }));

    CrowsFootRenderer.draw(g, Relationship.cardToType(rel.cardFrom), fromPort, toPort,   'cf-mark');
    CrowsFootRenderer.draw(g, Relationship.cardToType(rel.cardTo),   toPort,   fromPort, 'cf-mark-dest');

    SVGRelationRenderer._cardLabel(g, rel.cardFrom, fromPort, toPort,   false);
    SVGRelationRenderer._cardLabel(g, rel.cardTo,   toPort,   fromPort, true);

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

    SVGRelationRenderer._roleLabel(g, rel.roleFrom, fromPort, fromPort.side);
    SVGRelationRenderer._roleLabel(g, rel.roleTo,   toPort,   toPort.side);
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

  static _selfRefCardLabel(g, card, x, y, isDest) {
    const lbl = svgEl('text', {
      x, y,
      'dominant-baseline': 'middle', 'text-anchor': 'middle',
      'font-family': 'JetBrains Mono, monospace', 'font-size': '10', 'font-weight': '700',
      fill: isDest ? 'var(--accent2)' : 'var(--accent)',
    });
    lbl.textContent = card;
    g.appendChild(lbl);
  }

  /**
   * Relación autoreferenciada con segmentos ortogonales.
   * Lazo en la esquina inferior-derecha:
   *   portBottom → A → B → C → portRight
   */
  static _updateSelfRef(g, rel, entity) {
    const { x: ex, y: ey, width: W, height: H } = entity;
    const GAP = 36;

    // El lazo se ancla en la ESQUINA inferior-derecha, no en los centros de los lados.
    // Usamos el 80% del ancho (sobre el borde inferior) y el 80% del alto (sobre el borde derecho),
    // dejando los centros de ambos lados libres para relaciones normales.
    const CORNER = 0.80;

    const portBottom = { x: ex + W * CORNER, y: ey + H, side: 'bottom' };
    const portRight  = { x: ex + W,          y: ey + H * CORNER, side: 'right' };

    const A = { x: ex + W * CORNER, y: ey + H + GAP };
    const B = { x: ex + W + GAP,    y: ey + H + GAP };
    const C = { x: ex + W + GAP,    y: ey + H * CORNER };

    const points = [portBottom, A, B, C, portRight]
      .map(p => `${p.x},${p.y}`)
      .join(' ');

    g.appendChild(svgEl('polyline', {
      points, fill: 'none', stroke: 'transparent', 'stroke-width': '14',
    }));

    g.appendChild(svgEl('polyline', {
      points,
      class: rel.identifying ? 'rel-line rel-line-identifying' : 'rel-line rel-line-regular',
      fill: 'none',
    }));

    const anchorBottom = A;
    const anchorRight  = C;

    CrowsFootRenderer.draw(g, Relationship.cardToType(rel.cardFrom), portBottom, anchorBottom, 'cf-mark');
    CrowsFootRenderer.draw(g, Relationship.cardToType(rel.cardTo),   portRight,  anchorRight,  'cf-mark-dest');

    SVGRelationRenderer._selfRefCardLabel(g, rel.cardFrom,
      portBottom.x - 18, portBottom.y + 14, false);
    SVGRelationRenderer._selfRefCardLabel(g, rel.cardTo,
      portRight.x + 14,  portRight.y - 14,  true);

    const labelX = (A.x + B.x) / 2;
    const labelY = A.y + 12;
    if (rel.label) {
      const lw = Math.max(rel.label.length * 6.5, 52);
      g.appendChild(svgEl('rect', {
        x: labelX - lw/2, y: labelY - 8, width: lw, height: 15, rx: 3,
        fill: 'var(--bg2)', opacity: '0.95',
      }));
      const lbl = svgEl('text', {
        class: 'rel-name-label', x: labelX, y: labelY,
        'font-family': 'JetBrains Mono, monospace', 'font-size': '10',
      });
      lbl.textContent = rel.label;
      g.appendChild(lbl);
    }

    SVGRelationRenderer._roleLabel(g, rel.roleFrom, portBottom, 'bottom');
    SVGRelationRenderer._roleLabel(g, rel.roleTo,   portRight,  'right');
  }

  /**
   * Calcula un punto distribuido a lo largo de un lado de una entidad.
   * Divide el lado en (count+1) segmentos iguales y devuelve el i-ésimo punto.
   * Mantiene un margen del 15% en cada extremo para no llegar a las esquinas.
   *
   * @param {Entity} entity  - La entidad
   * @param {string} side    - 'top'|'bottom'|'left'|'right'
   * @param {number} index   - Índice de esta relación en el grupo (0-based)
   * @param {number} count   - Total de relaciones en este lado
   * @returns {{ x, y, side }}
   */
  static _distributedPort(entity, side, index, count, restrictCorner = false) {
    // MARGIN normal: 15% en cada extremo
    // restrictCorner: el lazo ocupa el 80% final → limitar al primer 70% del lado
    const MARGIN_START = 0.15;
    const MARGIN_END   = restrictCorner ? 0.30 : 0.15; // más margen al final si hay lazo
    const t = MARGIN_START + (1 - MARGIN_START - MARGIN_END) * (index / (count - 1 || 1));

    const { x, y, width: W, height: H } = entity;
    let px, py;

    if (side === 'top'    || side === 'bottom') {
      px = x + W * t;
      py = side === 'top' ? y : y + H;
    } else {
      px = side === 'left' ? x : x + W;
      py = y + H * t;
    }
    return { x: px, y: py, side };
  }

  static _roleLabel(g, role, port, side) {
    if (!role) return;
    const offsets = {
      right:  { dx:  8, dy: -14 },
      left:   { dx: -8, dy: -14 },
      bottom: { dx: 14, dy:  12 },
      top:    { dx: 14, dy: -12 },
    };
    const off = offsets[side] || { dx: 8, dy: -14 };
    const lbl = svgEl('text', {
      x: port.x + off.dx, y: port.y + off.dy,
      'dominant-baseline': 'middle',
      'text-anchor': side === 'right' ? 'start' : (side === 'left' ? 'end' : 'middle'),
      'font-family': 'JetBrains Mono, monospace',
      'font-size': '9',
      'font-style': 'italic',
      fill: 'var(--fg-subtle)',
    });
    lbl.textContent = '«' + role + '»';
    g.appendChild(lbl);
  }
}
