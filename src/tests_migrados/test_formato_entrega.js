const w = require('../motor.js');

(async () => {

  console.log('=== Parseo del nuevo formato (18 columnas, con ENTREGA) ===');
  // Fila real tomada del ejemplo del usuario (tabulada):
  const fila18 = ['426073','1,000','101404','VASO 2.5L LIC 1380 VVL1380- 2.5','GRUPO MAR SpA','SAN CRSITOBAL','80379878','0,011','SAN CRSITOBAL 9581','QUILICURA','NORTE','20','17','33,5','SI','NO','NO','NO'];
  const p18 = w.parsearFilaPedido(fila18);
  console.log(JSON.stringify(p18, null, 2));

  const checks = [];
  checks.push(['pedido correcto', p18.pedido==='426073']);
  checks.push(['cantidad correcta', p18.cantidad===1]);
  checks.push(['sku correcto', p18.sku==='101404']);
  checks.push(['descripcionMaterial correcta', p18.descripcionMaterial==='VASO 2.5L LIC 1380 VVL1380- 2.5']);
  checks.push(['cliente correcto', p18.cliente==='GRUPO MAR SpA']);
  checks.push(['sucursal correcta', p18.sucursal==='SAN CRSITOBAL']);
  checks.push(['entrega correcta', p18.entrega==='80379878']);
  // El SKU 101404 existe en el catálogo Imega Ventus, así que su medida real
  // tiene prioridad sobre el volumen escrito a mano en la planilla (comportamiento
  // ya existente e intencional) — solo verificamos que quedó un volumen positivo.
  checks.push(['volumen quedó positivo (catálogo o planilla)', p18.volumen>0]);
  checks.push(['direccion correcta', p18.direccion==='SAN CRSITOBAL 9581']);
  checks.push(['comuna correcta', p18.comuna==='QUILICURA']);
  checks.push(['rotarEjeX correcto (SI)', p18.rotarEjeX===true]);
  checks.push(['montar correcto (NO)', p18.montar===false]);

  // Fila de 17 columnas (sin la última, Piso 1ro, por celda vacía al copiar)
  const fila17 = fila18.slice(0,17);
  const p17 = w.parsearFilaPedido(fila17);
  checks.push(['formato de 17 columnas también funciona (entrega)', p17.entrega==='80379878']);
  checks.push(['formato de 17 columnas también funciona (piso1ro undefined, no rompe)', p17.piso1ro===undefined]);

  console.log('\n=== Parseo del formato REAL corregido por el usuario (14 columnas, sin Sector ni dimensiones) ===');
  const fila14 = ['426073','1,000','101402','LICUADORA 1380 2.5L VL1380-V2.5','GRUPO MAR SpA','SAN CRSITOBAL','80381128','0,046','SAN CRSITOBAL 9581','QUILICURA','SI','NO ','NO','NO'];
  const p14 = w.parsearFilaPedido(fila14);
  console.log(JSON.stringify(p14, null, 2));
  checks.push(['(14 col) pedido correcto', p14.pedido==='426073']);
  checks.push(['(14 col) cliente correcto', p14.cliente==='GRUPO MAR SpA']);
  checks.push(['(14 col) sucursal correcta', p14.sucursal==='SAN CRSITOBAL']);
  checks.push(['(14 col) entrega correcta', p14.entrega==='80381128']);
  checks.push(['(14 col) direccion correcta', p14.direccion==='SAN CRSITOBAL 9581']);
  checks.push(['(14 col) comuna correcta', p14.comuna==='QUILICURA']);
  checks.push(['(14 col) rotarEjeX correcto (SI)', p14.rotarEjeX===true]);
  checks.push(['(14 col) rotarEjeY correcto (NO, con espacio extra)', p14.rotarEjeY===false]);
  checks.push(['(14 col) volumen quedó positivo', p14.volumen>0]);

  // Fila de 13 columnas (sin la última, Piso 1ro, por celda vacía al copiar)
  const fila13 = fila14.slice(0,13);
  const p13 = w.parsearFilaPedido(fila13);
  checks.push(['formato de 13 columnas también funciona (entrega)', p13.entrega==='80381128']);
  checks.push(['formato de 13 columnas también funciona (piso1ro undefined, no rompe)', p13.piso1ro===undefined]);

  // El formato viejo de 12 columnas (sin cliente/sucursal separados ni entrega) debe seguir funcionando igual que antes.
  const fila12 = ['999001','2','100722','VISI COOLER','CLIENTE X','1,5','CALLE FALSA 123','MAIPU','SI','NO','NO','NO'];
  const p12 = w.parsearFilaPedido(fila12);
  checks.push(['formato viejo de 12 columnas sigue funcionando', p12.pedido==='999001' && p12.sucursal==='CLIENTE X' && p12.comuna==='MAIPU' && p12.entrega===undefined]);

  console.log('\n=== Verifica que "entrega" llegue hasta la ruta final (planificar) ===');
  function pedido(over) {
    return Object.assign({ pedido:'0', sucursal:'CLIENTE', comuna:'SANTIAGO', direccion:'CALLE 1',
      descripcionMaterial:'PROD', producto:'', sku:'1', cantidad:1, volumen:1.0 }, over);
  }
  const pedidosRaw = [ pedido({pedido:'426073', comuna:'QUILICURA', direccion:'SAN CRISTOBAL 9581', volumen:2, entrega:'80379878'}) ];
  const fleetDisp = [{ patente:'AAAA11', mts3:40, meta:22, transportista:'T1' }];
  const res = await w.planificar(pedidosRaw, fleetDisp);
  const stopConEntrega = res.rutas.flatMap(r=>r.stops).find(s=>s.pedido==='426073');
  checks.push(['el campo entrega sobrevive la consolidación y queda en el stop final', !!stopConEntrega && stopConEntrega.entrega==='80379878']);

  console.log('\n=== CHECKS ===');
  let ok = true;
  checks.forEach(([name, cond]) => { console.log((cond?'✅':'❌'), name); if(!cond) ok=false; });
  process.exit(ok?0:1);
})();
