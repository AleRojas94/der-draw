import { uid } from '../utils/uid.js';

/**
 * Jerarquía de Generalización (notación Mannino).
 *
 * Visual:
 *        SUPERTIPO
 *            ↑
 *            |
 *          [D,C]          ← restricciones en el punto de unión
 *    ───────────────
 *    |             |
 *  SUB1          SUB2
 *
 * disjoint = D  (los subtipos son disjuntos entre sí)
 * complete = C  (la unión cubre todo el supertipo)
 */
export class Generalization {
  constructor(supertypeId, subtypeIds = [], disjoint = false, complete = false) {
    this.id          = uid();
    this.supertypeId = supertypeId;
    this.subtypeIds  = [...subtypeIds];
    this.disjoint    = disjoint;
    this.complete    = complete;
  }

  /** Etiqueta D, C ó D,C que se muestra en el nodo de unión */
  get constraintLabel() {
    if (this.disjoint && this.complete) return 'D,C';
    if (this.disjoint)  return 'D';
    if (this.complete)  return 'C';
    return '';
  }

  toJSON() {
    return {
      id:          this.id,
      supertypeId: this.supertypeId,
      subtypeIds:  this.subtypeIds,
      disjoint:    this.disjoint,
      complete:    this.complete,
    };
  }

  static fromJSON(d) {
    const g = new Generalization(d.supertypeId, d.subtypeIds || [], d.disjoint === true, d.complete === true);
    g.id = d.id;
    return g;
  }
}
