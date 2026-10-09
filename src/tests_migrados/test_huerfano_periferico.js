const w = require('../motor.js');

(async () => {

  function pedido(over) {
    return Object.assign({ pedido:'0', sucursal:'CLIENTE', comuna:'SANTIAGO', direccion:'CALLE 1',
      descripcionMaterial:'PROD', producto:'', sku:'1', cantidad:1, volumen:1.0 }, over);
  }

  // Reproduce la estructura real reportada por el usuario (comparando con SAP):
  // 4 camiones seleccionados, 6 corredores con pedidos — Norte (Lampa/Quilicura/
  // Renca), Nororiente (Las Condes/Ñuñoa), Poniente (Quinta Normal/Maipu/
  // Estacion Central), Centro (Santiago/Lo Espejo), Sur (San Joaquin/La
  // Cisterna/San Bernardo) y Periférico Sur (Peñaflor, UN SOLO pedido chico).
  // Antes, Peñaflor se quedaba con un camión ENTERO para sí solo (2% de carga,
  // ~90km de viaje) mientras otro camión terminaba con casi todo el resto.
  const pedidosRaw = [
    // Norte
    pedido({pedido:'1', comuna:'LAMPA', volumen:4}),
    pedido({pedido:'2', comuna:'QUILICURA', volumen:2}),
    pedido({pedido:'3', comuna:'RENCA', volumen:1}),
    // Nororiente
    pedido({pedido:'4', comuna:'LAS CONDES', volumen:2}),
    pedido({pedido:'5', comuna:'NUNOA', volumen:1}),
    // Poniente
    pedido({pedido:'6', comuna:'QUINTA NORMAL', volumen:3}),
    pedido({pedido:'7', comuna:'MAIPU', volumen:5}),
    pedido({pedido:'8', comuna:'ESTACION CENTRAL', volumen:2}),
    // Centro
    pedido({pedido:'9', comuna:'SANTIAGO', volumen:6}),
    pedido({pedido:'10', comuna:'LO ESPEJO', volumen:2}),
    // Sur
    pedido({pedido:'11', comuna:'SAN JOAQUIN', volumen:2}),
    pedido({pedido:'12', comuna:'LA CISTERNA', volumen:2}),
    pedido({pedido:'13', comuna:'SAN BERNARDO', volumen:2}),
    // Periférico Sur: un único pedido chico y aislado
    pedido({pedido:'14', comuna:'PEÑAFLOR', volumen:0.39}),
  ];
  const totalVol = pedidosRaw.reduce((a,p)=>a+p.volumen,0);
  console.log('Total pedidos:', pedidosRaw.length, '| Total volumen:', totalVol.toFixed(2));

  const fleetDisp = [
    { patente:'DTSG-49', mts3:40, meta:22, transportista:'A Y J' },
    { patente:'SYBZ-82', mts3:40, meta:22, transportista:'A Y J' },
    { patente:'SYBZ-83', mts3:34, meta:22, transportista:'A Y J' },
    { patente:'LPYJ-75', mts3:40, meta:22, transportista:'A Y J' },
  ];

  const res = await w.planificar(pedidosRaw, fleetDisp);
  console.log('\nFusiones:', JSON.stringify(res.fusionesSector));
  console.log('\nRutas generadas:', res.rutas.length);
  res.rutas.forEach(r => {
    const comunas=[...new Set(r.stops.map(s=>s.comuna))];
    const pct = r.meta ? Math.round(100*r.volumen/r.meta) : '-';
    console.log('-', r.patente||'(SIN CAMION)', '| vuelta', r.vueltaNumero||1, '| vol', r.volumen.toFixed(2), '/', r.mts3, '('+pct+'% meta)');
    console.log('  comunas:', comunas.join(', '));
  });

  // Peñaflor NO debe terminar como única parada de un camión completo.
  const rutaPeñaflor = res.rutas.find(r => r.stops.some(s=>s.comuna==='PEÑAFLOR'));
  const soloPeñaflor = rutaPeñaflor && rutaPeñaflor.stops.length===1;
  const truckConSoloPeñaflor = rutaPeñaflor && rutaPeñaflor.patente && rutaPeñaflor.stops.every(s=>s.comuna==='PEÑAFLOR') &&
    !res.rutas.some(function(r2){ return r2!==rutaPeñaflor && r2.patente===rutaPeñaflor.patente; });

  const allStops = res.rutas.flatMap(r=>r.stops);
  const counts={}; allStops.forEach(s=>counts[s.pedido]=(counts[s.pedido]||0)+1);

  console.log('\n=== CHECKS ===');
  const checks = [
    ['Peñaflor no quedó como la única parada de un camión dedicado exclusivamente a él', !truckConSoloPeñaflor],
    ['Ninguna ruta con patente supera su capacidad física (mts3)', res.rutas.every(r=>!r.patente || r.volumen<=r.mts3+1e-6)],
    ['Sin pedidos duplicados', Object.values(counts).every(v=>v===1)],
    ['Todos los pedidos cubiertos', pedidosRaw.every(p=>counts[p.pedido]===1)],
  ];
  let ok = true;
  checks.forEach(([name, cond]) => { console.log((cond?'✅':'❌'), name); if(!cond) ok=false; });
  process.exit(ok?0:1);
})();
