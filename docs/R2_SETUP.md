# Cloudflare R2 para multimedia de Capiversa

## Bucket recomendado

- Nombre: `capiversa-media`.
- Acceso público: desactivado.
- Credenciales: token S3 limitado a lectura y escritura de este bucket.
- Retención: definirla según la política comercial y de privacidad de
  CuentasTuPana.

## Variables del servidor

Copiar los valores de `.env.example` al entorno publicado. Las claves
`R2_SECRET_ACCESS_KEY` y `R2_ACCESS_KEY_ID` pertenecen solo al servidor.

## CORS del bucket

La bandeja sube el archivo directamente a una URL PUT firmada. Sustituir los
orígenes de ejemplo por el dominio publicado y el origen local que se use:

```json
[
  {
    "AllowedOrigins": [
      "https://crm.ejemplo.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## Comportamiento

- Entrante: Lovable descarga con su autorización, Capiversa guarda en R2.
- Saliente: el navegador solicita una URL PUT corta y sube directo a R2.
- Lectura: Capiversa entrega una URL GET temporal al usuario o al proveedor.
- Reintento: se firma una URL nueva; una URL caducada no rompe la cola.
- Base de datos: guarda `storage_key`, tipo, nombre, tamaño y hash cuando está
  disponible. Las credenciales y URLs temporales no se guardan.

