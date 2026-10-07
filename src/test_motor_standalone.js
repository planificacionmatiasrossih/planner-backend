// Prueba de humo: ¿el motor extraído funciona SOLO en Node, sin navegador
// simulado? Si esto corre, confirma que la extracción fue limpia.
const motor = require('./motor.js');

function pedido(over) {
  return Object.assign({ pedido: '0', sucursal: 'CLIENTE', comuna: 'SANTIAGO', direccion: 'CALLE 1',
    descripcionMaterial: 'PROD', producto: '', sku: '1', cantidad: 1, volumen: 1.0 }, over);
}

(async () => {
  const pedidosRaw = [
    pedido({ pedido: '1', comuna: 'LAMPA', volumen: 4 }),
    pedido({ pedido: '2', comuna: 'QUILICURA', volumen: 2 }),
    pedido({ pedido: '3', comuna: 'RENCA', volumen: 1 }),
    pedido({ pedido: '4', comuna: 'LAS CONDES', volumen: 2 }),
    pedido({ pedido: '5', comuna: 'NUNOA', volumen: 1 }),
  ];
  const fleetDisp = [{ patente: 'X1', mts3: 40, meta: 22, transportista: 'T' }];

  const res = await motor.planificar(pedidosRaw, fleetDisp);
  console.log('Rutas generadas:', res.rutas.length);
  res.rutas.forEach(r => console.log('-', r.patente, '| vuelta', r.vueltaNumero, '|', r.tipoVuelta, '| stops:', r.stops.length, '| vol:', r.volumen));

  const allStops = res.rutas.flatMap(r => r.stops);
  const counts = {}; allStops.forEach(s => counts[s.pedido] = (counts[s.pedido] || 0) + 1);

  const checks = [
    ['Se generó al menos una ruta', res.rutas.length > 0],
    ['Todos los pedidos cubiertos', pedidosRaw.every(p => counts[p.pedido] === 1)],
    ['Sin pedidos duplicados', Object.values(counts).every(v => v === 1)],
  ];
  console.log('\n=== CHECKS ===');
  let ok = true;
  checks.forEach(([name, cond]) => { console.log((cond ? '✅' : '❌'), name); if (!cond) ok = false; });
  process.exit(ok ? 0 : 1);
})();
