# Falcon CRM

Mini CRM de un solo usuario para Falcon Electronic: contactos (nombre y
WhatsApp) y envío por WhatsApp de imágenes referenciales (cotizaciones,
catálogos, sugerencias). Se publica en https://falcon-crm.web.app.

- **Contactos**: nombre, número (+51 por defecto), etapa, etiquetas y notas.
  Tienen búsqueda, filtro por etapa e historial de envíos.
- **Enviar por WhatsApp**: eliges una imagen (de la biblioteca, del contacto o
  una nueva) y una plantilla, y editas el mensaje.
  - *Abrir WhatsApp*: abre `wa.me/<número>` con el texto listo y el **enlace** a
    la imagen. Funciona en PC y en celular. wa.me no permite adjuntar archivos.
  - *Compartir imagen* (solo en el celular): adjunta la **imagen** con el
    menú Compartir del sistema. Hay que elegir el chat en WhatsApp, y el texto
    queda copiado por si WhatsApp lo descarta.
- **Biblioteca**: imágenes reutilizables en Firebase Storage.
- **Plantillas**: mensajes con `{nombre}`, `{nombre_completo}` y `{enlace}`.
- **Cotizaciones**: desde la ficha, en *Nueva cotización*, eliges productos del
  catálogo de Supabase o agregas ítems libres, ajustas precio, cantidad,
  fechas y condiciones, y la app genera un **PNG** y un **PDF** con el diseño
  de marca. La imagen queda en la ficha del contacto y se abre directo el envío
  por WhatsApp.
  - Numeración `AAAA-DDMM-n`, correlativo por día (`2026-2509-1`). Se reserva
    con una transacción en `counters/quote-AAAA-DDMM`, así que requiere
    conexión.
  - Precios con IGV. El valor de venta y el IGV (18 %) se desglosan del total.
  - Los datos de la empresa, las cuentas, el QR de Yape y las condiciones por
    defecto se editan en **Ajustes**.
  - Cada cotización tiene estado (*Pendiente*, *Aceptada* o *Rechazada*); al
    aceptarla, el contacto pasa a *Ganado*. **Duplicar** la reabre con los
    mismos ítems para otro cliente.
- **Panel de resumen**: soles cotizados en el mes, monto por cerrar,
  seguimientos del día y tasa de cierre. En escritorio ocupa el panel derecho;
  en el celular va arriba de la lista.
- **Seguimientos**: al enviar se elige "recordar en 1/3/7 días", y la ficha
  permite fijar o posponer la fecha. *Hoy toca contactar* lista los pendientes
  con WhatsApp directo (plantilla Seguimiento), "+3 d" y "hecho".
- **Tablero** (escritorio): columnas por etapa; se arrastra la tarjeta para
  cambiar de etapa.
- **Importar contactos** desde Excel/CSV o pegando una lista: detecta las
  columnas de nombre y celular, marca duplicados y omite filas incompletas.
- **IA con OpenRouter** (Ajustes → Inteligencia artificial): una API key de
  OpenRouter y un modelo por tarea, elegido de la lista pública de modelos
  ordenada por costo por uso.
  - *Armar con IA* (editor de cotización): pegas el mensaje del cliente y la IA
    propone los ítems del catálogo de Supabase con su precio. Los servicios o
    productos que no están en el catálogo entran a S/ 0, resaltados para que les
    pongas precio. Un id inventado por el modelo nunca se acepta como producto.
  - *Analizar chat* (ficha del contacto): pegas la conversación y la IA propone
    etapa, etiquetas, notas y fecha de seguimiento (cada cambio se aplica solo si
    lo marcas), además de una respuesta lista para WhatsApp.
  - Se prefieren los modelos con salida estructurada (`json_schema` estricto y
    `provider.require_parameters`). Con los demás, el esquema va en el prompt y el
    JSON se valida al leerlo.
  - La key vive en `private/ai` de Firestore (solo el dueño la lee) y se usa
    desde el navegador. Conviene ponerle un límite de crédito en OpenRouter.
- **Enlaces cortos**: las imágenes se envían como `falcon-crm.web.app/v/xxxx`
  en lugar de la URL larga de Storage. Esa página es pública y redirige a la
  imagen. El código es aleatorio, así que no se pueden adivinar otras
  cotizaciones. WhatsApp no muestra miniatura para estos enlaces, porque la
  redirección ocurre en el navegador.

Stack: React, Vite y Firebase (Auth con Google, Firestore con caché offline y
Storage).

## Puesta en marcha (una sola vez)

1. En la consola de Firebase del proyecto **crm-falcons**:
   - *Authentication* → Sign-in method → habilitar **Google**.
     En *Settings → Authorized domains* deben figurar `falcon-crm.web.app` y
     `localhost`.
   - *Firestore Database* → crear la base de datos (modo producción).
   - *Storage* → crear el bucket.
   - *Configuración del proyecto* → *Tus apps* → registrar una app web y
     copiar el `firebaseConfig`.
2. La config de Firebase ya está en `.env.production` (es pública). Para
   desarrollo, copiarla a `.env.local`.
3. Desplegar las reglas de seguridad, que solo permiten el correo del dueño:
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules,storage
   ```
4. Habilitar CORS del bucket. Sin esto, "Compartir imagen" no puede
   descargar las imágenes de la biblioteca:
   ```bash
   gcloud storage buckets update gs://crm-falcons.firebasestorage.app --cors-file=cors.json
   ```
   (o `gsutil cors set cors.json gs://<bucket>`).

5. Catálogo de productos (Supabase). En `.env.production` van
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (nunca la `service_role`) y el
   mapeo de tabla y columnas `VITE_PRODUCTS_*` (ver `.env.example`). La anon key
   necesita permiso de lectura; si la tabla tiene RLS:
   ```sql
   create policy "lectura publica de productos" on public.productos
     for select to anon using (true);
   ```
   Si las fotos están en Storage, el bucket debe ser público para que las
   miniaturas lleguen a la cotización.

Para cambiar el correo con acceso, hay que editarlo en `firestore.rules`,
`storage.rules` y `VITE_ALLOWED_EMAIL`.

## Desarrollo y despliegue

```bash
npm install
npm run dev                                  # http://localhost:5174
npm run build && npx firebase-tools deploy --only hosting
```

## Datos (Firestore)

| Colección | Contenido |
| --- | --- |
| `contacts/{id}` | `name`, `phone` (solo dígitos, con código de país), `stage`, `tags[]`, `notes`, `lastSentAt` |
| `contacts/{id}/sends/{id}` | historial: `channel` (`link`/`share`), `message`, `imageUrl`, `templateName`, `sentAt` |
| `images/{id}` | `name`, `url`, `path` en Storage, `contactId` (`null` = biblioteca) |
| `templates/{id}` | `name`, `body` |
| `quotes/{id}` | `number`, `contactId`, `clientName`, `issueDate`, `validUntil`, `items[]`, `conditions`, `total`, `imageUrl`, `pdfUrl` |
| `counters/quote-AAAA-DDMM` | `last`: último correlativo del día |
| `private/ai` | `apiKey` de OpenRouter, `quoteModel`, `chatModel` |
| `links/{código}` | `url`: destino del enlace corto. Única colección de lectura pública (solo `get`) |
| `settings/company` | datos de empresa, pagos, QR Yape (data URL), condiciones por defecto |

Las imágenes se envían como URL de descarga con token de Storage. Quien
recibe el enlace puede verla sin iniciar sesión. Si se borra la imagen, los
enlaces ya enviados dejan de funcionar.
