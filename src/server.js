// server.js — El servidor en sí. Expone "puertas de entrada" (endpoints) a
// las que cualquier programa (por ahora, lo vamos a probar a mano; después
// el HTML del planificador) le puede pedir que arme rutas.
//
// Por ahora tiene UNA sola puerta: POST /api/planificar
//   - Recibe: { pedidos: [...], flota: [...] }
//   - Hace: corre exactamente el mismo cálculo que hoy hace el HTML
//   - Devuelve: el resultado completo (rutas, excluidos, alertas, etc.)

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const motor = require('./motor.js');
const programacion = require('./programacion.js');

// Recibe los archivos subidos (los dos excel de SAP) directo en memoria, sin
// guardarlos en disco — se procesan y se descartan en la misma pedida.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const app = express();

// Sin esto, el navegador BLOQUEA la respuesta cuando el HTML vive en un
// lugar de internet distinto al del servidor (algo que va a pasar siempre
// que esto esté publicado) — es una protección de seguridad del navegador,
// no un error nuestro. Esta línea le dice "está bien, puede contestarle a
// quien sea".
app.use(cors());

// Permite que el servidor entienda pedidos en formato JSON (el formato
// estándar en que un programa le manda datos a otro por internet).
app.use(express.json({ limit: '10mb' }));

// Clave de acceso simple: si está configurada la variable de entorno
// API_KEY en Render, el servidor exige que cada pedido (menos el chequeo de
// salud) venga con esa misma clave en el encabezado "x-api-key". Así, aunque
// alguien encuentre la dirección del servidor, no puede pedirle que calcule
// rutas (y gaste cupo de Mapbox) sin la clave. Si no se configura ninguna
// clave, el servidor sigue funcionando abierto como hasta ahora.
const API_KEY = process.env.API_KEY || '';
app.use(function(req, res, next) {
  if (!API_KEY) return next();
  if (req.path === '/api/salud') return next();
  if (req.get('x-api-key') !== API_KEY) {
    return res.status(401).json({ ok: false, error: 'Clave de acceso inválida o faltante.' });
  }
  next();
});

// Puerta de entrada de prueba, para confirmar que el servidor está vivo
// sin tener que mandarle datos complicados.
app.get('/api/salud', (req, res) => {
  res.json({ ok: true, mensaje: 'El servidor está funcionando', camionesEnFlota: motor.FLEET.length });
});

// Para chequear en cualquier momento cuánto se lleva usado del límite
// gratis mensual de Mapbox (geocoding y cálculo de rutas reales), sin tener
// que entrar al panel de Mapbox.
app.get('/api/uso-mapbox', (req, res) => {
  res.json({ ok: true, uso: motor.estadoUsoMapbox() });
});

// Para confirmar que OSRM (el afinado gratis del orden de las paradas) está
// respondiendo: cuenta cuántas veces respondió bien y cuántas falló desde
// que el servidor arrancó.
app.get('/api/estado-osrm', (req, res) => {
  res.json({ ok: true, osrm: motor.estadoOSRM() });
});

// La puerta de entrada principal: arma las rutas.
app.post('/api/planificar', async (req, res) => {
  try {
    const { pedidos, flota } = req.body || {};
    if (!Array.isArray(pedidos) || !Array.isArray(flota)) {
      return res.status(400).json({ ok: false, error: 'Faltan "pedidos" o "flota" en el pedido, o no son listas.' });
    }
    const resultado = await motor.planificar(pedidos, flota);
    res.json({ ok: true, resultado });
  } catch (e) {
    console.error('Error en /api/planificar:', e);
    res.status(500).json({ ok: false, error: e.message || 'Error interno al planificar.' });
  }
});

// Arma "la programación" (lo que hoy se pega a mano en la hoja CORREO) a
// partir de los dos archivos que se descargan de SAP: el export de
// "Documento de ventas" y el export VA05. Devuelve el Excel ya armado, listo
// para descargar y enviar por correo, más un aviso de qué pedidos no se
// pudieron cruzar (por si falta alguno en el VA05).
app.post('/api/generar-programacion', upload.fields([
  { name: 'exportVentas', maxCount: 1 },
  { name: 'exportVA05', maxCount: 1 },
]), async (req, res) => {
  try {
    const archivos = req.files || {};
    const fVentas = archivos.exportVentas && archivos.exportVentas[0];
    const fVA05 = archivos.exportVA05 && archivos.exportVA05[0];
    if (!fVentas || !fVA05) {
      return res.status(400).json({ ok: false, error: 'Faltan los dos archivos (exportVentas y exportVA05).' });
    }
    const { filas, pedidosSinVA05 } = await programacion.generarProgramacion(fVentas.buffer, fVA05.buffer);
    // Por defecto devuelve los datos en JSON (así el mismo resultado sirve
    // para armar el Excel en el navegador Y para mandarlo a Google Sheets,
    // sin tener que subir los archivos dos veces). Si el pedido pide el
    // Excel directo (?descargar=1), devuelve el archivo ya armado.
    if (req.query.descargar) {
      const buffer = await programacion.escribirExcelProgramacion(filas);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="programacion.xlsx"');
      return res.send(Buffer.from(buffer));
    }
    const filasLimpias = filas.map((f) => {
      const { _comuna, _direccion, _tieneVA05, ...resto } = f;
      return resto;
    });
    res.json({ ok: true, filas: filasLimpias, pedidosSinVA05, encabezados: programacion.ENCABEZADOS_PROGRAMACION });
  } catch (e) {
    console.error('Error en /api/generar-programacion:', e);
    res.status(500).json({ ok: false, error: e.message || 'Error interno al generar la programación.' });
  }
});

const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => {
  console.log(`Servidor del Planificador de Rutas escuchando en el puerto ${PUERTO}`);
});
