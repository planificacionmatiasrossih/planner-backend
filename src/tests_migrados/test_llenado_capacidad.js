const w = require('../motor.js');

(async () => {

  function pedido(over) {
    return Object.assign({ pedido:'0', sucursal:'CLIENTE', comuna:'SANTIAGO', direccion:'CALLE 1',
      descripcionMaterial:'PROD', producto:'', sku:'1', cantidad:1, volumen:1.0 }, over);
  }
  // Un solo camion (mts3=40, meta=22) con volumen total que obliga a 2 vueltas
  // (bastante mas que 1 meta pero bastante menos que 2 metas), todo en el
  // mismo corredor (Centro) para no interferir con fusion de sectores.
  const pedidosRaw = [];
  for(let i=1;i<=20;i++){
    pedidosRaw.push(pedido({pedido:String(i), comuna:'SANTIAGO', direccion:'CALLE '+i, volumen:2.6}));
  }
  const totalVol = pedidosRaw.reduce((a,p)=>a+p.volumen,0);
  console.log('Total pedidos:', pedidosRaw.length, '| Total volumen:', totalVol.toFixed(2));

  const fleetDisp = [
    { patente:'AAAA11', mts3:40, meta:22, transportista:'T1' },
  ];

  const res = await w.planificar(pedidosRaw, fleetDisp);
  console.log('\nRutas generadas:', res.rutas.length);
  res.rutas.forEach(r => {
    console.log('-', r.patente||'(SIN CAMION)', '| vuelta', r.vueltaNumero||1, '| vol', r.volumen.toFixed(2), '/', r.mts3, '| estado:', r.estado);
  });

  const v1 = res.rutas.find(r=>r.patente && (r.vueltaNumero||1)===1);
  const v2 = res.rutas.find(r=>r.patente && (r.vueltaNumero||1)===2);

  console.log('\n=== CHECKS ===');
  const checks = [];
  checks.push(['Se abrieron ambas vueltas', !!v1 && !!v2]);
  if(v1 && v2){
    const diff = Math.abs(v1.volumen - v2.volumen);
    console.log('Diferencia entre vuelta 1 y 2:', diff.toFixed(2), 'm3');
    // A pedido explícito del usuario, ya NO se balancea por % entre vuelta 1 y
    // 2 de un mismo camión (eso partía comunas completas en 2 viajes solo por
    // parejar carga). Ahora la 1ª vuelta se llena hasta cerca de su capacidad
    // física antes de abrir la 2ª, así que un desbalance grande entre ambas es
    // esperado y correcto — lo único que se exige es que ninguna vuelta pase
    // su capacidad física y que la 1ª vuelta efectivamente vaya bien cargada.
    checks.push(['La 1ª vuelta se llena bien (>=85% de su capacidad física) antes de abrir la 2ª', v1.volumen >= 40*0.85 - 1e-6]);
    checks.push(['Ninguna vuelta supera la capacidad física (40 m3)', v1.volumen<=40+1e-6 && v2.volumen<=40+1e-6]);
  }
  const allStops = res.rutas.flatMap(r=>r.stops);
  const counts={}; allStops.forEach(s=>counts[s.pedido]=(counts[s.pedido]||0)+1);
  checks.push(['Sin duplicados', Object.values(counts).every(v=>v===1)]);
  checks.push(['Todos los pedidos cubiertos', pedidosRaw.every(p=>counts[p.pedido]===1)]);

  // Ahora probamos la deteccion de direccion con comuna inconsistente.
  const pedidosDir = [
    pedido({pedido:'900', comuna:'LO ESPEJO', direccion:'AV LO ESPEJO 01565', volumen:1}),
    pedido({pedido:'901', comuna:'SANTIAGO', direccion:'AV LO ESPEJO 01565', volumen:1}),
    pedido({pedido:'902', comuna:'MAIPU', direccion:'CALLE NORMAL 5', volumen:1}),
  ];
  const res2 = await w.planificar(pedidosDir, fleetDisp);
  console.log('\ndireccionesInconsistentes:', JSON.stringify(res2.direccionesInconsistentes));
  checks.push(['Detecta la dirección con comunas distintas (AV LO ESPEJO 01565)', (res2.direccionesInconsistentes||[]).length===1]);
  checks.push(['No marca la dirección normal (CALLE NORMAL 5) como inconsistente', (res2.direccionesInconsistentes||[]).every(d=>d.direccion!=='CALLE NORMAL 5')]);

  let ok = true;
  checks.forEach(([name, cond]) => { console.log((cond?'✅':'❌'), name); if(!cond) ok=false; });
  process.exit(ok?0:1);
})();
