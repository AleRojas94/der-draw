import { Entity }           from './Entity.js';
import { Relationship }     from './Relationship.js';
import { Generalization }   from './Generalization.js';

export class Diagram {
  constructor() {
    this.entities        = [];
    this.relationships   = [];
    this.generalizations = [];
  }

  addEntity(e)       { this.entities.push(e); return e; }
  getEntity(id)      { return this.entities.find(e => e.id === id) || null; }
  addRelationship(r) { this.relationships.push(r); return r; }

  addGeneralization(g)    { this.generalizations.push(g); return g; }
  getGeneralization(id)   { return this.generalizations.find(g => g.id === id) || null; }
  removeGeneralization(id){ this.generalizations = this.generalizations.filter(g => g.id !== id); }

  removeEntity(id) {
    this.entities        = this.entities.filter(e => e.id !== id);
    this.relationships   = this.relationships.filter(r => r.fromId !== id && r.toId !== id);
    // Limpiar generalizations que referencian la entidad eliminada
    this.generalizations = this.generalizations
      .map(g => {
        if (g.supertypeId === id) return null; // eliminar toda la jerarquía
        g.subtypeIds = g.subtypeIds.filter(sid => sid !== id);
        return g.subtypeIds.length === 0 ? null : g; // sin subtipos → eliminar
      })
      .filter(Boolean);
  }

  removeRelationship(id) { this.relationships = this.relationships.filter(r => r.id !== id); }

  toJSON() {
    return {
      version:         '2.0',
      entities:        this.entities.map(e => e.toJSON()),
      relationships:   this.relationships.map(r => r.toJSON()),
      generalizations: this.generalizations.map(g => g.toJSON()),
    };
  }

  static fromJSON(d) {
    const diag = new Diagram();
    diag.entities        = (d.entities        || []).map(e => Entity.fromJSON(e));
    diag.relationships   = (d.relationships   || []).map(r => Relationship.fromJSON(r));
    diag.generalizations = (d.generalizations || []).map(g => Generalization.fromJSON(g)); // retrocompat
    return diag;
  }
}

