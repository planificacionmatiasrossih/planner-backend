const w = require('../motor.js');

(async () => {

  function pedido(over) {
    return Object.assign({ pedido:'0', sucursal:'CLIENTE', comuna:'SANTIAGO', direccion:'CALLE 1',
      descripcionMaterial:'PROD', producto:'', sku:'1', cantidad:1, volumen:1.0 }, over);
  }

  // Caso reproducido: un solo camión, varias comunas del mismo macro-sector
  // (Norte+Nororiente) cuyo volumen total cabe cómodo en UNA sola vuelta. El
  // armado inicial por bin-packing a veces mete el pedido más grande en la
  // vuelta 1 y el resto en la vuelta 2; luego rebalancearExcedentesCorredor
  // (que optimiza distancia total, no vueltas) puede mover TODO el contenido
  // de la vuelta 1 hacia la vuelta 2 porque ahorra kilómetros, dejando la
  // vuelta 1 vacía (se descarta) y la única ruta sobreviviente mal rotulada
  // como "2ª vuelta" aunque sea el único viaje del camión ese día.
  const pedidosRaw = [
    pedido({pedido:'1', comuna:'LAMPA', volumen:4}),
    pedido({pedido:'2', comuna:'QUILICURA', volumen:2}),
    pedido({pedido:'3', comuna:'RENCA', volumen:1}),
    pedido({pedido:'4', comuna:'LAS CONDES', volumen:2}),
    pedido({pedido:'5', comuna:'NUNOA', volumen:1}),
  ];
  const fleetDisp = [{ patente:'X1', mts3:40, meta:22, transportista:'T' }];
  const res = await w.planificar(pedidosRaw, fleetDisp);
  console.log('Rutas generadas:', res.rutas.length);
  res.rutas.forEach(r => console.log('-', r.patente, '| vuelta', r.vueltaNumero, '|', r.tipoVuelta, '| stops:', r.stops.length, '| vol:', r.volumen));

  const allStops = res.rutas.flatMap(r=>r.stops);
  const counts={}; allStops.forEach(s=>counts[s.pedido]=(counts[s.pedido]||0)+1);

  console.log('\n=== CHECKS ===');
  const checks = [
    ['Se generó una sola ruta para el único camión', res.rutas.length===1],
    ['La única ruta está rotulada como 1ª vuelta (no "2ª" sin una 1ª antes)', res.rutas[0] && res.rutas[0].vueltaNumero===1 && res.rutas[0].tipoVuelta==='PRIMERA VUELTA'],
    ['Todos los pedidos están en esa ruta', res.rutas[0] && res.rutas[0].stops.length===5],
    ['Sin pedidos duplicados', Object.values(counts).every(v=>v===1)],
    ['Todos los pedidos cubiertos', pedidosRaw.every(p=>counts[p.pedido]===1)],
  ];
  let ok = true;
  checks.forEach(([name, cond]) => { console.log((cond?'✅':'❌'), name); if(!cond) ok=false; });
  process.exit(ok?0:1);
})();
