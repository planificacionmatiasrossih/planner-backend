const w = require('../motor.js');

(async () => {

  function pedido(over) {
    return Object.assign({ pedido:'0', sucursal:'CLIENTE', comuna:'SANTIAGO', direccion:'CALLE 1',
      descripcionMaterial:'PROD', producto:'', sku:'1', cantidad:1, volumen:1.0 }, over);
  }

  const CORREDOR_PADRE_LOCAL = {
    A_NORTE:'A', A_ORIENTE:'A', B_PONIENTE:'B', B_CENTRO:'B', C_SUR:'C', C_ORIENTE:'C', D_PERIFERICO:'D'
  };
  function macroDeComuna(comuna){
    const c = w.corredorOperativoDeStop({comuna: comuna});
    return c ? CORREDOR_PADRE_LOCAL[c] : null;
  }

  // ================= CASO 1: reproduce el zigzag reportado por el usuario =================
  // "enviando un camión a Huechuraba/Quilicura, luego a Pudahuel, y de ahí
  // cruzando hacia Las Condes o Santiago Centro en el mismo trayecto".
  // Con flota AMPLIA (no escasa: 5 patentes para 5 corredores en juego), el
  // sistema no debería tener ninguna razón para forzar una fusión entre
  // sectores opuestos — cada camión debería quedarse dentro de un solo
  // macro-sector (A/B/C/D).
  console.log('=== CASO 1: flota amplia, no debería cruzar macro-sectores ===');
  const pedidosCaso1 = [
    // Norte (A_NORTE)
    pedido({pedido:'1', comuna:'HUECHURABA', volumen:3}),
    pedido({pedido:'2', comuna:'QUILICURA', volumen:3}),
    pedido({pedido:'3', comuna:'LAMPA', volumen:2}),
    // Poniente (B_PONIENTE)
    pedido({pedido:'4', comuna:'PUDAHUEL', volumen:4}),
    pedido({pedido:'5', comuna:'MAIPU', volumen:3}),
    pedido({pedido:'6', comuna:'CERRO NAVIA', volumen:2}),
    // Nororiente (A_ORIENTE)
    pedido({pedido:'7', comuna:'LAS CONDES', volumen:3}),
    pedido({pedido:'8', comuna:'VITACURA', volumen:2}),
    // Centro (B_CENTRO)
    pedido({pedido:'9', comuna:'SANTIAGO CENTRO', volumen:3}),
    pedido({pedido:'10', comuna:'INDEPENDENCIA', volumen:2}),
    // Sur (C_SUR)
    pedido({pedido:'11', comuna:'SAN BERNARDO', volumen:3}),
    pedido({pedido:'12', comuna:'LA CISTERNA', volumen:2}),
  ];
  const fleetCaso1 = [
    { patente:'T1', mts3:40, meta:22, transportista:'FLOTA' },
    { patente:'T2', mts3:40, meta:22, transportista:'FLOTA' },
    { patente:'T3', mts3:40, meta:22, transportista:'FLOTA' },
    { patente:'T4', mts3:40, meta:22, transportista:'FLOTA' },
    { patente:'T5', mts3:40, meta:22, transportista:'FLOTA' },
  ];
  const res1 = await w.planificar(pedidosCaso1, fleetCaso1);
  console.log('Fusiones:', JSON.stringify(res1.fusionesSector));
  res1.rutas.forEach(r => {
    const comunas=[...new Set(r.stops.map(s=>s.comuna))];
    console.log('-', r.patente||'(SIN CAMION)', '| vuelta', r.vueltaNumero||1, '| comunas:', comunas.join(', '));
  });

  // Para cada camión (agrupando todas sus vueltas), sus paradas deben
  // pertenecer todas al mismo macro-sector.
  const porPatente1 = {};
  res1.rutas.forEach(r => {
    if(!r.patente) return;
    (porPatente1[r.patente]||(porPatente1[r.patente]=[])).push(...r.stops);
  });
  let sinCruceMacro1 = true;
  const detalleCruces1 = [];
  Object.keys(porPatente1).forEach(pat => {
    const macros = new Set(porPatente1[pat].map(s=>macroDeComuna(s.comuna)).filter(Boolean));
    if(macros.size>1){ sinCruceMacro1=false; detalleCruces1.push(pat+': '+[...macros].join('+')+' -> '+[...new Set(porPatente1[pat].map(s=>s.comuna))].join(', ')); }
  });
  if(detalleCruces1.length) console.log('\nCruces de macro-sector encontrados:\n'+detalleCruces1.join('\n'));

  const allStops1 = res1.rutas.flatMap(r=>r.stops);
  const counts1={}; allStops1.forEach(s=>counts1[s.pedido]=(counts1[s.pedido]||0)+1);

  // Nota: aunque sobre flota, es esperable que corredores CHICOS del mismo
  // macro-sector se fusionen igual (uso de flota mínima, Caso 2) — lo que NO
  // debe pasar nunca es que un camión termine con comunas de macro-sectores
  // distintos, que es justo lo que valida el check de abajo.
  const patentesUsadas1 = new Set(res1.rutas.filter(r=>r.patente).map(r=>r.patente));
  const checks1 = [
    ['Ningún camión mezcla dos macro-sectores distintos (con flota suficiente)', sinCruceMacro1],
    ['No se usaron más camiones de los necesarios (quedó flota de sobra sin gastar)', patentesUsadas1.size < fleetCaso1.length],
    ['Sin pedidos duplicados', Object.values(counts1).every(v=>v===1)],
    ['Todos los pedidos cubiertos', pedidosCaso1.every(p=>counts1[p.pedido]===1)],
  ];

  // ================= CASO 2: uso de flota mínima =================
  // Volumen total bajo (cabe holgadamente en 1 camión con 2 vueltas) pero se
  // seleccionan 3 patentes. El sistema no debería "gastar" las 3 si con 1
  // alcanza y sobra, cuando además todos los pedidos son del mismo sector.
  console.log('\n=== CASO 2: volumen bajo, debe usar la mínima flota posible ===');
  const pedidosCaso2 = [
    pedido({pedido:'20', comuna:'SANTIAGO', volumen:3}),
    pedido({pedido:'21', comuna:'SANTIAGO CENTRO', volumen:2}),
    pedido({pedido:'22', comuna:'INDEPENDENCIA', volumen:2}),
    pedido({pedido:'23', comuna:'MAIPU', volumen:3}),
    pedido({pedido:'24', comuna:'PUDAHUEL', volumen:2}),
  ];
  const fleetCaso2 = [
    { patente:'T1', mts3:40, meta:22, transportista:'FLOTA' },
    { patente:'T2', mts3:40, meta:22, transportista:'FLOTA' },
    { patente:'T3', mts3:40, meta:22, transportista:'FLOTA' },
  ];
  const res2 = await w.planificar(pedidosCaso2, fleetCaso2);
  console.log('Fusiones:', JSON.stringify(res2.fusionesSector));
  res2.rutas.forEach(r => {
    console.log('-', r.patente||'(SIN CAMION)', '| vuelta', r.vueltaNumero||1, '| vol', r.volumen.toFixed(2));
  });
  const patentesUsadas2 = new Set(res2.rutas.filter(r=>r.patente).map(r=>r.patente));
  const allStops2 = res2.rutas.flatMap(r=>r.stops);
  const counts2={}; allStops2.forEach(s=>counts2[s.pedido]=(counts2[s.pedido]||0)+1);
  const checks2 = [
    ['Se usó una sola patente (el volumen total cabe en 2 vueltas de 1 camión)', patentesUsadas2.size===1],
    ['Todos los pedidos cubiertos', pedidosCaso2.every(p=>counts2[p.pedido]===1)],
    ['Sin pedidos duplicados', Object.values(counts2).every(v=>v===1)],
  ];

  console.log('\n=== RESULTADOS ===');
  let ok = true;
  [...checks1, ...checks2].forEach(([name, cond]) => { console.log((cond?'✅':'❌'), name); if(!cond) ok=false; });
  process.exit(ok?0:1);
})();
