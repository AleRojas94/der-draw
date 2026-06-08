import { svgEl } from '../utils/svg.js';

/**
 * Dibuja símbolos Crow's Foot en un extremo de una relación.
 *
 * Convención:
 * • port   = punto donde la línea toca la entidad.
 * • anchor = punto opuesto desde donde viene la línea.
 * • angle  = atan2(port - anchor) → apunta HACIA la entidad.
 * • inward(d) = port - dx*d → aleja el marcador del borde hacia la línea.
 */
export class CrowsFootRenderer {
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

    const inward = (d) => ({ x: port.x - dx * d, y: port.y - dy * d });

    const perp = (origin, half) => ({
      x1: origin.x + (-dy) * half, y1: origin.y + dx * half,
      x2: origin.x - (-dy) * half, y2: origin.y - dx * half,
    });

    if (type === 'one') {
      const pp1 = perp(inward(BAR_OFFSET - 12), TICK);
      mk('line', { x1: pp1.x1, y1: pp1.y1, x2: pp1.x2, y2: pp1.y2 });
      const pp2 = perp(inward(BAR_OFFSET), TICK);
      mk('line', { x1: pp2.x1, y1: pp2.y1, x2: pp2.x2, y2: pp2.y2 });
    }
    else if (type === 'zero_one') {
      const pp = perp(inward(BAR_OFFSET - 12), TICK);
      mk('line', { x1: pp.x1, y1: pp.y1, x2: pp.x2, y2: pp.y2 });
      const cp = inward(CIR_OFFSET);
      mk('circle', { cx: cp.x, cy: cp.y, r: 5 });
    }
    else if (type === 'one_many') {
      const tip = inward(CROW_BASE);
      mk('line', { x1: port.x,              y1: port.y,             x2: tip.x, y2: tip.y });
      mk('line', { x1: port.x + (-dy)*TICK, y1: port.y + dx*TICK,  x2: tip.x, y2: tip.y });
      mk('line', { x1: port.x - (-dy)*TICK, y1: port.y - dx*TICK,  x2: tip.x, y2: tip.y });
      const pp = perp(inward(BAR_OFFSET), TICK);
      mk('line', { x1: pp.x1, y1: pp.y1, x2: pp.x2, y2: pp.y2 });
    }
    else if (type === 'zero_many') {
      const tip = inward(CROW_BASE);
      mk('line', { x1: port.x,              y1: port.y,             x2: tip.x, y2: tip.y });
      mk('line', { x1: port.x + (-dy)*TICK, y1: port.y + dx*TICK,  x2: tip.x, y2: tip.y });
      mk('line', { x1: port.x - (-dy)*TICK, y1: port.y - dx*TICK,  x2: tip.x, y2: tip.y });
      const cp = inward(CIR_OFFSET);
      mk('circle', { cx: cp.x, cy: cp.y, r: 5 });
    }
  }
}
