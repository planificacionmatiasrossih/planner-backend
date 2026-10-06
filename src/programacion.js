// programacion.js — Arma automáticamente "la programación" (lo que hoy se
// arma a mano copiando datos a la hoja CORREO) a partir de dos fuentes de
// datos de SAP: el export de "Documento de ventas" y el export de
// "Documento de ventas (VA05)".
//
// Puede recibir esas dos fuentes de dos formas distintas:
//   A) Como archivos .xlsx subidos directo (generarProgramacion)
//   B) Como filas ya leídas desde una pestaña de Google Sheets donde el
//      usuario las pega él mismo (generarProgramacionDesdeFilas), con un
//      "mapeo" que dice qué columna de la hoja corresponde a cada dato
//      (porque el usuario elige el nombre de la pestaña y puede pegar los
//      datos con encabezados levemente distintos a los de SAP).
//
// En ambos casos el motor de cruce es el mismo (generarProgramacionDesdeFilas):
// no depende de nada que calcule el planificador — estos datos de SAP ya
// traen, por pedido (OP), todo lo que hace falta, incluido el número de
// ruta/transporte, el chofer y la patente que se asignaron en SAP. Por eso
// esto se usa DESPUÉS de que la ruta ya quedó registrada en SAP.

const ExcelJS = require('exceljs');

// Encabezados finales, en el mismo orden y con el mismo texto que ya usa la
// hoja CORREO (incluido el "typo" histórico "REFERNCIA/OC", a propósito,
// para que lo que genere el programa calce 1 a 1 con lo que ya usas en la
// hoja de Google de Drivin).
const ENCABEZADOS_PROGRAMACION = [
  'RUTA', 'CONDUCTOR', 'PATENTE', 'OP', 'ENTREGA',
  'CLIENTE', 'REFERNCIA/OC', 'OBSERVACION', 'ALMACEN', 'VENDEDOR',
];

// Campos lógicos que necesitamos de cada fuente, con una etiqueta en
// castellano (para mostrar en el selector de columnas) y una lista de
// nombres de columna "candidatos" — como vienen de fábrica en el export de
// SAP — que se usan para adivinar automáticamente el mapeo (tanto al leer
// un archivo como para pre-rellenar el selector cuando se lee de Sheets).
const CAMPOS_VENTAS = [
  { campo: 'op', etiqueta: 'Número de pedido (OP)', candidatos: ['Número de pedido', 'Numero de pedido'], clave: true },
  { campo: 'entrega', etiqueta: 'N° de entrega', candidatos: ['Entrega'] },
  { campo: 'cliente', etiqueta: 'Nombre del cliente', candidatos: ['Nombre del cliente'] },
  { campo: 'referenciaOC', etiqueta: 'Referencia Orden de Compra', candidatos: ['Referencia Orden Compra'] },
  { campo: 'ruta', etiqueta: 'N° de transporte (RUTA)', candidatos: ['Nº de transporte', 'N° de transporte', 'Numero de transporte'] },
  { campo: 'patente', etiqueta: 'Patente', candidatos: ['Patente'] },
  { campo: 'conductor', etiqueta: 'Nombre de Chofer', candidatos: ['Nombre de Chofer'] },
  { campo: 'ciudad', etiqueta: 'Ciudad/DestMercancias', candidatos: ['Ciudad/DestMercancias'] },
  { campo: 'comuna', etiqueta: 'Comuna/DestMercancias', candidatos: ['Comuna/DestMercancias'] },
];
const CAMPOS_VA05 = [
  { campo: 'op', etiqueta: 'Documento de ventas (OP)', candidatos: ['Documento de ventas'], clave: true },
  { campo: 'almacen', etiqueta: 'Almacén', candidatos: ['Almacén', 'Almacen'] },
  { campo: 'vendedor', etiqueta: 'Creado por (vendedor)', candidatos: ['Creado por'] },
  { campo: 'observacion', etiqueta: 'Descripción del motivo de pedido', candidatos: ['Descripción del motivo de pedido', 'Descripcion del motivo de pedido'] },
];

function textoLimpio(v) {
  if (v == null) return '';
  if (v instanceof Date) return v;
  return String(v).trim();
}
function normalizar(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
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

// Dado un conjunto de filas (objetos {nombreColumna: valor}) y la lista de
// campos que buscamos, adivina qué columna real corresponde a cada campo
// comparando nombres sin importar mayúsculas/espacios. Devuelve un mapeo
// {campo: nombreColumnaEncontrada} — lo mismo que arma el selector manual
// del lado de Sheets, pero automático, para cuando viene de un archivo.
function detectarMapeo(filas, campos) {
  const mapeo = {};
  if (!filas.length) return mapeo;
  const headers = Object.keys(filas[0]);
  for (const { campo, candidatos } of campos) {
    for (const nombre of candidatos) {
      const encontrado = headers.find((h) => normalizar(h) === normalizar(nombre));
      if (encontrado) { mapeo[campo] = encontrado; break; }
    }
  }
  return mapeo;
}

// Indexa las filas de una fuente por su campo clave (OP), usando el mapeo
// {campoLogico: nombreColumnaReal} para saber de qué columna sacar cada
// dato. Se queda con la primera fila de cada clave (los datos son los
// mismos para todas las líneas de un mismo pedido).
function indexarPorMapeo(filas, mapeo, campoClave) {
  const porClave = new Map();
  const colClave = mapeo[campoClave];
  if (!colClave) return porClave;
  for (const fila of filas) {
    const clave = textoLimpio(fila[colClave]);
    if (!clave || porClave.has(clave)) continue;
    const obj = {};
    for (const campo of Object.keys(mapeo)) obj[campo] = textoLimpio(fila[mapeo[campo]]);
    porClave.set(clave, obj);
  }
  return porClave;
}

// --- Función principal (común a ambas vías): arma las filas de "la
// programación" a partir de filas ya leídas (de un archivo o de Sheets) más
// el mapeo de columnas de cada fuente. ---
function generarProgramacionDesdeFilas(filasVentas, filasVA05, mapeoVentas, mapeoVA05) {
  const ventasPorOP = indexarPorMapeo(filasVentas, mapeoVentas, 'op');
  const va05PorOP = indexarPorMapeo(filasVA05, mapeoVA05, 'op');

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
      _comuna: corregirComuna(v.ciudad, v.comuna),
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

// --- Vía A: arma la programación a partir de los dos archivos .xlsx ---
async function generarProgramacion(bufferExportVentas, bufferExportVA05) {
  const [filasVentas, filasVA05] = await Promise.all([
    leerFilasDeExcel(bufferExportVentas),
    leerFilasDeExcel(bufferExportVA05),
  ]);
  const mapeoVentas = detectarMapeo(filasVentas, CAMPOS_VENTAS);
  const mapeoVA05 = detectarMapeo(filasVA05, CAMPOS_VA05);
  return generarProgramacionDesdeFilas(filasVentas, filasVA05, mapeoVentas, mapeoVA05);
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
  generarProgramacionDesdeFilas,
  detectarMapeo,
  escribirExcelProgramacion,
  ENCABEZADOS_PROGRAMACION,
  CAMPOS_VENTAS,
  CAMPOS_VA05,
  corregirComuna,
};
