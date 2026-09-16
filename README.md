# Revisor-Articulos

Sistema web institucional para la revisión de **artículos académicos** de ITSQMET.

## Enlaces de GitHub Pages

Una vez finalice el workflow **Deploy GitHub Pages**:

- Administrador: `https://jeffer91.github.io/Revisor-Articulos/administrador/`
- Estudiante: `https://jeffer91.github.io/Revisor-Articulos/estudiante/`
- Portal: `https://jeffer91.github.io/Revisor-Articulos/`

## Estado actual

La interfaz completa está implementada y es navegable. Mientras `assets/config.js` no tenga un `API_BASE_URL`, los dos portales muestran un **modo demostración** para probar flujos, tablas, modales, carga de archivos, resultados y comparación de revisiones.

Las credenciales reales, PIN del administrador, cédulas de estudiantes y claves de IA **no se guardan en GitHub Pages**. La validación y la orquestación de modelos deben ejecutarse en Firebase Functions/Cloud Run u otro backend seguro.

## Reglas funcionales implementadas

- Dos portales independientes: Administrador y Estudiante.
- Administrador: acceso por usuario + PIN mediante backend seguro.
- Estudiante: acceso por cédula consultada en Firebase mediante backend.
- 3 revisiones iniciales por estudiante; el administrador puede restaurar o agregar intentos.
- Cada revisión ejecuta evaluación académica, referencias, similitud y posible uso de IA.
- Mínimo 3 y máximo 5 IA **exitosas** por revisión.
- Si una IA falla, se intenta la siguiente según prioridad.
- Si no se alcanzan 3 IA exitosas, la revisión queda incompleta y no consume intento.
- Las observaciones se consolidan por coincidencia/consenso.
- El estudiante ve cuántas IA participaron, pero no sus nombres.
- La nota académica, similitud y posible uso de IA son resultados independientes.
- Nota académica sobre 100; aprobación desde 70.
- 80 puntos corresponden a calidad académica y 20 a formato institucional ÉLITE.
- ORCID y año/volumen provisional de la revista no se penalizan.
- Las referencias deben verificarse como reales y respaldar la afirmación; se priorizan los últimos 5 años salvo clásicos indispensables.

## Rúbrica base de 100 puntos

| Área | Puntos |
|---|---:|
| Título y delimitación | 4 |
| Resumen, Abstract y palabras clave | 6 |
| Introducción, antecedentes y problema | 10 |
| Objetivos y coherencia | 6 |
| Metodología | 16 |
| Resultados | 12 |
| Discusión | 8 |
| Conclusiones y recomendaciones | 6 |
| Referencias | 7 |
| Redacción y coherencia global | 5 |
| Formato institucional ÉLITE | 20 |
| **Total** | **100** |

Un error metodológico grave debe activar alerta crítica y puede limitar la nota máxima según la regla académica configurada. Una referencia falsa/inexistente es una alerta crítica de integridad.

## API esperada

Configurar `assets/config.js` con la URL del backend:

```js
window.REVISOR_CONFIG = {
  API_BASE_URL: "https://...",
  DEMO_MODE: false,
  INSTITUTION: "ITSQMET",
  APP_NAME: "Revisión Académica"
};
```

Endpoints mínimos usados por el frontend:

```text
POST /auth/admin
  body: { usuario, pin }
  resp: { token }

POST /auth/student
  body: { cedula }
  resp: { token, student }

POST /reviews
  multipart/form-data: file
  resp: { id }

GET /reviews/:id/status
  resp: { status: queued|running|complete|incomplete|failed, step }

GET /reviews/:id
  resp: revisión consolidada

GET/POST/PUT /admin/models
POST /admin/models/:id/test
```

## Seguridad

No colocar en archivos públicos:

- usuario/PIN real del administrador,
- claves Gemini/OpenRouter/Groq,
- secretos de Firebase Admin,
- tokens privados,
- bases completas de cédulas.

GitHub Pages debe actuar únicamente como frontend. Las claves y llamadas a IA deben residir en el backend.

## Catálogo inicial de IA

El Administrador inicia con los 26 modelos definidos para el proyecto y permite agregar más sin cambiar el código. Cada modelo tiene prioridad, peso, estado, especialidad, endpoint, timeout, temperatura, tokens máximos y prompt específico. El peso inicial es 1 para todos.
