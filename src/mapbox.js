// mapbox.js — Toda la integración con Mapbox vive acá, separada del motor
// de cálculo, con un "guardarraíl" de uso: un contador mensual que corta el
// uso de Mapbox antes de acercarse al límite gratis (100.000/mes por tipo de
// consulta), y vuelve a las alternativas 100% gratis (Nominatim, línea recta)
// para lo que falte del mes. Así el control de gasto vive en el código, no
// depende de confiar en el panel de Mapbox.
//
// Si no hay token configurado (variable de entorno MAPBOX_TOKEN vacía),
// este módulo no hace nada: todo sigue funcionando exactamente como antes
// de agregar Mapbox (Nominatim + aproximación por línea recta).

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.MAPBOX_TOKEN || '';

// Límite real de Mapbox: 100.000/mes por cada API (geocoding, directions).
// Dejamos un margen de seguridad grande (nos quedamos en 80.000) para nunca
// rozar el límite real ni aunque el conteo tenga algún desfase.
const LIMITE_SEGURO_MENSUAL = 80000;

const CONTADOR_FILE = path.join(__dirname, '..', 'data', 'uso-mapbox.json');

function mesActual() {
  const d = new Date();
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

function leerContador() {
  try {
    const data = JSON.parse(fs.readFileSync(CONTADOR_FILE, 'utf8'));
    if (data.mes !== mesActual()) return { mes: mesActual(), geocoding: 0, directions: 0 };
    return data;
  } catch (e) {
    return { mes: mesActual(), geocoding: 0, directions: 0 };
  }
}

function guardarContador(c) {
  try {
    fs.mkdirSync(path.dirname(CONTADOR_FILE), { recursive: true });
    fs.writeFileSync(CONTADOR_FILE, JSON.stringify(c));
  } catch (e) { /* si no se pudo guardar, en el peor caso se vuelve a contar desde 0 */ }
}

function incrementarYRevisar(tipo) {
  const c = leerContador();
  c[tipo] = (c[tipo] || 0) + 1;
  guardarContador(c);
  return c[tipo] <= LIMITE_SEGURO_MENSUAL;
}

function estadoUso() {
  const c = leerContador();
  return {
    mes: c.mes,
    geocoding: c.geocoding || 0,
    directions: c.directions || 0,
    limiteSeguro: LIMITE_SEGURO_MENSUAL,
    mapboxActivo: !!TOKEN,
  };
}

// Busca lat/lon de una dirección usando el Geocoding de Mapbox (más preciso
// que Nominatim con direcciones con errores de tipeo o abreviaciones raras).
// Devuelve null si Mapbox no está configurado, se pasó el límite seguro, o
// la consulta falló — en cualquiera de esos casos, quien llama esta función
// debe seguir con el camino de respaldo (Nominatim / centro de la comuna).
async function geocodificarConMapbox(direccion, comuna) {
  if (!TOKEN) return null;
  if (!incrementarYRevisar('geocoding')) return null;
  try {
    const query = encodeURIComponent((direccion || '') + ', ' + (comuna || '') + ', Región Metropolitana, Chile');
    const url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' + query + '.json'
      + '?access_token=' + TOKEN + '&limit=1&country=cl&language=es';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    let resp;
    try {
      resp = await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) return null;
    const data = await resp.json();
    const feature = data && data.features && data.features[0];
    if (feature && Array.isArray(feature.center)) {
      return { lat: feature.center[1], lon: feature.center[0] };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Calcula distancia y tiempo REAL por calles para una ruta ya ordenada
// (lista de paradas en el orden en que se van a visitar), usando Mapbox
// Directions. Se usa UNA vez por ruta ya armada — nunca dentro del algoritmo
// que decide el orden de las paradas (ese sigue usando línea recta, que es
// gratis e instantáneo, y sirve perfecto para decidir orden; lo que gana
// precisión real es el km/tiempo final que se le muestra al despachador).
async function calcularRutaRealMapbox(puntos) {
  if (!TOKEN) return null;
  if (puntos.length < 2) return null;
  if (!incrementarYRevisar('directions')) return null;
  try {
    const coords = puntos.map(p => p.lon.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');
    const url = 'https://api.mapbox.com/directions/v5/mapbox/driving/' + coords
      + '?access_token=' + TOKEN + '&overview=false';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    let resp;
    try {
      resp = await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) return null;
    const data = await resp.json();
    const ruta = data && data.routes && data.routes[0];
    if (ruta && Number.isFinite(ruta.distance) && Number.isFinite(ruta.duration)) {
      return { km: ruta.distance / 1000, minutos: ruta.duration / 60 };
    }
    return null;
  } catch (e) {
    return null;
  }
}

module.exports = { geocodificarConMapbox, calcularRutaRealMapbox, estadoUso };
