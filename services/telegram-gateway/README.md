# Capiversa Telegram MTProto Gateway Sidecar (v1.3.07)

Microservicio desacoplado para la conexión de cuentas personales y corporativas de Telegram vía código QR (MTProto 2.0), administración de canales, publicación multicanal y moderación de comentarios.

---

## 1. Arquitectura y Seguridad

* **Desacople de Edge / Nitro SSR:** Cloudflare Workers y los runtimes Serverless no admiten sockets TCP persistentes ni almacenamiento local de sesiones. Este gateway ejecuta un proceso Node.js persistente que mantiene vivas las conexiones MTProto con Telegram de manera aislada.
* **Seguridad Multi-Tenant:** Cada empresa y cuenta conectada (`company_id`, `connection_id`) almacena su sesión cifrada en volúmenes persistentes independientes.
* **Autenticación Interna:** Toda llamada entre el CRM principal de Capiversa y este microservicio requiere la cabecera `Authorization: Bearer <GATEWAY_SECRET>` o `x-gateway-secret: <GATEWAY_SECRET>`.
* **Zero Contraseñas Guardadas:** Las contraseñas de Verificación en Dos Pasos (2FA) se transmiten en un handshake único en memoria para desbloquear la sesión de Telegram y jamás se persisten en base de datos ni en logs.

---

## 2. Variables de Entorno

| Variable | Descripción | Requerido |
|---|---|---|
| `PORT` | Puerto HTTP donde corre el servicio (defecto: `3005`) | No |
| `GATEWAY_SECRET` | Clave secreta compartida entre Capiversa CRM y el Gateway | Sí |
| `TELEGRAM_API_ID` | Obtenido en https://my.telegram.org (App api_id) | Sí (para producción) |
| `TELEGRAM_API_HASH` | Obtenido en https://my.telegram.org (App api_hash) | Sí (para producción) |
| `SESSIONS_DATA_DIR` | Directorio local persistente para guardar archivos `.session` | No |

---

## 3. Despliegue con Docker

```bash
# Construir imagen
docker build -t capiversa-telegram-gateway .

# Ejecutar con volumen persistente
docker run -d \
  --name capiversa-telegram-gateway \
  -p 3005:3005 \
  -e GATEWAY_SECRET="secreto_seguro_produccion" \
  -e TELEGRAM_API_ID="12345678" \
  -e TELEGRAM_API_HASH="0123456789abcdef" \
  -v /var/data/telegram-sessions:/app/.sessions \
  --restart unless-stopped \
  capiversa-telegram-gateway
```

O utilizando `docker compose`:

```bash
docker compose up -d
```

---

## 4. Endpoints Expuestos

* `GET /health` — Monitoreo de salud y cantidad de clientes conectados.
* `POST /api/gateway/start-qr` — Inicia el apretón de manos QR con Telegram.
* `GET /api/gateway/qr-status/:sessionId` — Consulta el estado en tiempo real (`waiting_qr`, `waiting_password`, `authorized`, `expired`, `failed`).
* `POST /api/gateway/complete-password` — Entrega de contraseña 2FA si la cuenta la tiene activa.
* `GET /api/gateway/channels/:connectionId` — Lista únicamente los canales de difusión donde la cuenta es administradora y puede publicar.
* `POST /api/gateway/logout/:connectionId` — Desconecta la cuenta y destruye el archivo de sesión.
