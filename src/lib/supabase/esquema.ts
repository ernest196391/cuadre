/**
 * El esquema de Postgres donde viven las tablas de Cuadre.
 *
 * Vive aquí, solo, y no dentro de ninguno de los tres clientes, porque los tres
 * TIENEN que decir lo mismo: el del navegador, el del servidor con sesión y el
 * de servicio. Tenerlo escrito tres veces ya salió caro una vez —`server.ts` se
 * quedó apuntando a `public` después de la mudanza, y las rutas de tarjetas y
 * de claves respondían «no eres el dueño» a quien sí lo era.
 *
 * Este módulo no lleva "use client" ni toca `cookies()`: se puede importar
 * desde cualquiera de los dos lados.
 */
export const ESQUEMA = "cuadre";
