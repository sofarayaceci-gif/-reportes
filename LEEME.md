# Reportes — Adelante Desarrollos

App para consultar el avance eléctrico por casa y copiar el texto del reporte.

## Instalarla (se hace una sola vez)

1. Doble clic en **`Abrir Reportes.bat`**. Se abre Chrome en `http://localhost:8123`
   y queda una ventana minimizada haciendo de servidor.
2. En Chrome: el **ícono de instalar** de la barra de direcciones, o menú de tres
   puntos → **Instalar Reportes**.
3. Cerrá la ventana del servidor. Ya no hace falta.

Queda con el ícono verde de Adelante en el menú Inicio y en el escritorio, se abre
en su propia ventana sin barra de navegador, y **funciona con el servidor apagado
y sin internet**: al instalarse guarda una copia de la app en el equipo.

De ahí en adelante abrís Reportes como cualquier programa. No hay que volver a
tocar el `.bat`.

> **Cuándo sí hay que volver a usar el `.bat`:** solo en dos casos. Si limpiás los
> datos de navegación de Chrome (eso borra la copia guardada), o si cambia algún
> archivo de la app y querés que la tome. En ese segundo caso abrila con el `.bat`,
> cerrala y volvé a abrirla: la primera vez renueva la copia por detrás y la segunda
> ya muestra el cambio.

> La instalación necesita `localhost` o `https`. Si abrís `index.html` con doble
> clic directo, la app funciona pero Chrome no ofrece instalarla.

## Cómo se usa

1. **Importar** el Excel, de cualquiera de estas tres formas:
   - tocar el **clip 📎** de la barra de arriba;
   - **copiar** el archivo en el explorador de Windows y **pegarlo con Ctrl+V**;
   - **arrastrarlo** a la ventana (el clip se marca mientras viene en camino).

   No hay pantalla de bienvenida ni cortina de «soltá el archivo aquí»: la app
   abre directo en el buscador y las tres formas llevan a la misma pantalla de
   importación.

   No hay pantalla de por medio ni nada que elegir ni que confirmar. La app
   reconoce sola la hoja *Matriz de Avance* y las columnas *Obra*, *Electrico* y
   *Obras Complementarias*, guarda el reporte y queda lista para buscar. El aviso
   verde de abajo dice cuántas casas entraron y cuántas llevan medidor.

   Si el archivo no es el de siempre y no se reconoce ninguna casa, avisa en rojo
   y no guarda nada: el reporte que tenías sigue intacto.
2. **Buscar**: escribí el número de casa. Funciona parcial y sin formato:
   `102`, `1.02` y `VB-1.02` encuentran la misma casa.
3. **Filtrar por grupo**: los botones bajo el buscador (**Todas · VB · VN · VC**)
   limitan la búsqueda a un grupo. Sirven sobre todo cuando el número se repite:
   escribir `102` sin filtro trae VB-1.02, VN-1.02 y VC-1.02 juntas.

   Los botones se arman solos con los grupos que traiga el reporte, así que si
   algún día aparece uno nuevo sale sin tocar nada. Si el reporte tiene un solo
   grupo, la fila de botones ni se muestra. Las casas sin guion (una bodega, por
   ejemplo) salen solo en *Todas*.

   Al elegir un grupo aparece debajo una segunda fila con los **bloques** de ese
   grupo (`1 · 2 · 3 · 10 · A`), que es lo que va entre el guion y el punto:
   `VB-5.14` es del bloque **5**. Con *Todas* no salen, porque un botón que
   dijera «1» mezclaría VB-1 con VN-1.
4. **Copiar**: el texto sale generado según el % de avance. Botón *Copiar*.

   Al copiar, la casa queda **marcada por 7 días**: al lado del botón sale
   *Añadido hoy*, que va cambiando solo (*ayer*, *hace 2 días*…) y desaparece al
   octavo. En la lista de casas queda una marquita ✓ para verlas de un vistazo.

   La marca se guarda por número de casa, no por reporte, así que **sigue ahí
   cuando importás el reporte de la semana siguiente**, que es cuando sirve. Si
   copiaste solo para leer, tocá la marca y se quita.
5. **Ver lo que falta**: a la derecha de la línea que cuenta las casas están
   **Registradas** y **Pendientes**, cada uno con su número. Tocá *Pendientes* y
   quedan solo las que faltan; vas copiando y van saliendo solas de la lista
   hasta que no queda ninguna. Tocá el mismo botón otra vez y vuelven todas.

   Se combina con lo demás: podés pedir las pendientes de VB-5, o buscar dentro
   de las pendientes.

   > Ojo: como la marca dura 7 días, *Pendientes* quiere decir «no la copié en
   > la última semana», no «no la copié nunca». Para el ritmo semanal calza, pero
   > si te atrasás, las de hace más de 7 días vuelven a salir como pendientes.
6. **Medidor**: cuando *Obras Complementarias* está en **100 %**, la app le agrega
   sola este texto al final:

   > , adicionalmente se comenta que la construccion ya cuenta con medidor provisional

   **Menos en las casas con el eléctrico en 100 %**: esas salen solo con su texto
   de obra finalizada, sin la línea del medidor. A esas alturas el medidor ya no
   es provisional.

   No se elige ni se edita desde la app: sale del reporte y punto. Si hace falta
   cambiar el texto o el porcentaje que lo dispara, es en `js/textos.js`.

## De dónde sale el texto

El % de avance eléctrico del reporte decide la etapa, y cada etapa tiene su texto
(los mismos de las fórmulas del Excel, sin tildes).

| % avance | Etapa | | % avance | Etapa |
|---|---|---|---|---|
| 0 | 0 | | 51–62 | 5 |
| 1–12 | 1 | | 63–75 | 6 |
| 13–25 | 2 | | 76–87 | 7 |
| 26–37 | 3 | | 88–99 | 8 |
| 38–50 | 4 | | 100 | 9 |

Tanto los **tramos** como los **textos** se cambian en `js/textos.js`, con el
Bloc de notas. Están al principio del archivo, con un comentario que explica cada
cosa. No se editan desde la app a propósito: no son cosa del día a día, y así no
se cambian por accidente.

- Para mover un tramo: la lista `LIMITES_DE_ETAPAS`.
- Para cambiar un texto de etapa: la lista `ETAPAS_ELECTRICAS`.
- Para el medidor: `TEXTO_MEDIDOR` es el texto, y `COMPLEMENTARIAS_CON_MEDIDOR`
  es el porcentaje a partir del cual se agrega (hoy, 100). La excepción de las
  casas finalizadas está en `llevaLineaDeMedidor()`, ahí mismo.
- Para el orden de los botones de grupo: la lista `ORDEN_DE_GRUPOS`.
- Para los días que dura la marca de copiado: `DIAS_DE_MARCA`, en `js/app.js`.

Después de editar: abrí el `.bat`, dejá que cargue la app, **cerrala y volvé a
abrirla**. La primera vez la app renueva su copia guardada, y la segunda ya muestra
el cambio.

> Si el cambio no aparece, subí en uno el número de `CACHE` en `sw.js`
> (`reportes-v5` → `reportes-v6`) y repetí los dos pasos.

## Los datos

Todo se guarda **solo en este equipo** (IndexedDB del navegador). Nada se sube a
internet, y no hay botón de respaldo: no hace falta.

La razón es que la app no guarda casi **nada** que no se pueda regenerar. Todo lo
que muestra sale del Excel. Si algún día se limpian los datos de Chrome, se vuelven
a importar los reportes y queda igual que antes.

> Lo único que no se regenera son las marcas de «añadido», porque salen de lo que
> copiaste y no del Excel. Si se limpian los datos de Chrome se pierden, pero como
> duran 7 días tampoco es mucho lo que hay que perder.

> Los `.xlsx` semanales son el respaldo real. Mientras los tengas guardados, no
> hay nada que perder.

## Archivos

| Archivo | Para qué |
|---|---|
| `Abrir Reportes.bat` | Levanta el servidor local. Solo para instalar o actualizar |
| `index.html` | La pantalla |
| `css/estilos.css` | Colores y diseño (verde `#add010`) |
| `js/textos.js` | Los textos, la relación % → etapa, la regla del medidor, los grupos y los bloques |
| `js/excel.js` | Lectura del `.xlsx` y reconocimiento de hoja y columnas |
| `js/almacen.js` | Guardado local |
| `js/app.js` | Búsqueda, filtros, marcas de copiado, importación, historial |
| `sw.js` | Funcionamiento sin internet |
| `servidor.ps1` | Servidor local |
| `vendor/xlsx.full.min.js` | SheetJS, la librería que lee Excel |

## Pendientes conversados

- De las cuatro etapas del medidor de la fórmula original quedó solo la 4, que es
  la que se puede sacar del reporte. Las otras dos (base del medidor, solicitud del
  provisional) están anotadas como comentario en `js/textos.js` por si algún día
  hace falta volver a usarlas.
- La fórmula del medidor tenía `Novarum!AC48` donde el resto apuntaba a la fila 13.
  Vale la pena revisar ese punto en el Excel original.
- La app usa la hoja que reconoce sola. Si algún reporte viniera con otro nombre de
  hoja o de columnas, no habría cómo corregirlo desde la pantalla: habría que
  ajustar los patrones en `js/excel.js`.
