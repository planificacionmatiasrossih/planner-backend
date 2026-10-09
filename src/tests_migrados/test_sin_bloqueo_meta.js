const w = require('../motor.js');

(async () => {

  function pedido(over) {
    return Object.assign({ pedido:'0', sucursal:'CLIENTE', comuna:'SANTIAGO', direccion:'CALLE 1',
      descripcionMaterial:'PROD', producto:'', sku:'1', cantidad:1, volumen:1.0 }, over);
  }

  // Reproduce el caso reportado: 18 pedidos, varias comunas, con volumen total
  // que obliga a abrir la 2ª vuelta de un camión (DTSG49) — antes, el paso de
  // "balanceo por %" partía Huechuraba entre la 1ª y la 2ª vuelta de ese mismo
  // camión aunque cupiera entera en una sola. Ahora no debe pasar: cada comuna
  // debe quedar completa en UNA sola vuelta salvo que su volumen no quepa
  // físicamente en ninguna vuelta por sí sola.
  const pedidosRaw = [
    pedido({pedido:'427532', comuna:'HUECHURABA', direccion:'AMERICO VESPUCIO NORTE 1155', volumen:0.017}),
    pedido({pedido:'427591', comuna:'HUECHURABA', direccion:'AV AMERICO VESPUCIO 1737', volumen:0.274}),
    pedido({pedido:'427064', comuna:'HUECHURABA', direccion:'AV SANTA MARTA 7775', volumen:1.583}),
    pedido({pedido:'426073', comuna:'QUILICURA', direccion:'SAN CRISTOBAL 9581', volumen:0.046}),
    pedido({pedido:'427376', comuna:'LAS CONDES', direccion:'AUGUSTO LEGUIA NORTE 180', volumen:0.990}),
    pedido({pedido:'427032', comuna:'SANTIAGO', direccion:'SERRANO 654', volumen:11.438}),
    pedido({pedido:'426925', comuna:'SANTIAGO', direccion:'SERRANO 654', volumen:5.489}),
    pedido({pedido:'427620', comuna:'SANTIAGO', direccion:'SERRANO 654', volumen:2.937}),
    pedido({pedido:'427709', comuna:'SANTIAGO', direccion:'ALAMEDA 2826 PISO 3 LOCAL 6', volumen:0.407}),
    pedido({pedido:'427756', comuna:'SANTIAGO', direccion:'ALBERTO LO SECO 2270', volumen:0.121}),
    pedido({pedido:'427129', comuna:'SANTIAGO CENTRO', direccion:'SAN PABLO 2270', volumen:0.119}),
    pedido({pedido:'427757', comuna:'QUINTA NORMAL', direccion:'ALBERTO LOSECO 2270', volumen:1.358}),
    pedido({pedido:'427661', comuna:'PUDAHUEL', direccion:'BODEGA PUDAHUEL CAMINO SAN PEDRO 9677', volumen:4.034}),
    pedido({pedido:'427318', comuna:'MAIPU', direccion:'SANTA ADELA 10377', volumen:2.908}),
  ];
  const totalVol = pedidosRaw.reduce((a,p)=>a+p.volumen,0);
  console.log('Total pedidos:', pedidosRaw.length, '| Total volumen:', totalVol.toFixed(2));

  const fleetDisp = [
    { patente:'DTSG49', mts3:22, meta:14, transportista:'TRANSPORTES A Y J' },
  ];

  const res = await w.planificar(pedidosRaw, fleetDisp);
  console.log('\nRutas generadas:', res.rutas.length);
  res.rutas.forEach(r => {
    const comunas = [...new Set(r.stops.map(s=>s.comuna))];
    console.log('-', r.patente||'(SIN CAMION)', '| vuelta', r.vueltaNumero||1, '| vol', r.volumen.toFixed(2), '/', r.mts3, '| estado:', r.estado);
    console.log('  comunas:', comunas.join(', '));
  });

  // Para cada comuna, en cuántas vueltas distintas del MISMO camión aparece.
  function vueltasDeComuna(comuna){
    return new Set(res.rutas.filter(r => r.patente && r.stops.some(s=>s.comuna===comuna)).map(r => r.vueltaNumero||1));
  }
  // Huechuraba (0.017+0.274+1.583=1.874) cabe entera en cualquier vuelta (cap 22) —
  // no debería quedar partida en 2 vueltas.
  const vueltasHuechuraba = vueltasDeComuna('HUECHURABA');
  // Santiago (11.438+5.489+2.937+0.407+0.121=20.39) es un caso límite: por sí
  // sola casi llena una vuelta completa (cap física 22m3), así que puede
  // legítimamente terminar sola en su propia vuelta sin partirse (no hay
  // ninguna otra comuna con la que deba compartir vuelta para "no partirse").
  const allStops = res.rutas.flatMap(r=>r.stops);
  const counts={}; allStops.forEach(s=>counts[s.pedido]=(counts[s.pedido]||0)+1);

  console.log('\n=== CHECKS ===');
  const checks = [
    ['Huechuraba queda completo en una sola vuelta (no se parte por %)', vueltasHuechuraba.size===1],
    ['Ninguna ruta con patente supera su capacidad física (mts3)', res.rutas.every(r=>!r.patente || r.volumen<=r.mts3+1e-6)],
    ['Sin pedidos duplicados', Object.values(counts).every(v=>v===1)],
    ['Todos los pedidos cubiertos', pedidosRaw.every(p=>counts[p.pedido]===1)],
  ];
  let ok = true;
  checks.forEach(([name, cond]) => { console.log((cond?'✅':'❌'), name); if(!cond) ok=false; });
  process.exit(ok?0:1);
})();
