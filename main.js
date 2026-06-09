import { App }      from './js/ui/App.js';
import { Tutorial } from './js/ui/Tutorial.js';

window.addEventListener('DOMContentLoaded', () => {
  window.erApp      = new App();
  window.erTutorial = new Tutorial();
});