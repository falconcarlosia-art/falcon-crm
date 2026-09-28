# Falcon CRM

Mini CRM de un solo usuario para Falcon Electronic: contactos (nombre y
WhatsApp), cotizaciones con el diseño de marca y envío por WhatsApp. Se publica
en https://crm-falcons.web.app.

- **Contactos**: nombre, número (+51 por defecto), etapa, etiquetas y notas.
  Tienen búsqueda, filtro por etapa e historial de envíos.
- **Cotizaciones**: desde la ficha, en *Nueva cotización*, eliges productos del
  catálogo de Supabase o agregas ítems libres, ajustas precio, cantidad,
  fechas y condiciones, y la app genera la cotización.
  - **No se guarda ningún archivo.** De cada cotización solo quedan sus datos
    (unos pocos KB). La **imagen (JPG) y el PDF se generan en la app** cada vez
    que se envían o descargan, con las fotos de producto que salen de Supabase.
  - Numeración `AAAA-DDMM-n`, correlativo por día (`2026-2509-1`). Se reserva
    con una transacción en `counters/quote-AAAA-DDMM`, así que requiere
    conexión.
  - Precios con IGV. El valor de venta y el IGV (18 %) se desglosan del total.
  - Los datos de la empresa, las cuentas, el QR de Yape y las condiciones por
    defecto se editan en **Ajustes**. Como los archivos se regeneran, una
    cotización antigua se dibuja con los ajustes actuales.
  - Cada cotización tiene estado (*Pendiente*, *Aceptada* o *Rechazada*); al
    aceptarla, el contacto pasa a *Ganado*. **Duplicar** la reabre con los
    mismos ítems para otro cliente.
- **Enviar por WhatsApp**: eliges si adjuntar una cotización del contacto, una
  plantilla, y editas el mensaje.
  - *En el celular*: **Compartir PDF e imagen** adjunta los dos archivos con el
    menú Compartir del sistema; eliges el chat en WhatsApp y el texto va como
    mensaje (también queda copiado por si WhatsApp lo descarta).
  - *En la PC*: **Descargar y abrir WhatsApp** baja el PDF y la imagen y abre
    `wa.me/<número>` con el texto listo; se adjuntan con el clip 📎. wa.me solo
    acepta texto, por eso no se pueden adjuntar solos.
  - *Solo texto*: abre el chat sin adjuntos (seguimientos, respuestas).
- **Plantillas**: mensajes con `{nombre}`, `{nombre_completo}`, `{numero}` y
  `{total}` de la cotización. Si se envía sin cotización, las líneas con
  `{numero}` o `{total}` se quitan.
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

Stack: React, Vite y Firebase (Auth con Google y Firestore con caché offline).
Funciona en el **plan gratuito Spark**: no usa Firebase Storage ni guarda
archivos. Todo en Firestore es privado del dueño; no hay nada público.
Las fuentes de marca (Poppins y Orbitron) van incluidas en la app para que la
cotización siempre se dibuje igual, sin depender de Google Fonts.

## Puesta en marcha (una sola vez)

1. En la consola de Firebase del proyecto **crm-falcons**:
   - *Authentication* → Sign-in method → habilitar **Google**.
     En *Settings → Authorized domains* deben figurar `crm-falcons.web.app` (ya
     viene por defecto) y `localhost`.
   - *Firestore Database* → crear la base de datos (modo producción).
   - No hace falta Storage ni el plan Blaze.
2. La config de Firebase ya está en `.env.production` (es pública). Para
   desarrollo, copiarla a `.env.local`.
3. Desplegar las reglas de seguridad, que solo permiten el correo del dueño:
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules
   ```
4. Catálogo de productos (Supabase). En `.env.production` van
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (nunca la `service_role`) y el
   mapeo de tabla y columnas `VITE_PRODUCTS_*` (ver `.env.example`). La anon key
   necesita permiso de lectura; si la tabla tiene RLS:
   ```sql
   create policy "lectura publica de productos" on public.productos
     for select to anon using (true);
   ```
   Si las fotos de productos están en Supabase Storage, el bucket debe ser
   público para que las miniaturas lleguen a la cotización.

Para cambiar el correo con acceso, hay que editarlo en `firestore.rules` y
`VITE_ALLOWED_EMAIL`.

## Desarrollo y despliegue

```bash
npm install
npm run dev                                  # http://localhost:5174
npm run build && npx firebase-tools deploy --only hosting
```

## Datos (Firestore)

| Colección | Contenido |
| --- | --- |
| `contacts/{id}` | `name`, `phone` (solo dígitos, con código de país), `stage`, `tags[]`, `notes`, `lastSentAt`, `followUpAt` |
| `contacts/{id}/sends/{id}` | historial: `channel` (`share`/`chat`), `message`, `quoteId`, `quoteNumber`, `templateName`, `sentAt` |
| `quotes/{id}` | `number`, `contactId`, `clientName`, `issueDate`, `validUntil`, `items[]` (con miniatura del producto), `conditions`, `total`, `status` |
| `templates/{id}` | `name`, `body` |
| `counters/quote-AAAA-DDMM` | `last`: último correlativo del día |
| `settings/company` | datos de empresa, pagos, QR Yape (data URL), condiciones por defecto |
| `private/ai` | `apiKey` de OpenRouter, `quoteModel`, `chatModel` |

Cuota gratuita de Firestore (Spark): 1 GiB guardado, 50.000 lecturas y 20.000
escrituras por día. Como solo se guardan datos, alcanza de sobra.
