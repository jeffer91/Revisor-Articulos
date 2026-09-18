# Revisor-Articulos

Sistema web institucional para revisión académica de artículos de titulación.

## Producción

- Portal: `https://jeffer91.github.io/Revisor-Articulos/`
- Administrador: `https://jeffer91.github.io/Revisor-Articulos/administrador/`
- Estudiante: `https://jeffer91.github.io/Revisor-Articulos/estudiante/`
- Investigación: `https://jeffer91.github.io/Revisor-Articulos/investigacion/`
- API: `https://revisor-articulos-api-v3.onrender.com`

El frontend se publica en GitHub Pages. El backend Node.js se ejecuta en Render y persiste configuración, trabajos, revisiones e intentos en PostgreSQL.

## Motor académico V4

La nota se calcula sobre 100 mediante 47 microcriterios y cinco niveles proporcionales:

- Cumple = 100 % del peso.
- Parcial alto = 75 %.
- Parcial = 50 %.
- Parcial bajo = 25 %.
- No cumple = 0 %.

Los 12 criterios son:

| Criterio | Puntos |
|---|---:|
| Coherencia título–problema–pregunta–objetivos | 8 |
| Problema y justificación | 6 |
| Fundamentación teórica y antecedentes | 8 |
| Diseño metodológico | 10 |
| Instrumentos y rigor de la obtención de información | 8 |
| Población, muestra y recopilación | 7 |
| Procesamiento y análisis de datos | 8 |
| Resultados | 15 |
| Discusión académica | 10 |
| Conclusiones | 8 |
| Aporte, utilidad y propuesta | 6 |
| Calidad académica formal | 6 |
| **Total** | **100** |

La aprobación académica ordinaria se calcula desde 70/100. Una condición crítica solo puede bloquear la aprobación cuando una segunda IA independiente, de otra familia de modelo, la confirma.

## Orquestación resiliente

La revisión necesita tres carriles académicos completos:

1. Problema y fundamentación.
2. Metodología y análisis.
3. Resultados y cierre.

El sistema selecciona revisores por especialidad, prioridad, historial real de éxito, latencia y fallos recientes. Si un proveedor tarda, puede iniciar un revisor alternativo. La llamada perdedora se cancela cuando otro revisor completa primero. Si faltan proveedores independientes, existe reutilización controlada y respaldo final.

Los estados operativos son: Operativa, Degradada, En espera, Error de configuración e Inactiva. `Procesando` y las cancelaciones por hedging no cuentan como fallos del proveedor.

## Comentarios

La calificación siempre considera los 47 microcriterios, pero el informe visible no genera un comentario por cada descuento.

- Máximo 2 propuestas por carril y 5 comentarios prioritarios finales.
- Problemas con la misma causa raíz se consolidan.
- Los comentarios se ordenan por página.
- En PDF, el backend vuelve a localizar el fragmento citado dentro de los marcadores `[Página N]`.
- Si un supuesto “Texto observado” no puede verificarse contra el texto extraído, no se presenta como cita literal.
- DOCX no conserva paginación física fiable; en esos casos puede mostrarse ubicación no determinada.

## Seguridad

Las claves de IA, el hash administrativo, el secreto de sesiones y la configuración usada por el backend no se guardan en el frontend público.

El backend emite sesiones HMAC separadas para:

- Administrador.
- Estudiante.
- Investigación.

Los estudiantes se validan desde el backend contra el registro institucional antes de obtener un token. Las rutas de estado, revisión y resultado verifican la sesión y la propiedad del trabajo.

Los intentos estudiantiles se reservan de forma atómica en PostgreSQL para impedir revisiones simultáneas que excedan el cupo. También existe limitación temporal de inicios de revisión.

El portal Investigación exige autenticación y no consume la cuota de un estudiante.

## Similitud y posible IA

El valor de similitud actual es un **indicador orientativo generado por los modelos**. No equivale a un informe de Turnitin, iThenticate u otro servicio externo de antiplagio y no debe interpretarse como porcentaje probado de plagio.

La estimación de posible uso de IA también es orientativa y no constituye prueba concluyente.

La verificación externa de DOI, Crossref/OpenAlex y un motor especializado de similitud son integraciones futuras separadas del motor académico.

## Archivos

El navegador extrae texto de PDF y DOCX antes de enviarlo al backend.

- PDF conserva marcadores de página para ubicar comentarios.
- DOCX se procesa como texto continuo.
- Máximo de interfaz: 25 MB.
- Máximo de PDF: 100 páginas.
- PDF escaneado sin texto seleccionable requiere OCR y actualmente puede rechazarse.
- La revisión no inspecciona de forma fiable tipografía, márgenes, diagramación o contenido puramente visual.

## Administrador

El panel obtiene del backend:

- modelos y estado operativo;
- métricas reales de éxito y latencia;
- trabajos de revisión centralizados;
- resultados e historial;
- alertas críticas derivadas de revisiones reales.

Las estadísticas de frecuencia se calculan desde las observaciones almacenadas; no utilizan valores demo fijos.

“Agregar revisión” aumenta el cupo total de un estudiante. “Restaurar última revisión” marca una revisión completada como no consumida sin borrar su historial.

## Desarrollo

Backend:

```bash
cd backend
npm ci
npm test
npm start
```

Node está fijado a la rama 24.x. El workflow `Backend checks` ejecuta pruebas de integridad sobre la rúbrica, microcriterios, autenticación y reserva de intentos.

## Despliegue

GitHub Pages y Render siguen la rama `main`. Para cambios grandes se recomienda validar primero en una rama de trabajo y mover `main` solo después de pasar las comprobaciones.

## Pendientes de infraestructura

La aplicación todavía depende de una única instancia web y de la disponibilidad de proveedores externos de IA. Para uso institucional de alta concurrencia conviene evolucionar a una cola/worker persistente y a infraestructura de base de datos sin vencimiento temporal ni dependencia de plan gratuito.
