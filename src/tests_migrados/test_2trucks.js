const w = require('../motor.js');

(async () => {

  function pedido(over) {
    return Object.assign({ pedido:'0', sucursal:'CLIENTE', comuna:'SANTIAGO', direccion:'CALLE 1',
      descripcionMaterial:'PROD', producto:'', sku:'1', cantidad:1, volumen:1.0 }, over);
  }
  // Reproduce el escenario del screenshot: pedidos repartidos en 4 sectores distintos
  // (Centro/Poniente, Norte/Nororiente x2, Sur/Suroriente) pero solo 2 patentes
  // seleccionadas (como TRANSPORTES A Y J: SYBZ82, LPYJ75).
  const pedidosRaw = [
    pedido({pedido:'1', comuna:'SANTIAGO CENTRO', volumen:8}),
    pedido({pedido:'2', comuna:'SANTIAGO', volumen:6}),
    pedido({pedido:'3', comuna:'QUINTA NORMAL', volumen:4}),
    pedido({pedido:'4', comuna:'PUDAHUEL', volumen:3}),
    pedido({pedido:'5', comuna:'MAIPU', volumen:2}),
    pedido({pedido:'6', comuna:'HUECHURABA', volumen:5}),
    pedido({pedido:'7', comuna:'QUILICURA', volumen:3}),
    pedido({pedido:'8', comuna:'LAS CONDES', volumen:4}),
    pedido({pedido:'9', comuna:'SAN BERNARDO', volumen:5}),
    pedido({pedido:'10', comuna:'PUENTE ALTO', volumen:3}),
  ];
  const totalVol = pedidosRaw.reduce((a,p)=>a+p.volumen,0);
  console.log('Total volumen pedidos:', totalVol);

  const fleetDisp = [
    { patente:'SYBZ82', mts3:40, meta:22, transportista:'TRANSPORTES A Y J' },
    { patente:'LPYJ75', mts3:40, meta:22, transportista:'TRANSPORTES A Y J' },
  ];
  // Capacidad total con 2 vueltas c/u: 2*40*2 = 160 m3, sobra de sobra para 43 m3 totales.

  const res = await w.planificar(pedidosRaw, fleetDisp);
  console.log('\nRutas generadas:', res.rutas.length);
  res.rutas.forEach(r => {
    console.log('-', r.patente||'(SIN CAMION)', '|', r.zona, '| vuelta', r.vueltaNumero||1, '| vol', r.volumen.toFixed(2), '| estado:', r.estado, '| pedidos:', r.stops.map(s=>s.pedido+'@'+s.comuna).join(', '));
  });

  const sinCamionRoutes = res.rutas.filter(r => !r.patente);
  const usedTrucks = new Set(res.rutas.filter(r=>r.patente).map(r=>r.patente));
  const allStops = res.rutas.flatMap(r=>r.stops);
  const coveredIds = new Set(allStops.map(s=>s.pedido));
  const allCovered = pedidosRaw.every(p => coveredIds.has(p.pedido));

  console.log('\n=== CHECKS ===');
  const checks = [
    ['No hay rutas "SIN CAMIÓN DISPONIBLE" con flota suficiente', sinCamionRoutes.length === 0],
    ['Se usaron ambas patentes seleccionadas', usedTrucks.has('SYBZ82') && usedTrucks.has('LPYJ75')],
    ['Todos los pedidos quedaron cubiertos', allCovered],
    ['Ninguna ruta supera su capacidad física (mts3)', res.rutas.every(r => !r.patente || r.volumen <= r.mts3 + 1e-6)],
    ['No hay pedidos duplicados', (() => { const c={}; allStops.forEach(s=>c[s.pedido]=(c[s.pedido]||0)+1); return Object.values(c).every(v=>v===1); })()],
  ];
  let ok = true;
  checks.forEach(([name, cond]) => { console.log((cond?'✅':'❌'), name); if(!cond) ok=false; });
  process.exit(ok ? 0 : 1);
})();
