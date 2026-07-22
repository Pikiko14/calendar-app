<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

// Fix iconos por defecto en Vite
const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})
L.Marker.prototype.options.icon = DefaultIcon

const props = defineProps<{
  latitude?: number | null
  longitude?: number | null
}>()

const emit = defineEmits<{
  update: [
    payload: {
      latitude: number
      longitude: number
      address: string
      city: string
      country: string
      mapUrl: string
    },
  ]
}>()

const mapEl = ref<HTMLElement | null>(null)
const locating = ref(false)
const resolving = ref(false)
const error = ref('')
const hint = ref('Haz clic en el mapa o usa tu ubicación GPS.')

let map: L.Map | null = null
let marker: L.Marker | null = null

const DEFAULT_CENTER: L.LatLngExpression = [4.711, -74.0721] // Bogotá

function mapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`
}

async function reverseGeocode(lat: number, lng: number) {
  resolving.value = true
  error.value = ''
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lng))
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('accept-language', 'es')

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
    })
    if (!res.ok) throw new Error('No se pudo obtener la dirección')
    const data = (await res.json()) as {
      display_name?: string
      address?: {
        road?: string
        house_number?: string
        neighbourhood?: string
        suburb?: string
        city?: string
        town?: string
        village?: string
        municipality?: string
        state?: string
        country?: string
      }
    }

    const a = data.address || {}
    const street = [a.road, a.house_number].filter(Boolean).join(' ')
    const area = a.neighbourhood || a.suburb || ''
    const address = street || area || data.display_name?.split(',')[0] || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    const city =
      a.city || a.town || a.village || a.municipality || a.state || ''
    const country = a.country || ''

    emit('update', {
      latitude: lat,
      longitude: lng,
      address,
      city,
      country,
      mapUrl: mapsLink(lat, lng),
    })
    hint.value = 'Ubicación actualizada desde el mapa.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Error al geocodificar'
    emit('update', {
      latitude: lat,
      longitude: lng,
      address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      city: '',
      country: '',
      mapUrl: mapsLink(lat, lng),
    })
  } finally {
    resolving.value = false
  }
}

function setMarker(lat: number, lng: number, reverse = true) {
  if (!map) return
  const latlng = L.latLng(lat, lng)
  if (marker) {
    marker.setLatLng(latlng)
  } else {
    marker = L.marker(latlng, { draggable: true }).addTo(map)
    marker.on('dragend', () => {
      const p = marker?.getLatLng()
      if (p) void reverseGeocode(p.lat, p.lng)
    })
  }
  map.setView(latlng, Math.max(map.getZoom(), 16))
  if (reverse) void reverseGeocode(lat, lng)
}

function useMyLocation() {
  if (!navigator.geolocation) {
    error.value = 'Tu navegador no soporta geolocalización.'
    return
  }
  locating.value = true
  error.value = ''
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locating.value = false
      setMarker(pos.coords.latitude, pos.coords.longitude, true)
    },
    (err) => {
      locating.value = false
      error.value =
        err.code === 1
          ? 'Permiso de ubicación denegado. Actívalo en el navegador.'
          : 'No se pudo obtener tu ubicación GPS.'
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  )
}

onMounted(() => {
  if (!mapEl.value) return
  const hasCoords =
    props.latitude != null &&
    props.longitude != null &&
    Number.isFinite(props.latitude) &&
    Number.isFinite(props.longitude)

  map = L.map(mapEl.value, {
    zoomControl: true,
    attributionControl: true,
  }).setView(
    hasCoords ? [props.latitude!, props.longitude!] : DEFAULT_CENTER,
    hasCoords ? 16 : 12,
  )

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map)

  map.on('click', (e: L.LeafletMouseEvent) => {
    setMarker(e.latlng.lat, e.latlng.lng, true)
  })

  if (hasCoords) {
    setMarker(props.latitude!, props.longitude!, false)
  }

  // Leaflet a veces necesita invalidate tras montar en layout
  requestAnimationFrame(() => map?.invalidateSize())
})

watch(
  () => [props.latitude, props.longitude] as const,
  ([lat, lng]) => {
    if (lat == null || lng == null || !map) return
    if (marker) {
      const cur = marker.getLatLng()
      if (Math.abs(cur.lat - lat) < 1e-6 && Math.abs(cur.lng - lng) < 1e-6) return
    }
    setMarker(lat, lng, false)
  },
)

onUnmounted(() => {
  map?.remove()
  map = null
  marker = null
})
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="btn-ghost !py-2.5 text-sm"
        :disabled="locating || resolving"
        @click="useMyLocation"
      >
        {{ locating ? 'Obteniendo GPS…' : 'Usar mi ubicación' }}
      </button>
      <p class="text-xs text-ink-muted">
        {{ resolving ? 'Resolviendo dirección…' : hint }}
      </p>
    </div>
    <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
    <div
      ref="mapEl"
      class="h-64 w-full overflow-hidden rounded-2xl border border-black/10 dark:border-white/10"
    />
  </div>
</template>
