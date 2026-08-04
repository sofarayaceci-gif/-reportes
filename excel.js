/* ══════════════════════════════════════════════════════════════════════════
   excel.js — Lectura del .xlsx con SheetJS y armado de las filas.
   ══════════════════════════════════════════════════════════════════════════ */

const Excel = (() => {

  /* Cómo se reconocen las columnas solas, sin que haya que elegirlas. */
  const PATRON_CASA = /^\s*(obra|casa|lote|unidad|vivienda|n[uú]mero)/i;
  const PATRON_ELECTRICO = /el[eé]ctric/i;
  const PATRON_COMPLEMENTARIAS = /complementari/i;

  function leerArchivo(archivo) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => {
        try {
          resolve(XLSX.read(new Uint8Array(lector.result), { type: 'array' }));
        } catch (error) {
          reject(new Error('No se pudo leer el archivo. ¿Es un Excel válido?'));
        }
      };
      lector.onerror = () => reject(new Error('No se pudo abrir el archivo.'));
      lector.readAsArrayBuffer(archivo);
    });
  }

  /* La hoja como matriz de filas, con las celdas ya en texto o número. */
  function matrizDeHoja(libro, nombreHoja) {
    const hoja = libro.Sheets[nombreHoja];
    if (!hoja) return [];
    return XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false, defval: null });
  }

  /* La fila de encabezados es la primera con al menos dos celdas con texto. */
  function filaDeEncabezado(matriz) {
    const tope = Math.min(matriz.length, 20);
    for (let i = 0; i < tope; i++) {
      const conTexto = (matriz[i] || []).filter(
        celda => typeof celda === 'string' && celda.trim() !== ''
      ).length;
      if (conTexto >= 2) return i;
    }
    return 0;
  }

  function letraDeColumna(indice) {
    let letra = '';
    let n = indice;
    do {
      letra = String.fromCharCode(65 + (n % 26)) + letra;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return letra;
  }

  /* Las columnas disponibles de una hoja, ya con nombre limpio. */
  function columnasDeHoja(matriz, indiceEncabezado) {
    const encabezado = matriz[indiceEncabezado] || [];
    let ancho = encabezado.length;
    matriz.forEach(fila => { if (fila && fila.length > ancho) ancho = fila.length; });

    const columnas = [];
    for (let i = 0; i < ancho; i++) {
      const bruto = encabezado[i];
      const nombre = bruto === null || bruto === undefined ? '' : String(bruto).trim();
      columnas.push({
        indice: i,
        letra: letraDeColumna(i),
        nombre: nombre,
        etiqueta: nombre ? letraDeColumna(i) + ' · ' + nombre : letraDeColumna(i) + ' · (sin nombre)'
      });
    }
    return columnas;
  }

  function buscarColumna(columnas, patron) {
    const encontrada = columnas.find(c => c.nombre && patron.test(c.nombre));
    return encontrada ? encontrada.indice : null;
  }

  /* Qué hoja conviene abrir: la que tenga casa y porcentaje eléctrico. */
  function sugerirHoja(libro) {
    let mejor = null;
    let mejorPuntaje = -1;
    libro.SheetNames.forEach(nombre => {
      const matriz = matrizDeHoja(libro, nombre);
      if (!matriz.length) return;
      const columnas = columnasDeHoja(matriz, filaDeEncabezado(matriz));
      let puntaje = 0;
      if (buscarColumna(columnas, PATRON_CASA) !== null) puntaje += 2;
      if (buscarColumna(columnas, PATRON_ELECTRICO) !== null) puntaje += 2;
      puntaje += Math.min(matriz.length / 100, 1);
      if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = nombre; }
    });
    return mejor || libro.SheetNames[0];
  }

  /* Mapeo sugerido de columnas para una hoja. La de obras complementarias no se
     elige a mano: se reconoce sola por el nombre y de ahí sale el medidor. */
  function sugerirMapeo(columnas) {
    return {
      casa: buscarColumna(columnas, PATRON_CASA),
      porcentaje: buscarColumna(columnas, PATRON_ELECTRICO),
      complementarias: buscarColumna(columnas, PATRON_COMPLEMENTARIAS)
    };
  }

  /* Convierte una celda a número, aceptando «67», «67%», «67,5». */
  function aNumero(celda) {
    if (celda === null || celda === undefined || celda === '') return null;
    if (typeof celda === 'number') return isFinite(celda) ? celda : null;
    const limpio = String(celda).replace('%', '').replace(',', '.').trim();
    if (limpio === '' || limpio === '—' || limpio === '-') return null;
    const n = Number(limpio);
    return isNaN(n) ? null : n;
  }

  /* Algunos Excel guardan los porcentajes como fracción (0.67 en vez de 67).
     Si ninguno pasa de 1 y hay decimales, se multiplican por 100. */
  function escalaDePorcentajes(valores) {
    const numeros = valores.filter(v => v !== null);
    if (!numeros.length) return 1;
    const maximo = Math.max.apply(null, numeros);
    const hayDecimales = numeros.some(v => !Number.isInteger(v));
    return maximo <= 1 && hayDecimales ? 100 : 1;
  }

  /* Una columna de porcentajes, ya normalizada a enteros de 0 a 100. */
  function columnaDePorcentajes(cuerpo, indice) {
    if (indice === null || indice === undefined) return cuerpo.map(() => null);
    const brutos = cuerpo.map(fila => aNumero((fila || [])[indice]));
    const escala = escalaDePorcentajes(brutos);
    return brutos.map(valor => valor === null
      ? null
      : Math.round(Math.max(0, Math.min(100, valor * escala))));
  }

  /* Arma las filas finales listas para guardar. */
  function construirFilas(matriz, indiceEncabezado, columnas, mapeo) {
    const cuerpo = matriz.slice(indiceEncabezado + 1);
    const electricos = columnaDePorcentajes(cuerpo, mapeo.porcentaje);
    const complementarios = columnaDePorcentajes(cuerpo, mapeo.complementarias);

    const filas = [];
    cuerpo.forEach((fila, i) => {
      fila = fila || [];
      const casaBruta = fila[mapeo.casa];
      const casa = casaBruta === null || casaBruta === undefined ? '' : String(casaBruta).trim();
      if (!casa) return;

      const porcentaje = electricos[i];
      const complementarias = complementarios[i];

      /* El resto de columnas se guarda como contexto para mostrarlo en pantalla. */
      const datos = {};
      columnas.forEach(columna => {
        if (columna.indice === mapeo.casa) return;
        if (!columna.nombre) return;
        const valor = fila[columna.indice];
        if (valor === null || valor === undefined || String(valor).trim() === '') return;
        datos[columna.nombre] = valor;
      });

      filas.push({
        casa: casa,
        casaNorm: normalizarCasa(casa),
        porcentaje: porcentaje,
        etapa: etapaDesdePorcentaje(porcentaje),
        complementarias: complementarias,
        datos: datos
      });
    });
    return filas;
  }

  return {
    leerArchivo, matrizDeHoja, filaDeEncabezado, columnasDeHoja,
    letraDeColumna, sugerirHoja, sugerirMapeo, construirFilas
  };
})();
