// osrm.js — Afina el ORDEN de las paradas de una ruta ya armada, usando
// distancia real de calle en vez de línea recta, a través de OSRM: un
// servicio de ruteo gratuito y sin límite mensual (a diferencia de Mapbox).
//
// Importante: esto NO reemplaza el algoritmo que decide qué pedidos van en
// qué camión/corredor (eso sigue igual, con línea recta, porque es rápido y
// ya está probado). Esto es un paso extra, al final, que solo reordena las
// paradas DENTRO de una ruta ya decidida, usando distancias reales — igual
// que Mapbox se usa al final para el km/tiempo final, pero esto es gratis y
// mejora la decisión de orden, no solo el número que se muestra.
//
// Si OSRM no responde (sin internet, servidor caído, demora demasiado), esta
// función devuelve null y quien llama se queda con el orden que ya tenía
// (línea recta + 2-opt) — nunca rompe el resultado.

const OSRM_URL = 'https://router.project-osrm.org';

// Contadores simples en memoria, solo para poder confirmar desde afuera
// (endpoint /api/estado-osrm) que OSRM está realmente respondiendo, igual
// que se hizo con el contador de uso de Mapbox.
let exitos = 0;
let fallos = 0;

function estado() {
  return { exitos, fallos, servicio: OSRM_URL };
}

// Pide a OSRM la matriz de distancias reales (en metros) entre todos los
// puntos dados. puntos[0] debe ser la base; el resto, las paradas en
// cualquier orden. Devuelve una matriz NxN de metros, o null si falló.
async function obtenerMatrizOSRM(puntos) {
  if (!Array.isArray(puntos) || puntos.length < 3) return null; // con 2 puntos no hay nada que reordenar
  try {
    const coords = puntos.map(p => p.lon.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');
    const url = OSRM_URL + '/table/v1/driving/' + coords + '?annotations=distance';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let resp;
    try {
      resp = await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!resp.ok) { fallos++; return null; }
    const data = await resp.json();
    if (!data || data.code !== 'Ok' || !Array.isArray(data.distances)) { fallos++; return null; }
    exitos++;
    return data.distances; // metros, data.distances[i][j]
  } catch (e) {
    fallos++;
    return null;
  }
}

// 2-opt clásico, pero usando la matriz de distancias reales en vez de línea
// recta. ordenIdx es la lista de índices de paradas (1..n, porque 0 es la
// base) en el orden actual. Devuelve la lista de índices en el mejor orden
// encontrado (menor distancia total real, ida y vuelta a la base).
function twoOptConMatriz(ordenIdx, matriz) {
  function costoTotal(seq) {
    let total = matriz[0][seq[0]];
    for (let i = 0; i < seq.length - 1; i++) total += matriz[seq[i]][seq[i + 1]];
    total += matriz[seq[seq.length - 1]][0];
    return total;
  }
  let mejor = ordenIdx.slice();
  let mejorCosto = costoTotal(mejor);
  let cambio = true, iter = 0;
  while (cambio && iter < 80) {
    cambio = false; iter++;
    for (let i = 0; i < mejor.length - 1; i++) {
      for (let k = i + 1; k < mejor.length; k++) {
        const nuevo = mejor.slice(0, i).concat(mejor.slice(i, k + 1).reverse(), mejor.slice(k + 1));
        const c = costoTotal(nuevo);
        if (c + 1e-6 < mejorCosto) { mejor = nuevo; mejorCosto = c; cambio = true; }
      }
    }
  }
  return mejor;
}

module.exports = { obtenerMatrizOSRM, twoOptConMatriz, estado };
