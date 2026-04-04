/**
 * MapView
 * Small Leaflet map that shows location markers for the hovered person.
 */

export class MapView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.map = null;
    this.markers = [];
    this._initialized = false;
  }

  _init() {
    if (this._initialized) return;
    this._initialized = true;

    this.map = L.map(this.container, {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false
    }).setView([51.5, 10.5], 5); // Center on Germany

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18
    }).addTo(this.map);

    // Small zoom control
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
  }

  /**
   * Show the map and update markers.
   * @param {Array} locations - [{label, place, lat, lng, color}]
   */
  show(locations) {
    if (!locations || locations.length === 0) {
      this.hide();
      return;
    }

    this._init();
    this.container.style.display = 'block';

    // Clear old markers
    this.markers.forEach(m => m.remove());
    this.markers = [];

    const bounds = L.latLngBounds();

    for (const loc of locations) {
      if (loc.lat == null || loc.lng == null) continue;

      const icon = L.divIcon({
        className: 'map-marker-icon',
        html: `<div style="background:${loc.color};width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5);"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });

      const marker = L.marker([loc.lat, loc.lng], { icon })
        .addTo(this.map)
        .bindTooltip(`${loc.label}: ${loc.place}`, {
          permanent: false,
          direction: 'top',
          offset: [0, -8]
        });

      this.markers.push(marker);
      bounds.extend([loc.lat, loc.lng]);
    }

    if (this.markers.length === 0) {
      this.hide();
      return;
    }

    // Fit map to markers
    setTimeout(() => {
      this.map.invalidateSize();
      if (this.markers.length === 1) {
        this.map.setView(bounds.getCenter(), 8);
      } else {
        this.map.fitBounds(bounds, { padding: [20, 20], maxZoom: 10 });
      }
    }, 50);
  }

  hide() {
    this.container.style.display = 'none';
    this.markers.forEach(m => m.remove());
    this.markers = [];
  }
}
