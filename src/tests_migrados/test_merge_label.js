const w = require('../motor.js');

(async () => {

  function pedido(over) {
    return Object.assign({ pedido:'0', sucursal:'CLIENTE', comuna:'SANTIAGO', direccion:'CALLE 1',
      descripcionMaterial:'PROD', producto:'', sku:'1', cantidad:1, volumen:1.0 }, over);
  }
  // Aproximación al caso reportado: 3 patentes (una con 2 vueltas) para 7 corredores,
  // incluyendo una comuna con alias ("COLINA ESTACION" -> COLINA).
  const pedidosRaw = [
    pedido({pedido:'1', comuna:'SANTIAGO', volumen:3}),
    pedido({pedido:'2', comuna:'ESTACION CENTRAL', volumen:2}),
    pedido({pedido:'3', comuna:'SANTIAGO CENTRO', volumen:1}),
    pedido({pedido:'4', comuna:'MAIPU', volumen:2}),
    pedido({pedido:'5', comuna:'LO ESPEJO', volumen:2}),
    pedido({pedido:'6', comuna:'PUDAHUEL', volumen:2}),
    pedido({pedido:'7', comuna:'HUECHURABA', volumen:3}),
    pedido({pedido:'8', comuna:'QUINTA NORMAL', volumen:3}),
    pedido({pedido:'9', comuna:'LAMPA', volumen:2}),
    pedido({pedido:'10', comuna:'QUILICURA', volumen:2}),
    pedido({pedido:'11', comuna:'PROVIDENCIA', volumen:2}),
    pedido({pedido:'12', comuna:'LAS CONDES', volumen:2}),
    pedido({pedido:'13', comuna:'COLINA ESTACION', volumen:1}), // alias -> COLINA
    pedido({pedido:'14', comuna:'NUNOA', volumen:2}),
    pedido({pedido:'15', comuna:'MACUL', volumen:2}),
    pedido({pedido:'16', comuna:'SAN MIGUEL', volumen:2}),
    pedido({pedido:'17', comuna:'LA FLORIDA', volumen:2}),
    pedido({pedido:'18', comuna:'PUENTE ALTO', volumen:2}),
    pedido({pedido:'19', comuna:'SAN BERNARDO', volumen:3}),
  ];
  const totalVol = pedidosRaw.reduce((a,p)=>a+p.volumen,0);
  console.log('Total pedidos:', pedidosRaw.length, '| Total volumen:', totalVol.toFixed(2));

  const fleetDisp = [
    { patente:'SYBZ82', mts3:40, meta:22, transportista:'TRANSPORTES A Y J' },
    { patente:'DTSG49', mts3:40, meta:22, transportista:'TRANSPORTES A Y J' },
    { patente:'LPYJ75', mts3:40, meta:22, transportista:'TRANSPORTES A Y J' },
  ];

  const res = await w.planificar(pedidosRaw, fleetDisp);
  console.log('\nFusiones de sector realizadas:', JSON.stringify(res.fusionesSector));
  console.log('\nRutas generadas:', res.rutas.length);
  res.rutas.forEach(r => {
    const comunas = r.stops.map(s=>s.comuna);
    const pctMeta = r.meta ? (100*r.volumen/r.meta).toFixed(0)+'%' : '-';
    console.log('-', r.patente||'(SIN CAMION)', '| vuelta', r.vueltaNumero||1, '| vol', r.volumen.toFixed(2), '/', r.mts3, '(' + pctMeta + ' de meta)', '| estado:', r.estado);
    console.log('  zona:', r.zona, '| corredorLabel:', r.corredorLabel);
    console.log('  comunas:', comunas.join(', '));
  });

  // Checks
  console.log('\n=== CHECKS ===');
  const checks = [];

  // 1) COLINA ESTACION no debe caer en "SIN CORREDOR" / contingencia de auditoria
  const rutaColina = res.rutas.find(r => r.stops.some(s=>String(s.pedido)==='13'));
  checks.push(['COLINA ESTACION (alias) fue clasificada en un corredor real, no SIN CORREDOR', !!rutaColina && rutaColina.corredorCodigo && rutaColina.corredorCodigo!=='SIN_CORREDOR' && rutaColina.estado.indexOf('ASIGNACIÓN GARANTIZADA')===-1]);

  // 2) La zona mostrada en cada ruta debe ser coherente con las comunas reales que contiene
  //    (para cada ruta, cada comuna presente debe pertenecer a alguno de los corredores
  //    mencionados en la etiqueta "zona").
  const CORREDOR_LABEL_LOCAL = {
    A_NORTE:"Norte", A_ORIENTE:"Nororiente", B_PONIENTE:"Poniente", B_CENTRO:"Centro",
    C_SUR:"Sur", C_ORIENTE:"Suroriente", D_PERIFERICO:"Periférico Sur"
  };
  function corredorDeComuna(comuna){
    return w.corredorOperativoDeStop({comuna: comuna});
  }
  let etiquetasCoherentes = true;
  const incoherencias = [];
  res.rutas.forEach(r => {
    if(!r.zona || !r.stops.length) return;
    const labelsEnZona = r.zona.split(' + ').map(s=>s.trim());
    r.stops.forEach(s => {
      const c = corredorDeComuna(s.comuna);
      const labelReal = c ? CORREDOR_LABEL_LOCAL[c] : null;
      if(labelReal && labelsEnZona.indexOf(labelReal)===-1){
        etiquetasCoherentes = false;
        incoherencias.push(r.patente+'/'+(r.vueltaNumero||1)+': comuna '+s.comuna+' (corredor '+labelReal+') no está en zona "'+r.zona+'"');
      }
    });
  });
  checks.push(['Todas las etiquetas de zona son coherentes con las comunas reales de la ruta', etiquetasCoherentes]);
  if(incoherencias.length) console.log('\nIncoherencias encontradas:\n' + incoherencias.join('\n'));

  // 3) Cobertura total sin duplicados
  const allStops = res.rutas.flatMap(r=>r.stops);
  const counts={}; allStops.forEach(s=>counts[s.pedido]=(counts[s.pedido]||0)+1);
  checks.push(['Sin pedidos duplicados', Object.values(counts).every(v=>v===1)]);
  checks.push(['Todos los pedidos cubiertos', pedidosRaw.every(p=>counts[p.pedido]===1)]);

  let ok = true;
  checks.forEach(([name, cond]) => { console.log((cond?'✅':'❌'), name); if(!cond) ok=false; });
  process.exit(ok?0:1);
})();
