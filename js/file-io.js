/**
 * File I/O
 * Load GEDCOM from file upload, URL, or drag&drop.
 * Save GEDCOM as file download.
 */
import { parseGedcom, detectVersion } from './gedcom-parser.js';
import { exportGedcom } from './gedcom-writer.js';

/**
 * Read a File object and parse it.
 * @param {File} file
 * @returns {Promise<object>} parsed data
 */
export function loadFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = parseGedcom(reader.result);
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'UTF-8');
  });
}

/**
 * Fetch GEDCOM from a URL and parse it.
 * @param {string} url
 * @returns {Promise<object>} parsed data
 */
export async function loadFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fehler beim Laden: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  return parseGedcom(text);
}

/**
 * Trigger a file download.
 * @param {object} data - { individuals, families, homePersonId }
 * @param {string} version - '5.5.1' or '7.0'
 * @param {string} filename
 */
export function saveToFile(data, version, filename) {
  const text = exportGedcom(data, version);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Setup drag&drop on an element.
 * @param {HTMLElement} element
 * @param {function} onLoad - callback(data) when file is loaded
 */
export function setupDragDrop(element, onLoad) {
  element.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    element.classList.add('drag-over');
  });

  element.addEventListener('dragleave', (e) => {
    e.preventDefault();
    element.classList.remove('drag-over');
  });

  element.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    element.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.toLowerCase().endsWith('.ged')) {
        try {
          const data = await loadFromFile(file);
          onLoad(data);
        } catch (err) {
          console.error('Drag&Drop Ladefehler:', err);
          alert('Fehler beim Laden der Datei: ' + err.message);
        }
      } else {
        alert('Bitte eine .ged Datei ablegen.');
      }
    }
  });
}
