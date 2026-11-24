# Web de la boda: proyecto completo

## Estructura
- `public/` páginas y estilos (login, invitación, actividades, información, panel de administración, primera configuración)
- `src/index.js` servidor: inicio de sesión, usuarios y protección de todas las páginas
- `schema.sql` tablas de la base de datos
- `wrangler.jsonc` configuración (hay que editar 2 valores)

## Montarlo desde cero
1. **GitHub:** crea un repositorio y sube TODO el contenido de esta carpeta (Add file > Upload files).
2. **Base de datos:** en Cloudflare, sección D1, crea una base llamada `mi-web-db`. En su pestaña Console pega y ejecuta `schema.sql` (si solo admite una instrucción cada vez, ejecuta las dos tablas por separado). Copia su Database ID.
3. **Proyecto:** en Workers & Pages, Create application, importa tu repositorio de GitHub. Deja el comando de despliegue `npx wrangler deploy`.
4. **Configuración:** en GitHub edita `wrangler.jsonc`: pon en `name` el nombre exacto del proyecto y en `database_id` el ID del paso 2. Confirma el cambio.
5. **Clave:** en el proyecto, Settings > Variables and Secrets > Add, tipo Secret, nombre `SETUP_KEY` y una clave que solo conozcas. Guarda y despliega.
6. **Administrador:** abre `tuweb/setup`, introduce la clave, tu correo y tu contraseña. Después entra por la página de acceso. Desde Administración puedes crear usuarios.
7. **Limpieza:** borra `SETUP_KEY` cuando ya exista el administrador.

## Personalizar
- Nombres, fecha y textos: `public/index.html` (la fecha de la cuenta atrás está en la línea `FECHA`), y el nombre del menú en cada página.
- Horarios: `public/actividades.html`. Lugares y mapas: `public/informacion.html`.
- Fotos propias: ponlas en `public/img/` (solo las verán quienes hayan iniciado sesión).
- Pendiente de confirmar: dirección exacta de la Junta Municipal de Moncloa-Aravaca y del Four Seasons Hotel Madrid.
