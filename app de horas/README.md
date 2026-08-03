# Registro de Horas

Aplicación web para registrar las horas trabajadas por empleado, actividad y casa.
No necesita servidor ni instalación: es HTML, CSS y JavaScript sin dependencias.

## Cómo se usa

Doble clic en `Horas.cmd` —así además se puede instalar como aplicación, ver
abajo—, o abrir `index.html` en el navegador, o entrar a la dirección donde esté
publicada. La primera vez pide crear un usuario y una contraseña para proteger
los registros.

Hay dos pestañas: **Registro**, para anotar las horas del día (la jornada son 12
horas por empleado y por día, con la hora de almuerzo adentro), y
**Horas**, con los totales por empleado por día, semana o
mes y un botón para bajar el detalle por empleado y actividad en un CSV que
Excel abre en columnas.

Un día con registros pero por debajo de las 12 h cuenta como incompleto, y sale
en rojo si ya pasó. Por eso los días de antes del cambio, cuando la jornada eran
11 h, aparecen marcados aunque en su momento estuvieran completos.
**Configuración** y **Salir** están en el menú de la barra de arriba.

## Las dos maneras de anotar las horas

El campo **Horas trabajadas** tiene dos botones y se ve uno solo a la vez; cada
quien usa el que prefiera y la app recuerda el último que usó en ese
dispositivo.

- **Cantidad de horas**: el desplegable de 0,5 en 0,5 hasta 12. Es lo de antes.
- **Entrada y salida**: dos relojes. En el celular abren el selector de hora del
  teléfono.

Las dos terminan en lo mismo, un número de horas trabajadas, y es ese número el
que se guarda: los totales, la jornada de 12 h y el Excel funcionan igual con una
que con otra. Con el reloj además se puede anotar la entrada al llegar y la
salida al rato, sin esperar a que termine la jornada: ver
[Turnos abiertos](#turnos-abiertos).

En el celular, las tres barras de búsqueda —empleado, actividad y casa— abren su
lista **hacia arriba**, porque abajo del campo está el teclado y ahí no se ve
nada. La lista llega hasta la barra de arriba y no más, y si sobran opciones se
scrollean adentro. Si el campo quedó tan arriba que no cabe, esa vez abre hacia
abajo. En la computadora abre hacia abajo, que no hay teclado que tape.

### Turnos abiertos

En el modo **Entrada y salida** hay un segundo botón, **Abrir turno**: pide lo
mismo que un registro —empleado, actividad, casa— pero solo con la hora de
entrada. Sirve para anotar a la gente cuando llega, en vez de esperar a que
termine el día.

El turno queda en una tira arriba del formulario. Cuando la persona se va, el
botón **Poner la salida** abre el reloj en esa misma línea y **Cerrar turno**
guarda un registro normal, con su entrada y su salida, igual que si se hubiera
anotado todo de una vez. Ahí recién se revisa que la salida sea posterior a la
entrada y que las horas quepan en el día. La ✕ descarta un turno sin registrar
nada.

Pueden haber varios turnos abiertos a la vez, pero **uno solo por empleado**:
nadie está en dos casas al mismo tiempo, así que si aparece un segundo lo más
probable es que se olvidaran de cerrar el primero. Al abrir un turno el
formulario borra el nombre y deja actividad, casa y entrada puestas, que es lo
que sirve cuando llegan varias personas a la misma casa a la misma hora.

Un turno abierto **todavía no es un registro**: no suma horas, no aparece en el
resumen ni en el Excel, y el día se ve incompleto hasta que se cierre. Los que
queden abiertos de días anteriores salen marcados en rojo en la tira. Un turno
que cruza la medianoche no se puede cerrar: hay que anotarlo en dos partes.

Los turnos abiertos **no se sincronizan**: viven en el navegador donde se
abrieron y ahí hay que cerrarlos. Es a propósito. La fusión de la nube solo sabe
agregar y borrar registros, nunca modificarlos, así que un registro guardado a
medias y completado más tarde se perdería en la primera bajada. Por eso el turno
no se convierte en registro hasta que está completo.

### La nota

Cualquier registro puede llevar una nota, un texto libre para lo que haya que
aclarar: *1 h esperando material*, *llovió toda la tarde*. El campo no está a la
vista hasta que se pide con **+ Agregar una nota**, para no alargar el formulario
en el celular; al cerrar un turno también hay uno.

La nota no cambia ninguna cuenta: no descuenta horas ni suma nada. Se ve en ámbar
debajo de la actividad en la tabla del día y sale en el Excel, en su propia
columna.

Como se guarda junto con el registro, se escribe en el momento: para cambiarla
hay que borrar el registro y anotarlo de nuevo, igual que cualquier otra
corrección.

### Horas extra

Las 12 h son la jornada, no un máximo. Cuando un empleado las cumple sale el
banner de siempre —**12 horas cumplidas**— y el formulario se guarda, para que
nadie le agregue horas a un día terminado por descuido. Si de verdad hubo horas
extra, el botón **Agregar horas extra** del banner devuelve el formulario y abajo
avisa que lo que se anote ahí ya es hora extra.

Esas horas se guardan como cualquier otra, sin nada que marcar. Lo que se ve es
el total del día, que pasa de 12 y lo dice al lado: `14 / 12 h` con un
`+2 h extra` en ámbar. El día cuenta como completo, y en la semana y el mes las
horas extra están sumadas. El Excel las trae en una columna aparte, calculadas
igual (ver [Lo que sale en el Excel](#lo-que-sale-en-el-excel)).

No hay tope de horas extra. El único límite es el día entero: 24 h. Si se
intenta pasar de ahí, la app avisa (*"Ana ya tiene 20 h en esta fecha: no caben 6
h más en un día"*) y no guarda nada. Ese límite está para atrapar el dedazo —
anotar 12 dos veces, por ejemplo—, no para frenar la hora extra.

El botón queda pedido para ese empleado y esa fecha: si se cambia de empleado o
de día el formulario se vuelve a guardar, y al volver sigue abierto.

### La hora de almuerzo va adentro

La hora de almuerzo no se descuenta: está incluida en las 12 h del día, así que
de 06:00 a 18:00 se registran 12 h y el día queda completo. Debajo del campo hay
un recordatorio en letra chica que lo dice —*Dentro de las 12 h va la hora de
almuerzo*—, y es solo eso, un texto: no cambia ninguna cuenta y no hay nada que
marcar ni desmarcar.

Antes la app descontaba esa hora y había una casilla para hacerlo. Los registros
de entonces guardaron el descuento y se sigue mostrando en la tabla del día
(`07:00–19:00 (−1 h)`): si no, en esas filas las horas no darían con el rango.

Como toda la app va de media en media hora, el reloj **redondea a la media hora
más cercana** y debajo dice qué va a quedar registrado antes de guardar
("5 h 25 min · se registran 5,5 h"), para que nadie se entere después. Los
registros hechos con el reloj guardan además la entrada y la salida, que se ven
en letra chica en la tabla del día; en el Excel no aparecen, porque ahí cada
fila es una suma de varios registros y una suma no tiene hora de entrada.

Si la salida es anterior a la entrada la app avisa que está mal en vez de
suponer un turno de noche: es mucho más común que sea un error de tipeo. Si
alguna vez hay turnos que cruzan la medianoche, hay que anotarlos en dos partes.

## Instalarla como aplicación

Chrome solo ofrece **Instalar** cuando la app viene de una dirección web:
abriendo `index.html` a mano la dirección es `file://` y no lo ofrece nunca, por
más iconos que tenga. Para eso está `Horas.cmd`.

Doble clic en **Horas.cmd**, o en el acceso directo **Horas** del escritorio:
levanta un servidor local, abre Chrome en `http://localhost:8123/` y ahí sí
aparece el icono de instalar en la barra de direcciones (o *Menú → Guardar y
compartir → Instalar página como aplicación*). Queda en el menú Inicio, con su
propio icono y en una ventana sin barra del navegador.

Después se abre desde el menú Inicio como cualquier programa, **aunque el
servidor no esté andando**: `sw.js` guardó una copia de los archivos. El
servidor solo hace falta la primera vez y cuando cambien los archivos de la app;
se apaga solo a la media hora sin pedidos y escucha únicamente en `localhost`,
así que nada sale de la computadora.

Dos cosas que hay que saber:

- Para el navegador `http://localhost:8123` y `file://…` son dos lugares
  distintos, así que la primera vez la app instalada **pide crear el usuario de
  nuevo** y arranca vacía. Las horas bajan solas de la nube en unos segundos; no
  hay que copiar nada a mano.
- Esto vale para esta computadora. Para instalarla en el celular o en otra
  máquina hay que publicar la carpeta en una dirección `https://` (GitHub Pages,
  por ejemplo) y entrar ahí; en el iPhone es *Compartir → Añadir a inicio*.

Al cambiar los archivos conviene subirle el número a `CACHE` en `sw.js`
(ahora va en `horas-v10`). Sin eso, algún dispositivo podría seguir un rato con
la copia vieja.

## Dónde se guardan los datos

En el `localStorage` del navegador, es decir en cada dispositivo por separado,
con una copia de respaldo en la misma máquina por si la principal se pierde.
Cada guardado se vuelve a leer para comprobarlo: si el navegador se niega a
guardar (almacenamiento lleno, ventana de incógnito) sale un **aviso rojo** en
la pantalla en vez de fallar en silencio.

Nada de esto viaja dentro del código: quien abra la dirección de la app ve
una app vacía, no los registros de nadie.

Para ver los mismos datos desde otro dispositivo está la sincronización con
[jsonbin.io](https://jsonbin.io/), que viene encendida y no hay que configurar:
el Bin ID y la Access Key están escritos en `nube.js`, iguales en todos los
dispositivos. Se sincroniza al abrir la app y después cada 10 segundos mientras
la pestaña esté a la vista. El panel **Sincronización** (en *Menú →
Configuración*) muestra el estado y permite desconectar ese dispositivo.

Cada sincronización **junta** lo del bin con lo del dispositivo en vez de
reemplazarlo, así que dos personas registrando a la vez no se borran las horas
entre ellas y una bajada no puede tragarse un registro recién hecho. Algo
desaparece solo cuando se borra a propósito: ese borrado queda anotado (con la
fecha) para que la fusión no lo devuelva desde otro dispositivo. Esas anotaciones
se olvidan a los 90 días, así que un dispositivo que estuvo apagado más tiempo
que eso sí podría resucitar algo borrado. Como contrapartida, si dos personas
anotan la misma jornada por separado quedan las dos líneas y el día suma el
doble; hay que borrar la que sobra.

Que la clave esté en el código implica que **quien tenga la dirección de la app
puede leer y sobrescribir ese bin**, porque viaja al navegador. Es una decisión
a cambio de no configurar nada en cada dispositivo. Por eso conviene que esa
Access Key no tenga el permiso `delete`; si se filtra, se regenera en
jsonbin.io → API Keys y se cambia esa línea de `nube.js`.

La contraseña de acceso a la app no se sincroniza ni está en el repositorio:
queda en el navegador de cada dispositivo.

## Lo que sale en el Excel

El botón **Exportar a Excel** de la pestaña Horas baja un CSV del rango que esté
a la vista (día, semana o mes) con una sola tabla: cuántas horas puso cada
empleado en cada actividad y en cuál casa, y el total al final.

| Columna                     | Qué trae                                          |
|-----------------------------|---------------------------------------------------|
| `Fecha`, o `Desde` y `Hasta`| De qué fechas habla la fila                       |
| `Empleado`                  | Un empleado                                       |
| `Actividad`                 | Una de las actividades en las que trabajó          |
| `Casa`                      | En cuál casa hizo esa actividad                   |
| `Horas`                     | Lo que sumó ahí ese empleado                      |
| `Horas extra`               | Cuántas de esas pasaron de la jornada             |
| `Nota`                      | Lo que se anotó a mano, si se anotó algo          |

Cada casa va en su propia fila en vez de juntar varias en una celda: así se puede
filtrar y sumar por casa en el Excel, que es para lo que sirve tenerla. Por eso
un mismo empleado puede aparecer varias veces con la misma actividad, una vez por
cada casa donde la hizo.

Las fechas se repiten en cada fila a propósito: así el archivo se entiende solo y
se pueden pegar varios uno debajo del otro sin perder de qué semana era cada uno.
Por lo mismo las columnas de horas extra y de nota van siempre, incluso cuando el
período no tuvo ninguna: en ese caso salen en blanco, pero las columnas siguen
calzando.

Como una fila puede ser la suma de varios registros, y cada uno pudo traer su
nota, en la celda van todas separadas por `·` —y no por `;`, que es lo que separa
las columnas—. Las repetidas se escriben una sola vez.

Las horas extra no están guardadas en ningún lado, se calculan al exportar: son
las que pasan de las 12 h **de ese empleado en ese día**. Para saber a qué
actividad le tocan, dentro de cada día los registros se ordenan por cuándo se
anotaron y las últimas horas son las extra. Es el mismo orden que impone la app,
que cierra el formulario al cumplirse la jornada. Así, quien hizo 8 h de repello
y después 6 de pintura tiene sus 2 h extra en la fila de pintura.

Es UTF-8 con BOM y separador `;`, así que Excel en español lo abre en columnas
con doble clic y las tildes salen bien.

## Archivos

| Archivo                 | Para qué sirve                                          |
|-------------------------|---------------------------------------------------------|
| `index.html`            | Estructura de las pantallas                             |
| `styles.css`            | Estilos                                                 |
| `app.js`                | Registros, listas, resumen, vista Horas, Excel y guardado |
| `acceso.js`             | Pantalla de acceso, sesión y cambio de contraseña       |
| `nube.js`               | Sincronización con jsonbin.io                           |
| `manifest.webmanifest`  | Nombre, iconos y colores para instalarla como app       |
| `sw.js`                 | Service worker: instalación y funcionamiento sin internet |
| `Horas.cmd`             | Abre la app en el navegador (arranca el servidor local)  |
| `servidor-local.ps1`    | El servidor local; es lo que permite instalarla          |
| `icono-*.png`, `apple-touch-icon.png` | Iconos de la app                          |
| `icono.ico`             | Icono del acceso directo de Windows                      |

## Aviso

La contraseña de acceso es un candado local: sirve para que nadie toque los
registros por descuido, no para frenar a alguien con conocimientos técnicos y
acceso al dispositivo.
