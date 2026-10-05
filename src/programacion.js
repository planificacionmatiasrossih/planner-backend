// programacion.js — Arma automáticamente "la programación" (lo que hoy se
// arma a mano copiando datos a la hoja CORREO) a partir de los DOS archivos
// que se descargan de SAP:
//   1) El export de "Documento de ventas" (columnas tipo Hoja1.0 / EXPORT.xlsx)
//   2) El export de "Documento de ventas (VA05)" (columnas tipo Hoja 2 / prueba.XLSX)
//
// No depende de nada que calcule el planificador: estos dos archivos de SAP
// ya traen, por pedido (OP), todo lo que hace falta — incluido el número de
// ruta/transporte, el chofer y la patente que se asignaron en SAP. Por eso
// esto se sube DESPUÉS de que la ruta ya quedó registrada en SAP (que es
// exactamente el momento en que hoy se arma a mano en Excel).
//
// Si en algún archivo real los nombres de columna vienen levemente distintos
// (espacios, mayúsculas), buscarEncabezado() los encuentra por coincidencia
// flexible en vez de exigir el nombre exacto.

const ExcelJS = require('exceljs');

// Encabezados finales, en el mismo orden y con el mismo texto que ya usa la
// hoja CORREO (incluido el "typo" histórico "REFERNCIA/OC", a propósito,
// para que lo que genere el programa calce 1 a 1 con lo que ya usas en la
// hoja de Google de Drivin).
const ENCABEZADOS_PROGRAMACION = [
  'RUTA', 'CONDUCTOR', 'PATENTE', 'OP', 'ENTREGA',
  'CLIENTE', 'REFERNCIA/OC', 'OBSERVACION', 'ALMACEN', 'VENDEDOR',
];

// --- Lectura genérica de un .xlsx (primera hoja, primera fila = encabezados) ---
async function leerFilasDeExcel(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const hoja = wb.worksheets[0];
  if (!hoja) return [];

  const encabezados = {};
  hoja.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const texto = (cell.value == null ? '' : String(cell.value)).trim();
    if (texto) encabezados[colNumber] = texto;
  });

  const filas = [];
  hoja.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const nombre = encabezados[colNumber];
      if (!nombre) return;
      obj[nombre] = limpiarValorCelda(cell.value);
    });
    // Salta filas totalmente vacías
    if (Object.values(obj).some((v) => v !== '' && v != null)) filas.push(obj);
  });
  return filas;
}

function limpiarValorCelda(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    if (v.text != null) return v.text; // celdas con formato "rich text"
    if (v.result != null) return v.result; // fórmulas ya calculadas
  }
  return v;
}

// Busca una columna por nombre tolerando mayúsculas/minúsculas y espacios
// extra, para que un cambio menor en el export de SAP no rompa todo.
function buscarValor(fila, nombresPosibles) {
  const claves = Object.keys(fila);
  for (const nombre of nombresPosibles) {
    const objetivo = normalizar(nombre);
    const clave = claves.find((k) => normalizar(k) === objetivo);
    if (clave !== undefined) return fila[clave];
  }
  return '';
}
function normalizar(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function textoLimpio(v) {
  if (v == null) return '';
  if (v instanceof Date) return v;
  return String(v).trim();
}

// La misma corrección que ya tenías en la fórmula de Excel:
// =IF(Comuna="SANTIAGO", Ciudad, Comuna)
// SAP a veces informa la comuna real solo en el campo "Ciudad" y deja
// "Comuna" en el valor genérico "SANTIAGO".
function corregirComuna(ciudad, comuna) {
  const c = textoLimpio(comuna).toUpperCase();
  if (c === 'SANTIAGO') return textoLimpio(ciudad);
  return textoLimpio(comuna);
}

// --- Procesa el export de "Documento de ventas" (EXPORT.xlsx / Hoja1.0) ---
// Devuelve un mapa OP -> datos, quedándose con la primera línea de cada
// pedido (los datos de ruta/cliente/dirección son los mismos para todas las
// líneas de un mismo pedido).
function indexarExportVentas(filas) {
  const porOP = new Map();
  for (const fila of filas) {
    const op = textoLimpio(buscarValor(fila, ['Número de pedido', 'Numero de pedido']));
    if (!op || porOP.has(op)) continue;
    const ciudad = buscarValor(fila, ['Ciudad/DestMercancias']);
    const comuna = buscarValor(fila, ['Comuna/DestMercancias']);
    porOP.set(op, {
      op,
      entrega: textoLimpio(buscarValor(fila, ['Entrega'])),
      cliente: textoLimpio(buscarValor(fila, ['Nombre del cliente'])),
      referenciaOC: textoLimpio(buscarValor(fila, ['Referencia Orden Compra'])),
      ruta: textoLimpio(buscarValor(fila, ['Nº de transporte', 'N° de transporte', 'Numero de transporte'])),
      patente: textoLimpio(buscarValor(fila, ['Patente'])),
      conductor: textoLimpio(buscarValor(fila, ['Nombre de Chofer'])),
      comuna: corregirComuna(ciudad, comuna),
      direccion: [textoLimpio(buscarValor(fila, ['Calle/DestMercancias'])), textoLimpio(buscarValor(fila, ['Nro. Edificio/DestMercancias']))].filter(Boolean).join(' '),
    });
  }
  return porOP;
}

// --- Procesa el export VA05 (prueba.XLSX / Hoja 2) ---
function indexarExportVA05(filas) {
  const porOP = new Map();
  for (const fila of filas) {
    const op = textoLimpio(buscarValor(fila, ['Documento de ventas']));
    if (!op || porOP.has(op)) continue;
    porOP.set(op, {
      almacen: textoLimpio(buscarValor(fila, ['Almacén', 'Almacen'])),
      vendedor: textoLimpio(buscarValor(fila, ['Creado por'])),
      observacion: textoLimpio(buscarValor(fila, ['Descripción del motivo de pedido', 'Descripcion del motivo de pedido'])),
    });
  }
  return porOP;
}

// --- Función principal: arma las filas de "la programación" ---
// bufferExportVentas: el .xlsx de "Documento de ventas" (EXPORT.xlsx)
// bufferExportVA05: el .xlsx de "Documento de ventas (VA05)" (prueba.XLSX)
async function generarProgramacion(bufferExportVentas, bufferExportVA05) {
  const [filasVentas, filasVA05] = await Promise.all([
    leerFilasDeExcel(bufferExportVentas),
    leerFilasDeExcel(bufferExportVA05),
  ]);
  const ventasPorOP = indexarExportVentas(filasVentas);
  const va05PorOP = indexarExportVA05(filasVA05);

  const filasProgramacion = [];
  for (const [op, v] of ventasPorOP) {
    const extra = va05PorOP.get(op) || {};
    filasProgramacion.push({
      RUTA: v.ruta || '-',
      CONDUCTOR: v.conductor || '-',
      PATENTE: v.patente || '-',
      OP: op,
      ENTREGA: v.entrega || '-',
      CLIENTE: v.cliente || '-',
      'REFERNCIA/OC': v.referenciaOC || '',
      OBSERVACION: extra.observacion || '.',
      ALMACEN: extra.almacen || '-',
      VENDEDOR: extra.vendedor || '-',
      // Datos extra, no van en el Excel/Sheets final pero sirven para avisos.
      _comuna: v.comuna,
      _direccion: v.direccion,
      _tieneVA05: va05PorOP.has(op),
    });
  }
  // Ordena por RUTA y luego por OP, como suele quedar la planilla.
  filasProgramacion.sort((a, b) => {
    if (a.RUTA !== b.RUTA) return String(a.RUTA).localeCompare(String(b.RUTA));
    return String(a.OP).localeCompare(String(b.OP));
  });

  const pedidosSinVA05 = filasProgramacion.filter((f) => !f._tieneVA05).map((f) => f.OP);

  return { filas: filasProgramacion, pedidosSinVA05 };
}

// --- Genera el archivo .xlsx final, listo para enviar por correo ---
async function escribirExcelProgramacion(filas) {
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet('Programación');
  hoja.columns = ENCABEZADOS_PROGRAMACION.map((h) => ({ header: h, key: h, width: Math.max(14, h.length + 4) }));
  const headerRow = hoja.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2933' } };
  });
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  hoja.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + ENCABEZADOS_PROGRAMACION.length)}1` };

  for (const fila of filas) {
    const row = {};
    for (const h of ENCABEZADOS_PROGRAMACION) row[h] = fila[h];
    hoja.addRow(row);
  }
  return wb.xlsx.writeBuffer();
}

module.exports = {
  generarProgramacion,
  escribirExcelProgramacion,
  ENCABEZADOS_PROGRAMACION,
  corregirComuna, // exportado también por si el motor de geocodificación lo quiere usar
};
