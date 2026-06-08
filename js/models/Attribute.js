import { uid } from '../utils/uid.js';

export class Attribute {
  constructor(name = 'atributo', pk = false, fk = false, nn = false, dataType = '', length = '', unique = false) {
    this.id = uid(); this.name = name; this.pk = pk; this.fk = fk; this.nn = nn;
    this.dataType = dataType;
    this.length   = length;
    this.unique   = unique;  // restricción UNIQUE
  }

  get typeLabel() {
    if (!this.dataType) return '';
    const needsLen = ['Varchar','NVarchar','Char','NChar','Binary'].includes(this.dataType);
    return needsLen && this.length ? `${this.dataType}(${this.length})` : this.dataType;
  }

  toJSON() {
    return { id: this.id, name: this.name, pk: this.pk, fk: this.fk, nn: this.nn,
             unique: this.unique, dataType: this.dataType, length: this.length };
  }

  static fromJSON(d) {
    const a = new Attribute(d.name, d.pk, d.fk, d.nn, d.dataType || '', d.length || '', d.unique === true);
    a.id = d.id;
    return a;
  }
}