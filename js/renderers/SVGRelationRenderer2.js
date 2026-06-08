import { svgEl } from '../utils/svg.js';

/**
 * SVGGeneralizationRenderer
 *
 * Dibuja una jerarquía de generalización siguiendo la notación Mannino:
 *
 *        SUPERTIPO
 *            ↑
 *            |
 *          [D,C]
 *    ───────────────────
 *    |         |       |
 *  SUB1      SUB2    SUB3
 *
 * Geometría:
 * - Línea horizontal que une los centros superiores de todos los subtipos.
 * - Línea vertical desde el punto medio de la horizontal hasta el borde
 *   inferior del supertipo.
 * - Punta de flecha (▲) en el extremo que toca el supertipo.
 * - Etiqueta D, C ó D,C en el nodo donde la vertical toca la horizontal.
 * - Línea vertical corta desde la horizontal hacia abajo hasta cada subtipo.
 */
export class SVGGeneralizationRenderer {

  static render(gen, diagram, app) {
    const g = svgEl('g');
    g.setAttribute('class', 'gen-group');
    g.setAttribute('data-gen-id', gen.id);

    SVGGeneralizationRenderer.update(g, gen, diagram);

    // Clic para seleccionar o eliminar
    g.addEventListener('click', (e) => {
      if (app.currentTool === 'delete') {
        app.deleteGeneralization(gen.id);
        return;
      }
      e.stopPropagation();
      app.selectElement('generalization', gen.id);
    });

    // Doble clic para editar restricciones
    g.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      app.openGenModal(gen);
    });

    return g;
  }

  /**
   * Recalcula y redibuja toda la geometría de la jerarquía.
   * Llamado en render() y cada vez que una entidad se mueve.
   */
  static update(g, gen, diagram) {
    while (g.firstChild) g.removeChild(g.firstChild);

    const superEnt = diagram.getEntity(gen.supertypeId);
    if (!superEnt) return;

    const subEnts = gen.subtypeIds
      .map(id => diagram.getEntity(id))
      .filter(Boolean);
    if (subEnts.length === 0) return;

    // ── Puntos de referencia ─────────────────────────────────────────────

    // Borde inferior del supertipo — aquí termina la flecha
    const superBottom = {
      x: superEnt.x + superEnt.width / 2,
      y: superEnt.y + superEnt.height,
    };

    // Centro superior de cada subtipo
    const subTops = subEnts.map(e => ({
      x: e.x + e.width / 2,
      y: e.y,
    }));

    // Extremos de la barra horizontal (determinados por los subtipos)
    const minX = Math.min(...subTops.map(p => p.x));
    const maxX = Math.max(...subTops.map(p => p.x));

    // Altura de la barra horizontal: 40px por encima del subtipo más alto
    const HBAR_OFFSET = 40;
    const minSubY = Math.min(...subTops.map(p => p.y));
    const hBarY   = minSubY - HBAR_OFFSET;

    // ── Geometría de la línea vertical ───────────────────────────────────
    //
    // El punto de anclaje superior es SIEMPRE el centro inferior del supertipo.
    // El punto de anclaje inferior es la intersección con la barra horizontal.
    //
    // Si el supertipo está desplazado respecto al centro de los subtipos,
    // la vertical baja desde superBottom hasta hBarY en la misma X del supertipo,
    // y luego la barra horizontal cubre de minX a maxX.
    //
    // Para conectar la vertical con la barra cuando no coinciden en X,
    // añadimos un segmento horizontal corto de superBottom.x a hBarMidX
    // solo si es necesario (cuando hay desalineación).

    const vertX = superBottom.x;           // X fija: siempre el centro del supertipo
    const ARROW_SIZE = 8;

    // Punto de unión de la vertical con la horizontal
    const junctionX = vertX;
    const junctionY = hBarY;

    // ── Línea vertical: supertipo → barra ────────────────────────────────
    g.appendChild(svgEl('line', {
      x1: vertX, y1: superBottom.y + ARROW_SIZE,
      x2: junctionX, y2: junctionY,
      class: 'gen-line',
    }));

    // ── Flecha apuntando al supertipo ─────────────────────────────────────
    const ax = vertX, ay = superBottom.y;
    g.appendChild(svgEl('polygon', {
      points: `${ax},${ay} ${ax - ARROW_SIZE/2},${ay + ARROW_SIZE} ${ax + ARROW_SIZE/2},${ay + ARROW_SIZE}`,
      class: 'gen-arrow',
    }));

    // ── Barra horizontal ─────────────────────────────────────────────────
    const hBarMinX = Math.min(minX, vertX);
    const hBarMaxX = Math.max(maxX, vertX);

    if (subEnts.length > 1 || hBarMinX !== hBarMaxX) {
      g.appendChild(svgEl('line', {
        x1: hBarMinX, y1: hBarY,
        x2: hBarMaxX, y2: hBarY,
        class: 'gen-line',
      }));
    }

    // ── Líneas verticales: barra → cada subtipo ───────────────────────────
    subTops.forEach(pt => {
      g.appendChild(svgEl('line', {
        x1: pt.x, y1: hBarY,
        x2: pt.x, y2: pt.y,
        class: 'gen-line',
      }));
    });

    // ── Área de clic invisible ────────────────────────────────────────────
    g.appendChild(svgEl('line', {
      x1: hBarMinX - 10, y1: hBarY,
      x2: hBarMaxX + 10, y2: hBarY,
      stroke: 'transparent', 'stroke-width': '14', fill: 'none',
    }));

    // ── Etiqueta D / C / D,C — se dibuja AL FINAL para quedar sobre las líneas ──
    const label = gen.constraintLabel;
    if (label) {
      const PAD_H = 6, PAD_V = 4;
      const lw = label.length * 6.5 + PAD_H * 2;
      const lh = 16;
      // Fondo opaco que tapa las líneas que pasan por debajo
      g.appendChild(svgEl('rect', {
        x: junctionX - lw/2, y: junctionY - lh/2,
        width: lw, height: lh, rx: 3,
        class: 'gen-constraint-bg',
      }));
      const lt = svgEl('text', {
        x: junctionX, y: junctionY,
        'dominant-baseline': 'middle',
        'text-anchor': 'middle',
        class: 'gen-constraint-label',
        'font-family': 'JetBrains Mono, monospace',
        'font-size': '10',
        'font-weight': '700',
      });
      lt.textContent = label;
      g.appendChild(lt);
    }
  }
}