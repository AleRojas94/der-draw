/**
 * Tutorial — Modal de ayuda + Tour paso a paso
 *
 * El modal tiene 5 tabs navegables con teclado y botones Anterior/Siguiente.
 * El tour resalta cada herramienta del sidebar con un tooltip explicativo.
 */
export class Tutorial {
  constructor() {
    this._currentTab = 0;
    this._tourStep   = 0;
    this._tourActive = false;
    this._highlight  = null;

    this._tabs = ['overview', 'entities', 'relations', 'generalization', 'tips'];

    this._tourSteps = [
      {
        target: '#tool-select',
        title: 'Seleccionar',
        desc: 'Usá esta herramienta para seleccionar, mover y editar entidades y relaciones. Es el modo predeterminado. Atajo: V.',
      },
      {
        target: '#tool-pan',
        title: 'Mover Entorno',
        desc: 'Arrastrá el canvas para navegar por el diagrama. También podés mantener presionado Espacio o H en cualquier momento para activarlo temporalmente sin cambiar de herramienta.',
      },
      {
        target: '#tool-entity',
        title: 'Agregar Entidad',
        desc: 'Hacé clic en el canvas para colocar una nueva entidad. Se abre automáticamente la edición del nombre. Luego usá "+ Agregar atributo" para completarla. Atajo: E.',
      },
      {
        target: '#tool-relation',
        title: 'Agregar Relación',
        desc: 'Clic en la entidad origen, luego clic en la entidad destino. Se abrirá el diálogo para configurar cardinalidades, nombre y roles. Para una relación autoreferenciada, hacé clic dos veces en la misma entidad. Atajo: R.',
      },
      {
        target: '#tool-generalization',
        title: 'Agregar Jerarquía',
        desc: 'Clic en el supertipo, luego en cada subtipo. Cuando termines, volvé a hacer clic en el supertipo para confirmar. Podés agregar restricciones D (Disjoint) y C (Complete). Atajo: G.',
      },
      {
        target: '#tool-delete',
        title: 'Eliminar',
        desc: 'Clic sobre cualquier entidad, relación o jerarquía para eliminarla. También podés seleccionar un elemento y presionar Delete.',
      },
      {
        target: '#btn-fit',
        title: 'Ajustar Vista',
        desc: 'Centra y ajusta el zoom para mostrar todo el diagrama en pantalla. Muy útil cuando tenés muchas entidades o el diagrama quedó fuera de la vista.',
      },
      {
        target: '#btn-load',
        title: 'Abrir archivo',
        desc: 'Abre un archivo .json guardado anteriormente. En Chrome y Edge usa el diálogo nativo del sistema operativo. En Firefox descarga de forma clásica.',
      },
      {
        target: '#btn-save',
        title: 'Guardar',
        desc: 'Si abriste un archivo, lo sobrescribe directamente sin preguntar. Si es un diagrama nuevo, te pide nombre y ubicación. Atajo de teclado: Ctrl+S (o ⌘+S en Mac).',
      },
      {
        target: '#btn-save-as',
        title: 'Guardar como',
        desc: 'Siempre pide nombre y ubicación, creando un archivo nuevo sin modificar el anterior. Ideal para guardar versiones distintas del mismo diagrama. Atajo: Ctrl+Shift+S.',
      },
      {
        target: '#btn-export-png',
        title: 'Exportar PNG',
        desc: 'Genera una imagen PNG de alta resolución (2×) del diagrama completo, con todos los colores y estilos correctos. Ideal para incluir en informes o presentaciones.',
      },
      {
        target: '#btn-export-json',
        title: 'JSON — Exportar copia',
        desc: 'Descarga una copia del diagrama en la carpeta Descargas sin diálogo de ubicación. Útil para hacer respaldos rápidos o compartir el archivo sin afectar el archivo de trabajo principal.',
      },
    ];

    this._init();
  }

  _init() {
    // Botón de ayuda en topbar
    document.getElementById('btn-tutorial')?.addEventListener('click', () => this.open());

    // Modal close
    document.getElementById('tutorial-modal-close')?.addEventListener('click',  () => this.close());
    document.getElementById('tutorial-close-btn')?.addEventListener('click',    () => this.close());
    document.getElementById('tutorial-modal')?.addEventListener('click', e => {
      if (e.target.id === 'tutorial-modal') this.close();
    });

    // Tabs
    document.querySelectorAll('.tut-tab').forEach((tab, i) => {
      tab.addEventListener('click', () => this._goToTab(i));
    });

    // Navegación con botones Anterior/Siguiente en el modal
    document.getElementById('tut-prev')?.addEventListener('click', () => this._goToTab(this._currentTab - 1));
    document.getElementById('tut-next')?.addEventListener('click', () => this._goToTab(this._currentTab + 1));

    // Iniciar tour desde el botón en la tab Overview
    document.getElementById('btn-start-tour')?.addEventListener('click', () => {
      this.close();
      setTimeout(() => this.startTour(), 200);
    });

    // Tour navigation
    document.getElementById('tour-prev')?.addEventListener('click', () => this._tourGo(this._tourStep - 1));
    document.getElementById('tour-next')?.addEventListener('click', () => {
      if (this._tourStep < this._tourSteps.length - 1) {
        this._tourGo(this._tourStep + 1);
      } else {
        this.endTour();
      }
    });

    // Cerrar tour con Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this._tourActive) this.endTour();
    });
  }

  // ── Modal ──────────────────────────────────────────────────────────────────

  open() {
    this._goToTab(0);
    document.getElementById('tutorial-modal')?.classList.remove('hidden');
  }

  close() {
    document.getElementById('tutorial-modal')?.classList.add('hidden');
  }

  _goToTab(index) {
    const total = this._tabs.length;
    index = Math.max(0, Math.min(total - 1, index));
    this._currentTab = index;

    // Activar tab button
    document.querySelectorAll('.tut-tab').forEach((t, i) => {
      t.classList.toggle('active', i === index);
    });

    // Mostrar panel correcto
    document.querySelectorAll('.tut-panel').forEach((p, i) => {
      p.classList.toggle('active', i === index);
    });

    // Actualizar indicador de página
    const indicator = document.getElementById('tut-page-indicator');
    if (indicator) indicator.textContent = `${index + 1} / ${total}`;

    // Botones anterior/siguiente
    const prev = document.getElementById('tut-prev');
    const next = document.getElementById('tut-next');
    if (prev) prev.disabled = index === 0;
    if (next) {
      next.textContent = index === total - 1 ? 'Finalizar →' : 'Siguiente →';
      next.disabled = false;
    }
  }

  // ── Tour ───────────────────────────────────────────────────────────────────

  startTour() {
    this._tourActive = true;
    this._tourStep   = 0;

    // Crear highlight
    this._highlight = document.createElement('div');
    this._highlight.className = 'tour-highlight';
    document.body.appendChild(this._highlight);

    document.getElementById('tour-overlay')?.classList.remove('hidden');
    document.getElementById('tour-tooltip')?.classList.remove('hidden');

    this._tourGo(0);
  }

  endTour() {
    this._tourActive = false;
    document.getElementById('tour-overlay')?.classList.add('hidden');
    document.getElementById('tour-tooltip')?.classList.add('hidden');
    this._highlight?.remove();
    this._highlight = null;
  }

  _tourGo(step) {
    const steps = this._tourSteps;
    step = Math.max(0, Math.min(steps.length - 1, step));
    this._tourStep = step;
    const s = steps[step];

    // Posicionar highlight sobre el elemento objetivo
    const target = document.querySelector(s.target);
    if (target && this._highlight) {
      const rect = target.getBoundingClientRect();
      const PAD  = 6;
      this._highlight.style.left   = (rect.left   - PAD) + 'px';
      this._highlight.style.top    = (rect.top    - PAD) + 'px';
      this._highlight.style.width  = (rect.width  + PAD*2) + 'px';
      this._highlight.style.height = (rect.height + PAD*2) + 'px';
    }

    // Actualizar contenido del tooltip
    const stepLbl = document.getElementById('tour-step-label');
    const title   = document.getElementById('tour-title');
    const desc    = document.getElementById('tour-desc');
    const counter = document.getElementById('tour-counter');
    const prevBtn = document.getElementById('tour-prev');
    const nextBtn = document.getElementById('tour-next');

    if (stepLbl) stepLbl.textContent = `Paso ${step + 1} de ${steps.length}`;
    if (title)   title.textContent   = s.title;
    if (desc)    desc.textContent    = s.desc;
    if (counter) counter.textContent = `${step + 1} / ${steps.length}`;
    if (prevBtn) prevBtn.disabled    = step === 0;
    if (nextBtn) nextBtn.textContent = step === steps.length - 1 ? 'Finalizar ✓' : 'Siguiente →';

    // Posicionar tooltip cerca del elemento resaltado
    this._positionTooltip(target);
  }

  _positionTooltip(target) {
    const tooltip = document.getElementById('tour-tooltip');
    if (!tooltip) return;

    const MARGIN = 16;
    const rect   = target ? target.getBoundingClientRect() : { left: 100, top: 100, right: 200, bottom: 150, width: 100, height: 50 };
    const tw     = 300;
    const th     = 180; // estimado

    // Intentar a la derecha del elemento
    let left = rect.right + MARGIN;
    let top  = rect.top;

    // Si se sale por la derecha, ir a la izquierda
    if (left + tw > window.innerWidth - 10) {
      left = rect.left - tw - MARGIN;
    }
    // Si se sale por abajo
    if (top + th > window.innerHeight - 10) {
      top = window.innerHeight - th - 10;
    }
    // Si se sale por arriba
    if (top < 10) top = 10;
    // Si se sale por la izquierda
    if (left < 10) left = rect.right + MARGIN;

    tooltip.style.left = left + 'px';
    tooltip.style.top  = top  + 'px';
  }
}