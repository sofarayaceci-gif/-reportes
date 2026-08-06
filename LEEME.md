# Reportes — Adelante Desarrollos

App para consultar el avance eléctrico por casa y copiar el texto del reporte.

## Instalarla (se hace una sola vez)

1. Doble clic en **`Abrir Reportes.bat`**. Se abre Chrome en `http://localhost:8124`
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
2. **Buscar**: escribí el número de casa **o su código**. Funciona parcial y sin
   formato: `102`, `1.02` y `VB-1.02` encuentran la misma casa, y un código
   `CR-8891` se encuentra escribiendo `cr8891`, `8891` o `CR`.
3. **El código de cada casa**: al lado del número, en la ficha, hay un campito
   para escribirle un código propio. Se guarda **cuando lo aceptás**: con Enter
   o con el botón ✓ que aparece al lado. Mientras escribís no se guarda nada,
   así un código a medias no queda anotado.

   Mientras haya algo sin aceptar, el campo se pone en ámbar. Si te vas a otra
   casa sin aceptar, la app te avisa que se perdió.

   - Para **cambiarlo**, escribí encima y aceptá otra vez.
   - Para **borrarlo**, dejá el campo vacío y aceptá.
   - Si el código **ya está en otra casa**, te avisa y te dice en cuál. No te lo
     bloquea: lo guarda igual y vos decidís. El aviso salta aunque lo hayas
     escrito distinto (`ABC-1` y `abc1` cuentan como el mismo).

   Al lado del campo hay un **botón para copiarlo**, que sale cuando hay un
   código guardado. Los dos botones se turnan: mientras estés escribiendo algo
   sin aceptar, en su lugar está el ✓, para que no copies el código viejo
   creyendo que copiaste el nuevo.

   El código sale en la lista, en verde debajo del número. **No entra en el
   texto que se copia**: es una guía para reconocer y encontrar la casa.

   Va por número de casa, así que **sigue ahí cuando importás el reporte de la
   semana siguiente**, y se sincroniza con los demás aparatos.
4. **Filtrar por grupo**: los botones bajo el buscador (**Todas · VB · VN · VC**)
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
5. **Copiar**: el texto sale generado según el % de avance. Botón *Copiar*.

   Al copiar, la casa queda **marcada por 7 días**: al lado del botón sale
   *Añadido hoy*, que va cambiando solo (*ayer*, *hace 2 días*…) y desaparece al
   octavo. En la lista de casas queda una marquita ✓ para verlas de un vistazo.

   La marca se guarda por número de casa, no por reporte, así que **sigue ahí
   cuando importás el reporte de la semana siguiente**, que es cuando sirve. Si
   copiaste solo para leer, tocá la marca y se quita.
6. **Ver lo que falta**: a la derecha de la línea que cuenta las casas están
   **Registradas** y **Pendientes**, cada uno con su número. Tocá *Pendientes* y
   quedan solo las que faltan; vas copiando y van saliendo solas de la lista
   hasta que no queda ninguna. Tocá el mismo botón otra vez y vuelven todas.

   Se combina con lo demás: podés pedir las pendientes de VB-5, o buscar dentro
   de las pendientes.

   > Ojo: como la marca dura 7 días, *Pendientes* quiere decir «no la copié en
   > la última semana», no «no la copié nunca». Para el ritmo semanal calza, pero
   > si te atrasás, las de hace más de 7 días vuelven a salir como pendientes.
7. **Las terminadas**: en las casas que el reporte trae en **100 % de eléctrico**
   sale, dentro de la ficha, un check que dice **Bitácora cerrada**. Marcalo y la
   casa **sale de la lista de trabajo**. La lista te queda solo con lo que falta,
   que es la gracia.

   **El check lo ponés vos.** Llegar al 100 % en el Excel no la termina, y
   copiar el texto tampoco: la app no tiene cómo saber si ya cerraste la
   bitácora, así que no lo decide sola.

   Arriba de la lista aparece una tira que dice **✓ 18 terminadas**. Tocala y se
   ven solo ellas; tocá *Volver a las que faltan* y regresás.

   **Esto no se vence**, a diferencia de la marca de 7 días. Una bitácora cerrada
   lo está para siempre.

   - Si te equivocaste, abrí la casa y **quitá el check**: vuelve a la lista al
     toque. No pierde la marca de registrada, que es otra cosa. Y se lo quita
     también a las demás computadoras.
   - Si un reporte nuevo la trae **por debajo del 100 %** (una corrección en el
     Excel), vuelve sola a la lista sin que toqués nada, con el check puesto y
     una nota que lo explica. Si más adelante vuelve al 100 %, vuelve a estar
     terminada.

   > Esta pantalla necesita una tabla nueva en Supabase. Mientras no se corra el
   > SQL, las terminadas funcionan en el aparato pero no se sincronizan, y en
   > *Historial* sale el aviso de que faltan las tablas.
8. **Medidor**: cuando *Obras Complementarias* está en **100 %**, la app le agrega
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

## Cambiar los textos (la tuerca ⚙)

El botón de **tuerca**, al lado del clip, abre una pantalla con **los diez textos
de etapa y la línea del medidor**, cada uno rotulado con su tramo de porcentajes
para que sepas cuál estás tocando.

Se guarda **cuando tocás Guardar**. Escribir no guarda nada. Y los cambios **se
sincronizan**: los hacés una vez y quedan iguales en la compu y en el celular.

La red de seguridad, porque este texto es el corazón de la app:

- Cada texto tiene su **Restaurar**, que le devuelve el original.
- **Si dejás un campo vacío y guardás, vuelve solo el original.** No hay forma
  de quedarse sin texto.
- Abajo del todo, **Restaurar todos los textos** deja todo como venía de fábrica.

Los originales nunca se tocan: viven en `js/textos.js` y lo que escribís se
guarda encima. Por eso *Restaurar* siempre tiene a qué volver.

> Los **tramos de porcentaje** (que la etapa 6 vaya de 63 a 75, por ejemplo) **no**
> se cambian desde la app, a propósito: los textos se cambian por redacción y eso
> pasa seguido, pero mover un tramo mal reacomoda todas las casas de golpe.

### Lo que todavía se cambia en los archivos

Con el Bloc de notas, en `js/textos.js`:

- Para mover un tramo: la lista `LIMITES_DE_ETAPAS`.
- Para el porcentaje a partir del cual se agrega el medidor (hoy, 100):
  `COMPLEMENTARIAS_CON_MEDIDOR`. La excepción de las casas finalizadas está en
  `llevaLineaDeMedidor()`, ahí mismo.
- Para el orden de los botones de grupo: la lista `ORDEN_DE_GRUPOS`.
- Para los días que dura la marca de copiado: `DIAS_DE_MARCA`, en `js/app.js`.

Después de editar un archivo hay que subirlo a GitHub, y en la app **cerrarla y
volver a abrirla**: la primera vez renueva su copia guardada y la segunda ya
muestra el cambio.

> Si el cambio no aparece, subí en uno el número de `CACHE` en `sw.js`
> (`reportes-v11` → `reportes-v12`) y repetí los dos pasos. Con
> **Ctrl+Shift+R** en el navegador también se fuerza de una.

## La nube (ver lo mismo en la compu y en el celular)

La app está publicada en **https://sofarayaceci-gif.github.io/-reportes/**. Ese es
el enlace que se abre en cualquier aparato y el que se instala como app.

**No hay que entrar ni escribir nada.** Se abre el enlace y se sincroniza sola por
detrás. Va y viene todo lo que no se puede sacar del Excel:

| | |
|---|---|
| Los reportes importados | con sus casas |
| Las marcas de «añadido» | las de 7 días |
| **Los códigos** de cada casa | |
| **Los checks** de bitácora cerrada | las casas terminadas |
| **Los textos** que hayas cambiado con la tuerca | |

En la pestaña **Historial**, arriba, se ve cómo fue la última vez, y si algo falló
aparece un botón de *Reintentar*.

> **Lo local sigue mandando.** IndexedDB es la copia con la que la app trabaja, y
> la nube solo la empareja cuando hay internet. **Sin señal la app funciona
> completa**: importar, buscar, copiar y marcar. Cuando vuelve la conexión, se
> pone al día sola.

### Detalles que conviene saber

- **Las marcas y los códigos se juntan, no se reemplazan.** Si dos aparatos
  tienen algo distinto, para cada casa queda uno solo: la marca más nueva y el
  código escrito más tarde. Nunca se pierde nada. Lo peor que puede pasar es que
  reaparezca algo que borraste sin señal, y se borra otra vez.
- **Los checks de bitácora funcionan distinto: gana la última vez que se tocó.**
  Poner y quitar pesan igual, así que **si le quitás el check en una compu, se le
  quita en todas**.

  Tienen que ser así por algo concreto: la app se acuerda de los checks que
  quitaste, no solo de los que pusiste. Si simplemente los olvidara, otra compu
  que todavía tuviera la casa cerrada la volvería a cerrar en todas en cuanto
  alguien abriera la app ahí. Pasó, y por eso se cambió.

  El único caso raro es tocar la misma casa en dos compus sin internet: gana la
  que se tocó última por reloj.
- **Los textos de la tuerca no se juntan: gana el más nuevo, entero.** Son textos
  que se escriben de tanto en tanto y desde un solo lado, y mezclar la mitad de
  un aparato con la mitad del otro dejaría un reporte que no escribió nadie.
- **Borrar un reporte lo borra en la nube también.** Si no hay señal en ese
  momento, avisa: se borró en el aparato pero no en la nube, así que va a volver
  a bajar en la próxima sincronización.
- **Cuál reporte está activo es de cada aparato.** Si cambiás de reporte en la
  compu, el celular sigue con el suyo. Se puede hacer que se comparta si hace
  falta.

### ⚠️ La nube va abierta, a propósito

En `js/nube.js` hay una clave (`sb_publishable_…`). Va dentro de la página y el
repositorio es público, así que **cualquiera que la encuentre puede leer, cambiar
y borrar lo que haya en la nube**. Se decidió así para que no haya que entrar con
contraseña en cada aparato.

Lo que hace que eso no sea grave:

- Son datos de avance de obra, no datos personales ni contraseñas.
- **Cada aparato conserva su copia completa** en IndexedDB. Si alguien vaciara la
  nube, la compu y el celular siguen con todo.
- Los `.xlsx` semanales siguen siendo el respaldo de verdad.

Si algún día se quiere cerrar, la nota del final de `supabase/esquema.sql` dice
qué cambiar: es agregar una columna de usuario, cambiar tres reglas y volver a
poner un formulario de entrar.

⚠️ La otra clave de Supabase, la que empieza con **`sb_secret_`**, **no va nunca**
en ningún archivo de la app. Esa se salta hasta las reglas de la base.

## Los datos

Los reportes se guardan **en este equipo** (IndexedDB del navegador) y también en
la nube. No hay botón de respaldo: no hace falta.

La razón es que la app no guarda casi **nada** que no se pueda regenerar. Todo lo
que muestra sale del Excel. Si algún día se limpian los datos de Chrome, se vuelven
a importar los reportes y queda igual que antes.

Lo que **no** se regenera del Excel es lo que escribiste vos: las marcas de
«añadido», los códigos de cada casa, cuáles quedaron terminadas y los textos que
hayas cambiado con la tuerca. **Con la nube ya no se pierden**: si se limpian los
datos de Chrome, al volver a abrir la app bajan de nuevo.

> Los `.xlsx` semanales son el respaldo real. Mientras los tengas guardados, no
> hay nada que perder.

## Archivos

| Archivo | Para qué |
|---|---|
| `Abrir Reportes.bat` | Levanta el servidor local. Solo para instalar o actualizar |
| `index.html` | La pantalla |
| `css/estilos.css` | Colores y diseño (verde `#add010`) |
| `js/textos.js` | Los textos de fábrica, la relación % → etapa, la regla del medidor, los grupos y los bloques |
| `js/excel.js` | Lectura del `.xlsx` y reconocimiento de hoja y columnas |
| `js/almacen.js` | Guardado local |
| `js/nube.js` | Sincronización con Supabase (subir y bajar) |
| `supabase/esquema.sql` | Las tablas y las reglas de acceso de la base |
| `js/app.js` | Búsqueda, filtros, marcas, códigos, terminadas, ajustes, importación, historial |
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
  
