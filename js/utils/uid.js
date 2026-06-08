/** Genera un ID único corto */
export function uid() {
  return '_' + Math.random().toString(36).slice(2, 10);
}
