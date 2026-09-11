/**
 * El operador escribe la etiqueta que ve su cliente ("CUP por Zelle"); el
 * identificador técnico lo genera la app. Nadie que lleve un negocio debería
 * tener que inventar un `key` sin espacios ni acentos.
 */
export function slugify(label: string) {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** Igual, garantizando que no choque con los que ya existen. */
export function slugifyUnico(label: string, existentes: string[]) {
  const base = slugify(label);
  if (!base) return "";
  if (!existentes.includes(base)) return base;
  let n = 2;
  while (existentes.includes(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}
