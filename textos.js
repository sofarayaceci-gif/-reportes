/* ══════════════════════════════════════════════════════════════════════════
   textos.js — Las fórmulas del Excel, traducidas.

   Fórmula original de la etapa eléctrica (hoja Novarum, columna AB):
     =SI(AB=0;"Aun no inicia...";SI(AB=1;...)) hasta 9, si no " "

   Fórmula original del medidor (hoja Novarum, columna AC):
     =SI(AD=0;" ";SI(AC=1;",adicionalmente...";SI(AC=2;...;SI(AC=4;...;" "))))

   El texto final es la suma de los dos, en ese orden.
   Los textos están escritos igual que en el Excel, sin tildes, para que se
   peguen idénticos en el informe.
   ══════════════════════════════════════════════════════════════════════════ */

/* Etapa eléctrica: 0 a 9 */
const ETAPAS_ELECTRICAS = [
  { n: 0, corto: 'Aún no inicia',
    texto: 'Aun no inicia la obra civil' },
  { n: 1, corto: 'Inició obra civil',
    texto: 'Se inicio la obra civil' },
  { n: 2, corto: 'Tubería en losa',
    texto: 'Se trabaja en la colocacion de tuberia electrica en losa' },
  { n: 3, corto: 'Tubería en paredes y cajas',
    texto: 'Se trabaja en la colocacion de tuberia en las paredes y en la puestas de cajas' },
  { n: 4, corto: 'Tubería en techo',
    texto: 'Se trabaja en la puesta de tuberia en techo' },
  { n: 5, corto: 'Cableado de iluminación',
    texto: 'Se trabaja en el cableado de iluminacion, asi como en todas las conexiones en las cajas de registro, cabe resaltar que cada una de las cajas cuentan con su respectiva tapa' },
  { n: 6, corto: 'Tableros',
    texto: 'Se trabaja en la colocacion de tableros tanto la caja de breakers como el tablero de telecomunicaciones' },
  { n: 7, corto: 'Cableado de datos y tomas',
    texto: 'Se trabaja en la colocacion del cableado de datos, asi como en la colocacion del  cableado de tomas, con esto concluimos en su totalidad con la labor del cableado' },
  { n: 8, corto: 'Dispositivos y pruebas',
    texto: 'Se trabaja en la colocacion de los dispositivos (tomacorrientes, puertos RJ45, conectores tipo F, y salidas especiales), y puesta breakers, asi como pruebas finales para dar por finalizada la construccion electrica' },
  { n: 9, corto: 'Finalizado',
    texto: 'Se finalizo la construccion electrica y la declaracion de dicha obra' }
];

/* ── El medidor ────────────────────────────────────────────────────────────
   No se elige en ningún lado: lo pone el reporte. Cuando la columna «Obras
   Complementarias» llega a COMPLEMENTARIAS_CON_MEDIDOR, este texto se pega al
   final del texto eléctrico. Es la etapa 4 de la fórmula original.

   Con una excepción: las casas con el eléctrico en 100 % nunca lo llevan.
   Ver llevaLineaDeMedidor(), más abajo.

   Empieza con coma y espacio porque continúa la oración anterior.

   Las otras dos etapas del medidor de la fórmula quedaron fuera: no hay de
   dónde sacarlas en el reporte. Sus textos eran, por si algún día hacen falta:
     1  ", adicionalmente se trabaja en la colocacion de la base del medidor."
     2  ", adicionalmente se trabaja en la solicitud del medidor provisional."   */
const COMPLEMENTARIAS_CON_MEDIDOR = 100;

const TEXTO_MEDIDOR =
  ', adicionalmente se comenta que la construccion ya cuenta con medidor provisional';

/* Etapa en la que la obra eléctrica ya está terminada. */
const ETAPA_FINALIZADA = 9;

/* ── Textos cambiados desde la app ─────────────────────────────────────────
   Las dos listas de arriba son los textos de fábrica y no se tocan nunca: son
   la red debajo de todo. Lo que se escribe en la pantalla de Ajustes se guarda
   acá encima, y solo lo que se haya cambiado de verdad.

   Un texto vacío no se guarda: se borra la modificación y vuelve el de fábrica.
   Así no hay forma de quedarse sin texto por haber borrado un campo.

   Quien llena esto es app.js al arrancar, con lo que tenga guardado el aparato
   (y con lo que baje de la nube, si hay algo más nuevo). */
const TEXTOS_PROPIOS = { etapas: {}, medidor: '' };

function aplicarTextosPropios(guardado) {
  TEXTOS_PROPIOS.etapas = {};
  TEXTOS_PROPIOS.medidor = '';
  if (!guardado || typeof guardado !== 'object') return;

  const etapas = guardado.etapas || {};
  Object.keys(etapas).forEach(clave => {
    const texto = String(etapas[clave] === null || etapas[clave] === undefined ? '' : etapas[clave]).trim();
    if (texto) TEXTOS_PROPIOS.etapas[Number(clave)] = texto;
  });

  const medidor = String(guardado.medidor === null || guardado.medidor === undefined ? '' : guardado.medidor).trim();
  if (medidor) TEXTOS_PROPIOS.medidor = medidor;
}

/* El texto de fábrica de una etapa, el que devuelve el botón «Restaurar». */
function textoPorDefectoDeEtapa(etapa) {
  const e = ETAPAS_ELECTRICAS.find(x => x.n === Number(etapa));
  return e ? e.texto : '';
}

/* El texto del medidor que está en uso: el propio si lo hay, si no el de fábrica. */
function textoDelMedidor() {
  return TEXTOS_PROPIOS.medidor || TEXTO_MEDIDOR;
}

/* El tramo de porcentajes de una etapa, para rotular los campos de Ajustes.
   Sale de LIMITES_DE_ETAPAS, así que si algún día se mueve un tramo el rótulo
   se mueve solo y no puede quedar mintiendo. */
function tramoDeEtapa(etapa) {
  const n = Number(etapa);
  if (n === 0) return '0 %';
  if (n === ETAPA_FINALIZADA) return '100 %';
  return LIMITES_DE_ETAPAS[n - 1] + ' – ' + (LIMITES_DE_ETAPAS[n] - 1) + ' %';
}

/* ¿El reporte dice que esta casa ya tiene medidor provisional? */
function tieneMedidorProvisional(pctComplementarias) {
  const p = pctComplementarias;
  if (p === null || p === undefined || p === '' || isNaN(p)) return false;
  return Number(p) >= COMPLEMENTARIAS_CON_MEDIDOR;
}

/* ¿A esta casa le toca la línea del medidor al final del texto?

   Son dos condiciones: que el reporte diga que ya lo tiene, y que la obra
   eléctrica todavía no esté finalizada. Una casa en 100 % sale con su texto
   de cierre y nada más: a esas alturas el medidor ya no es provisional y no
   tiene sentido reportarlo. */
function llevaLineaDeMedidor(etapaElectrica, pctComplementarias) {
  if (Number(etapaElectrica) === ETAPA_FINALIZADA) return false;
  return tieneMedidorProvisional(pctComplementarias);
}

/* ── Relación porcentaje (0-100) → etapa (0-9) ────────────────────────────
   Estos nueve números son el límite inferior de las etapas 1 a 9. Todo lo que
   quede por debajo del primero es etapa 0.

   Así quedan los tramos:

       0 %        → etapa 0        51 a  62 %  → etapa 5
       1 a  12 %  → etapa 1        63 a  75 %  → etapa 6
      13 a  25 %  → etapa 2        76 a  87 %  → etapa 7
      26 a  37 %  → etapa 3        88 a  99 %  → etapa 8
      38 a  50 %  → etapa 4       100 %        → etapa 9

   Con estos valores los porcentajes de novenos (11, 22, 33, 44, 56, 67, 78,
   89), que son los que produce una escala de 10 etapas, caen cada uno en su
   etapa. La 0 y la 9 quedan reservadas al 0 y al 100 exactos, para que un 97 %
   nunca se reporte como obra terminada.

   Para mover un tramo, cambiá el número que le corresponde acá. Deben ir en
   aumento y entre 1 y 100. */
const LIMITES_DE_ETAPAS = [1, 13, 26, 38, 51, 63, 76, 88, 100];

/* Devuelve la etapa 0-9 para un porcentaje, o null si no hay porcentaje. */
function etapaDesdePorcentaje(pct) {
  if (pct === null || pct === undefined || pct === '' || isNaN(pct)) return null;
  const p = Math.max(0, Math.min(100, Number(pct)));
  let etapa = 0;
  for (let i = 0; i < 9; i++) {
    if (p >= LIMITES_DE_ETAPAS[i]) etapa = i + 1;
  }
  return etapa;
}

/* ── Generación del texto ────────────────────────────────────────────────── */

/* El texto que sale de verdad: el que se haya escrito en Ajustes, y si no hay,
   el de fábrica. Todo lo que muestra o copia la app pasa por acá. */
function textoDeEtapaElectrica(etapa) {
  return TEXTOS_PROPIOS.etapas[Number(etapa)] || textoPorDefectoDeEtapa(etapa);
}

/* El texto completo del reporte para una casa.
   Recibe el porcentaje de Obras Complementarias tal como viene del reporte:
   la regla del medidor se decide acá adentro y en un solo lugar. */
function generarTexto(etapaElectrica, pctComplementarias) {
  const base = textoDeEtapaElectrica(etapaElectrica);
  if (!base) return '';
  return llevaLineaDeMedidor(etapaElectrica, pctComplementarias)
    ? base + textoDelMedidor()
    : base;
}

/* ── Normalización del número de casa ─────────────────────────────────────
   Para que «102», «vb 1.02» y «VB-1.02» encuentren la misma casa. */
function normalizarCasa(valor) {
  return String(valor === null || valor === undefined ? '' : valor)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/* ── Grupos de casas ──────────────────────────────────────────────────────
   El grupo es lo que va antes del guion: «VB-1.02» → «VB». Con eso la app
   arma sola los botones de filtro que salen bajo el buscador.

   Las casas sin guion no quedan en ningún grupo: aparecen solo en «Todas». */
function grupoDeCasa(casa) {
  const texto = String(casa === null || casa === undefined ? '' : casa);
  const corte = texto.indexOf('-');
  if (corte === -1) return '';
  return texto.slice(0, corte).trim().toUpperCase();
}

/* En qué orden salen los botones de grupo. Los grupos que no estén en esta
   lista salen después, en orden alfabético, así que si algún día aparece
   uno nuevo no hay que tocar nada: se agrega solo al final. */
const ORDEN_DE_GRUPOS = ['VB', 'VN', 'VC'];

function ordenarGrupos(grupos) {
  return grupos.slice().sort((a, b) => {
    const ia = ORDEN_DE_GRUPOS.indexOf(a);
    const ib = ORDEN_DE_GRUPOS.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, 'es');
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

/* El bloque dentro de un grupo: lo que va después del guion y antes del
   punto. «VB-5.14» → «5». Si no hay punto, todo lo que sigue al guion.
   Sirve tanto para números como para letras. */
function subgrupoDeCasa(casa) {
  const texto = String(casa === null || casa === undefined ? '' : casa);
  const corte = texto.indexOf('-');
  if (corte === -1) return '';
  const resto = texto.slice(corte + 1).trim();
  const punto = resto.indexOf('.');
  return (punto === -1 ? resto : resto.slice(0, punto)).trim().toUpperCase();
}

/* Los bloques salen en orden: primero los números de menor a mayor (para que
   el 10 no quede entre el 1 y el 2) y después las letras. */
function ordenarSubgrupos(subgrupos) {
  return subgrupos.slice().sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    const aEsNumero = a !== '' && !isNaN(na);
    const bEsNumero = b !== '' && !isNaN(nb);
    if (aEsNumero && bEsNumero) return na - nb;
    if (aEsNumero) return -1;
    if (bEsNumero) return 1;
    return a.localeCompare(b, 'es');
  });
}
