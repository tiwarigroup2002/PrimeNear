import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import * as L from 'leaflet';

// Explicit icon: Leaflet's default icon path detection breaks with bundlers.
// Images are copied to /leaflet by angular.json.
const MARKER_ICON = L.icon({
  iconUrl: 'leaflet/marker-icon.png',
  iconRetinaUrl: 'leaflet/marker-icon-2x.png',
  shadowUrl: 'leaflet/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowSize: [41, 41],
});

/** OpenStreetMap picker: click / drag the marker to choose the tahsil centre. */
@Component({
  selector: 'app-map-picker',
  template: `
    <div #map class="map-picker rounded border"></div>
    <div class="form-text">Click on the map or drag the marker to set the centre. The circle shows the service radius.</div>
  `,
})
export class MapPickerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('map') el!: ElementRef<HTMLDivElement>;
  @Input() latitude: number | null = null;
  @Input() longitude: number | null = null;
  @Input() radiusKm = 5;
  @Output() picked = new EventEmitter<{ latitude: number; longitude: number }>();

  private map?: L.Map;
  private marker?: L.Marker;
  private circle?: L.Circle;

  ngAfterViewInit() {
    const center: L.LatLngExpression = [this.latitude ?? 22.7196, this.longitude ?? 75.8577];
    this.map = L.map(this.el.nativeElement).setView(center, 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(this.map);
    this.marker = L.marker(center, { draggable: true, icon: MARKER_ICON }).addTo(this.map);
    this.circle = L.circle(center, { radius: this.radiusKm * 1000, color: '#2563eb', weight: 1 }).addTo(this.map);
    this.marker.on('dragend', () => this.emit(this.marker!.getLatLng()));
    this.map.on('click', (e: L.LeafletMouseEvent) => this.emit(e.latlng));
    // Modal animations can size the container late
    setTimeout(() => this.map?.invalidateSize(), 200);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!this.map) return;
    if ((changes['latitude'] || changes['longitude']) && this.latitude != null && this.longitude != null) {
      const ll = L.latLng(this.latitude, this.longitude);
      this.marker?.setLatLng(ll);
      this.circle?.setLatLng(ll);
    }
    if (changes['radiusKm']) this.circle?.setRadius((this.radiusKm || 0) * 1000);
  }

  ngOnDestroy() {
    this.map?.remove();
  }

  private emit(ll: L.LatLng) {
    const latitude = +ll.lat.toFixed(6);
    const longitude = +ll.lng.toFixed(6);
    this.marker?.setLatLng(ll);
    this.circle?.setLatLng(ll);
    this.picked.emit({ latitude, longitude });
  }
}
