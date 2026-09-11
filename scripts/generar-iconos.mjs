/**
 * Genera los íconos de la app desde el símbolo de la marca.
 *
 * POR QUÉ ESTE SCRIPT Y NO LOS PNG DEL KIT: los de `02_App_Icons/` están mal.
 * El símbolo son dos corchetes, uno azul y otro grafito, y los pusieron sobre
 * fondo grafito: el corchete derecho desaparece y queda media marca descentrada
 * (margen izquierdo 122 px, derecho 281 px sobre 512). Aquí se rehacen desde
 * `brand/cuadre-symbol.svg`, aplicando para fondo oscuro la misma fórmula que
 * el propio kit usa en `cuadre-logo-horizontal-reversed.svg`: corchete azul,
 * corchete BLANCO y hueco central del color del fondo.
 *
 *   node scripts/generar-iconos.mjs
 */
import pw from "/home/claude/cuyana-app/node_modules/playwright/index.js";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { chromium } = pw;
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const destino = join(raiz, "public", "icons");

// Del kit: design-tokens.json y la guía de marca.
const AZUL = "#2457D6";
const GRAFITO = "#17202A";
const BLANCO = "#FFFFFF";

/**
 * El símbolo en su caja de 128, listo para fondo oscuro. El hueco central se
 * pinta del color del fondo en vez de dejarse transparente: iOS rellena de
 * negro cualquier transparencia y partiría la marca por la mitad.
 */
function simbolo(fondo) {
  return `
    <path d="M54 12H12v104h42V92H36V36h18z" fill="${AZUL}"/>
    <path d="M68 12h48v104H68V92h24V36H68z" fill="${BLANCO}"/>
    <rect x="50" y="50" width="30" height="30" rx="2" fill="${fondo}"/>`;
}

/**
 * @param ocupacion  Qué fracción del lado ocupa el símbolo.
 *   0.68 para los íconos normales: deja el aire que pide la guía (1x el ancho
 *        del vacío central) sin que la marca quede perdida.
 *   0.56 para el maskable: Android recorta a un círculo de diámetro 80% del
 *        lado, así que lo que deba sobrevivir tiene que caber en ese círculo.
 *        Un cuadrado inscrito en él mide 80/√2 ≈ 56,5% del lado. Al 56% el
 *        símbolo entero cae dentro con holgura, se recorte por donde se recorte.
 */
function lienzo(lado, ocupacion, fondo = GRAFITO) {
  const tam = lado * ocupacion;
  const margen = (lado - tam) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}">
  <rect width="${lado}" height="${lado}" fill="${fondo}"/>
  <g transform="translate(${margen} ${margen}) scale(${tam / 128})">${simbolo(fondo)}</g>
</svg>`;
}

const PIEZAS = [
  { archivo: "icon-192.png", lado: 192, ocupacion: 0.68 },
  { archivo: "icon-512.png", lado: 512, ocupacion: 0.68 },
  { archivo: "icon-maskable-512.png", lado: 512, ocupacion: 0.56 },
  // iOS pone su propia esquina redondeada y no entiende `maskable`; se le da
  // algo de aire para que el redondeo no muerda el símbolo.
  { archivo: "apple-touch-icon-180.png", lado: 180, ocupacion: 0.62 },
  { archivo: "favicon-32.png", lado: 32, ocupacion: 0.78 },
  { archivo: "favicon-16.png", lado: 16, ocupacion: 0.82 },
];

await mkdir(destino, { recursive: true });
const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

for (const p of PIEZAS) {
  const svg = lienzo(p.lado, p.ocupacion);
  const pagina = await navegador.newPage({ viewport: { width: p.lado, height: p.lado } });
  await pagina.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>${svg}`
  );
  await pagina.screenshot({ path: join(destino, p.archivo), omitBackground: false });
  await pagina.close();
  console.log(`  ${p.archivo.padEnd(28)} ${p.lado}px · símbolo al ${Math.round(p.ocupacion * 100)}%`);
}

// El SVG suelto, para el favicon vectorial de los navegadores que lo prefieren.
await writeFile(join(destino, "icon.svg"), lienzo(128, 0.72), "utf8");
console.log("  icon.svg                     vectorial");

await navegador.close();
console.log("\nÍconos en public/icons/");
