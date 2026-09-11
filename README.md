# Cuadre

Herramienta de gestión para operadores de remesas. Registra compras de USDT,
entregas a clientes, contactos y cuentas de destino, y calcula el costo y la
ganancia reales sin que nadie tenga que hacer cuentas a mano.

El producto es **white-label**: no lleva marca propia. Cada operador configura la
suya (nombre, logo, colores) en su fila de `tenants`. Las monedas y los países
del corredor también son datos, no código.

## Estado

- **Etapa 1 — modelo de datos y seguridad.** Completa.
- Etapa 2 — pantallas de captura diaria en móvil.
- Etapa 3 — reportes y entrada de pedidos desde la web del operador.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y rellena los valores
npm run dev
```

### Variables de entorno

| Variable | Dónde vive | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente y servidor | Proyecto de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente y servidor | Clave pública; sin sesión no abre nada |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo servidor** | Única llave que abre las funciones de tarjeta |
| `PAN_ENCRYPTION_KEY` | **Solo servidor** | 32 bytes en base64. Cifra los números de tarjeta |

Las dos últimas **no llevan prefijo `NEXT_PUBLIC_`** a propósito: Next solo
envía al navegador las variables con ese prefijo. Nunca se las pongas.

Para generar la clave de cifrado:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> **Si pierdes `PAN_ENCRYPTION_KEY`, los números de tarjeta guardados no se
> pueden recuperar.** No hay copia en la base de datos ni puerta trasera: ese es
> justamente el punto. Guárdala donde guardas las cosas que no se pueden perder.

## Base de datos

Las migraciones están en `supabase/migrations/`, numeradas y en orden.

### Cómo se protege

- **RLS activa en las 12 tablas.** `anon` no aparece en ninguna política y se le
  revocan los permisos que Supabase concede por defecto: sin sesión no se
  obtiene "cero filas", se obtiene permiso denegado.
- **Aislamiento por operador.** Cada tabla lleva `tenant_id` y cada política lo
  compara contra el del usuario que consulta.
- **Los números de tarjeta no son legibles ni con sesión.** El navegador solo
  tiene permiso sobre las columnas seguras (`pan_last4` entre ellas); las
  columnas cifradas quedan fuera de su alcance por privilegios de columna, no
  solo por RLS.
- **Sin `DELETE` en las tablas de dinero.** Corregir es anular con motivo.

### Cifrado de tarjetas

AES-256-GCM en Node, del lado del servidor (`src/lib/pan.ts`). Formato guardado:
`iv(12) || tag(16) || ciphertext`, en una columna `bytea`, con `key_version`
para poder rotar la clave sin migrar el esquema.

Se hace en la aplicación y no en Postgres porque `pgcrypto` obliga a pasar la
clave dentro de la sentencia SQL —donde termina en los logs y en
`pg_stat_statements`— y Vault la guarda en la propia base de datos. Así, la base
nunca ve la clave ni el número en claro.

El `tenant_id` y el `contact_id` van como datos asociados (AAD) de GCM: copiar
un texto cifrado a otro contacto o a otro operador lo vuelve indescifrable en
vez de dejarlo funcionando en el lugar equivocado.

**Caminos de entrada y salida del número completo**, los únicos que hay:

| Ruta | Qué hace |
|---|---|
| `POST /api/cuentas` | Cifra en el servidor y guarda vía `create_destination_account` |
| `POST /api/cuentas/[id]/revelar` | Revela vía `reveal_destination_account_pan`, que registra quién y cuándo **antes** de entregar el dato |

Ambas funciones de base de datos son `security definer` y solo el `service_role`
puede ejecutarlas: el navegador no las alcanza ni con sesión válida.

## Números que no se teclean

- `purchases.cost_per_usdt` es una **columna generada**. Postgres la calcula; no
  existe formulario capaz de escribirla.
  `(gastado + fee) / usdt_que_quedaron`, donde `usdt_received` es siempre lo que
  quedó en la wallet, neto de comisiones.
- `deliveries.rate_applied` y `deliveries.commission_applied` son **fotos del
  momento**. Cambiar una tasa o una comisión hoy no reescribe la ganancia de
  ayer.

## Tasas

Una sola convención en todo el producto: **unidades de la moneda destino por 1
unidad de la moneda origen.**

| Se lee | Se guarda |
|---|---|
| 3,20 CUP por GYD | `3.20000000` |
| 275 GYD por 1 USD | `0.00363636` |

Una convención, una fórmula. Las pantallas la muestran en la dirección en la que
la gente la lee.

## Cuentas del negocio

Solo se registra y se suma: no hay proyecciones, predicciones ni gráficas.

El USDT se compra en bloque, así que ninguna entrega tiene "su" compra. El
costeo es por **promedio ponderado**: lo que cuesta un USDT es lo que costó en
promedio todo el comprado hasta la fecha de corte del período.

```
costo del USDT   = (usdt_spent + network_fee_usdt) × promedio_ponderado
comisión en GYD  = comisión en USDT × promedio_ponderado
ganancia         = recibido − costo del USDT − comisiones − mensajería
```

`usdt_spent` son los USDT **que llegaron a destino**; el fee de la wallet va
aparte en `network_fee_usdt` y cuenta como costo, porque son USDT que salieron
y no llegaron a manos de nadie. Esa separación es también la que hace correcta
la comisión: un 3% "por cada 100 puestos en Cuba" se aplica a lo que llegó, no
a lo que salió.

El desglose por método muestra **la ganancia por envío y la acumulada por
separado**, porque no responden a la misma pregunta: un método puede dejar más
en cada operación y aun así rendir menos al final del mes.

## Recibir pedidos desde una web

Cualquier sitio puede mandar pedidos. No hace falta que sea el nuestro.

**Endpoint:** `POST https://<tu-dominio>/api/pedidos`

**Cabeceras:**

```
Content-Type: application/json
Authorization: Bearer <clave>      # o bien:  X-Api-Key: <clave>
```

La clave se genera en **Ajustes → Generar clave**, dentro de la app, y se
muestra una sola vez. De ella solo se guarda un hash SHA-256: no se puede
recuperar, solo revocar y hacer otra.

**Cuerpo:** cualquier objeto JSON. Se guarda entero, tal cual llega. El único
campo que la app interpreta es `external_ref`; todo lo demás queda disponible
para consultarlo después.

```json
{
  "external_ref": "CUY-2026-001234",
  "customer_name": "Yanet Pérez",
  "customer_phone": "+53 5 234 5678",
  "amount_source": 10000,
  "currency_source": "GYD",
  "method_key": "cup_transferencia",
  "amount_destination": 32000,
  "currency_destination": "CUP",
  "notes": "Entregar por la tarde"
}
```

**Respuestas:**

| Código | Cuerpo | Cuándo |
|---|---|---|
| `201` | `{"id": "...", "duplicated": false}` | Pedido guardado |
| `200` | `{"id": "...", "duplicated": true}` | Ya habías mandado ese `external_ref` |
| `400` | `{"error": "..."}` | El cuerpo no es un objeto JSON |
| `401` | `{"error": "..."}` | Falta la clave o no es válida |
| `503` | `{"error": "..."}` | El servidor no tiene configurada su llave de servicio |

Mandar dos veces el mismo `external_ref` **no duplica el pedido**: devuelve el
que ya existía. Tu web puede reintentar sin miedo tras un fallo de red.

Ejemplo completo:

```bash
curl -X POST https://<tu-dominio>/api/pedidos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cuadre_XXXXXXXX..." \
  -d '{"external_ref":"CUY-2026-001234","customer_name":"Yanet Pérez","amount_source":10000}'
```

El endpoint responde a `OPTIONS` con CORS abierto, así que también puede
llamarse desde el navegador. La clave **no debe ir en código de navegador**:
mándala desde el servidor de tu web.

## Alta de un operador nuevo

1. Proyecto de Supabase nuevo y despliegue propio (el aislamiento entre clientes
   es físico; ver `supabase/migrations/0001_base.sql`).
2. Aplicar las migraciones en orden.
3. Insertar su fila en `tenants` con su marca y su corredor.
4. Crear sus usuarios en Supabase Auth y su fila en `profiles`.

Sin fila en `profiles`, un usuario autenticado no pertenece a ningún operador y
no ve absolutamente nada — así, que el registro público quede abierto por
descuido no abre ninguna puerta.
