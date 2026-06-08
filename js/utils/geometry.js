/** Convierte coordenadas DOM al espacio del SVG transformado */
export function domToSVGPoint(svgElement, clientX, clientY) {
  const pt = svgElement.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(svgElement.getScreenCTM().inverse());
}
