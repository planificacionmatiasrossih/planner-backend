const w = require('../motor.js');

(async () => {

  function pedido(over) {
    return Object.assign({ pedido:'0', sucursal:'CLIENTE', comuna:'SANTIAGO', direccion:'CALLE 1',
      descripcionMaterial:'PROD', producto:'', sku:'1', cantidad:1, volumen:1.0 }, over);
  }
  // Reconstrucción aproximada del caso real de las capturas: 16 pedidos, 2 patentes
  // AYJ, comunas repartidas en Norte(Huechuraba/Quilicura), Nororiente(Las Condes),
  // Centro(Santiago/Santiago Centro), Poniente(Quinta Normal/Pudahuel/Maipú),
  // Sur(San Bernardo) y Periférico(Peñaflor). Con solo 2 patentes para 6 corredores
  // distintos, la flota es deliberadamente escasa: es un caso límite donde el
  // sistema DEBE consolidar corredores (para no dejar sectores sin camión), así
  // que lo que se valida aquí no es que cada comuna quede en la misma "vuelta"
  // (una vuelta es solo un viaje del día; el mismo camión puede hacer 2 viajes
  // al mismo sector sin que eso sea un zigzag), sino que:
  //   1) La consolidación forzada por escasez de flota nunca deja una comuna
  //      aislada de sus vecinas de macro-sector cuando SÍ hay espacio para
  //      juntarlas (Huechuraba+Quilicura+Las Condes son todas macro "A";
  //      Santiago+Santiago Centro+Quinta Normal+Pudahuel+Maipú son macro "B").
  //   2) Todo pedido queda cubierto, sin duplicados, sin sobrecarga física.
  const pedidosRaw = [
    pedido({pedido:'427532', comuna:'HUECHURABA', direccion:'AMERICO VESPUCIO NORTE 1155', volumen:0.017}),
    pedido({pedido:'427591', comuna:'HUECHURABA', direccion:'AV AMERICO VESPUCIO 1737', volumen:0.274}),
    pedido({pedido:'427376', comuna:'LAS CONDES', direccion:'AUGUSTO LEGUIA NORTE 180', volumen:0.990}),
    pedido({pedido:'427032', comuna:'SANTIAGO', direccion:'SERRANO 654', volumen:11.438}),
    pedido({pedido:'426925', comuna:'SANTIAGO', direccion:'SERRANO 654', volumen:5.489}),
    pedido({pedido:'427620', comuna:'SANTIAGO', direccion:'SERRANO 654', volumen:2.937}),
    pedido({pedido:'427709', comuna:'SANTIAGO', direccion:'ALAMEDA 2826 PISO 3 LOCAL 6', volumen:0.407}),
    pedido({pedido:'427756', comuna:'SANTIAGO', direccion:'ALBERTO LO SECO 2270', volumen:0.121}),
    pedido({pedido:'427129', comuna:'SANTIAGO CENTRO', direccion:'SAN PABLO 2270', volumen:0.119}),
    pedido({pedido:'400001', comuna:'QUILICURA', direccion:'SAN CRISTOBAL 9581', volumen:0.046}),
    pedido({pedido:'427757', comuna:'QUINTA NORMAL', direccion:'ALBERTO LOSECO 2270', volumen:1.358}),
    pedido({pedido:'427661', comuna:'PUDAHUEL', direccion:'BODEGA PUDAHUEL CAMINO SAN PEDRO 9677', volumen:4.034}),
    pedido({pedido:'427318', comuna:'MAIPU', direccion:'SANTA ADELA 10377', volumen:2.908}),
    pedido({pedido:'600437', comuna:'SAN BERNARDO', direccion:'LAGO RIÑIGUE 2319', volumen:0.887}),
    pedido({pedido:'427734', comuna:'SAN BERNARDO', direccion:'AV PADRE HURTADO 14559', volumen:0.369}),
    pedido({pedido:'426767', comuna:'PEÑAFLOR', direccion:'BALMACEDA 2762 BODEGA B1A', volumen:0.116}),
  ];
  const totalVol = pedidosRaw.reduce((a,p)=>a+p.volumen,0);
  console.log('Total pedidos:', pedidosRaw.length, '| Total volumen:', totalVol.toFixed(2));

  const fleetDisp = [
    { patente:'SYBZ82', mts3:40, meta:22, transportista:'TRANSPORTES A Y J' },
    { patente:'LPYJ75', mts3:40, meta:22, transportista:'TRANSPORTES A Y J' },
  ];

  const res = await w.planificar(pedidosRaw, fleetDisp);
  console.log('\nFusiones de sector realizadas:', JSON.stringify(res.fusionesSector));
  console.log('\nRutas generadas:', res.rutas.length);
  res.rutas.forEach(r => {
    const comunas = [...new Set(r.stops.map(s=>s.comuna))];
    console.log('-', r.patente||'(SIN CAMION)', '| vuelta', r.vueltaNumero||1, '| vol', r.volumen.toFixed(2), '/', r.mts3, '| estado:', r.estado);
    console.log('  comunas:', comunas.join(', '));
  });

  // Helper: a qué patente (o "sin camión") le tocó una comuna dada (puede
  // aparecer en más de una vuelta del mismo camión; eso es válido).
  function patentesDeComuna(comuna){
    const set = new Set();
    res.rutas.forEach(r => { if(r.stops.some(s=>s.comuna===comuna)) set.add(r.patente||'(SIN CAMION)'); });
    return set;
  }

  // Check: Santiago y Santiago Centro deben quedar en el(los) MISMO(S) camión(es)
  // (aunque se repartan entre 2 vueltas de ese camión, nunca deben terminar en
  // camiones distintos: son la misma macro-zona B_CENTRO).
  const patSantiago = patentesDeComuna('SANTIAGO');
  const patSantiagoCentro = patentesDeComuna('SANTIAGO CENTRO');
  const mismoCamionSantiago = patSantiago.size===1 && patSantiagoCentro.size===1 && [...patSantiago][0]===[...patSantiagoCentro][0];

  // Check: Huechuraba y Quilicura (mismo A_NORTE) deben quedar en el mismo camión
  const patHuechuraba = patentesDeComuna('HUECHURABA');
  const patQuilicura = patentesDeComuna('QUILICURA');
  const mismoCamionNorte = patHuechuraba.size===1 && patQuilicura.size===1 && [...patHuechuraba][0]===[...patQuilicura][0];

  // Check: Quinta Normal / Pudahuel / Maipú (todos B_PONIENTE) deben quedar en el mismo camión
  const patQuintaNormal = patentesDeComuna('QUINTA NORMAL');
  const patPudahuel = patentesDeComuna('PUDAHUEL');
  const patMaipu = patentesDeComuna('MAIPU');
  const mismoCamionPoniente = patQuintaNormal.size===1 && patPudahuel.size===1 && patMaipu.size===1 &&
    [...patQuintaNormal][0]===[...patPudahuel][0] && [...patPudahuel][0]===[...patMaipu][0];

  const allStops = res.rutas.flatMap(r=>r.stops);
  const counts={}; allStops.forEach(s=>counts[s.pedido]=(counts[s.pedido]||0)+1);

  console.log('\n=== CHECKS ===');
  const checks = [
    ['Santiago y Santiago Centro terminan en el mismo camión (mismo macro-sector B)', mismoCamionSantiago],
    ['Huechuraba y Quilicura terminan en el mismo camión (mismo macro-sector A)', mismoCamionNorte],
    ['Quinta Normal, Pudahuel y Maipú terminan en el mismo camión (mismo macro-sector B)', mismoCamionPoniente],
    ['Se usó al menos 1 patente (sin dejar todo sin camión)', res.rutas.some(r=>r.patente)],
    ['Ninguna ruta con patente supera su capacidad física (mts3)', res.rutas.every(r=>!r.patente || r.volumen<=r.mts3+1e-6)],
    ['Sin pedidos duplicados', Object.values(counts).every(v=>v===1)],
    ['Todos los pedidos cubiertos', pedidosRaw.every(p=>counts[p.pedido]===1)],
  ];
  let ok = true;
  checks.forEach(([name, cond]) => { console.log((cond?'✅':'❌'), name); if(!cond) ok=false; });
  process.exit(ok?0:1);
})();
