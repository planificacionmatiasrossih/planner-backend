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
const motor = require('./motor.js');

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

// Puerta de entrada de prueba, para confirmar que el servidor está vivo
// sin tener que mandarle datos complicados.
app.get('/api/salud', (req, res) => {
  res.json({ ok: true, mensaje: 'El servidor está funcionando', camionesEnFlota: motor.FLEET.length });
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

const PUERTO = process.env.PORT || 3000;
app.listen(PUERTO, () => {
  console.log(`Servidor del Planificador de Rutas escuchando en el puerto ${PUERTO}`);
});
