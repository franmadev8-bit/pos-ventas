# Reglas de negocio — POS

Catálogo de las reglas del dominio, independiente de la implementación.
`PLAN.md` define **cómo** se construye; este documento define **qué** tiene que
cumplir.

Formato: `R-AREA-nn [fase] enunciado`. Donde la regla no es obvia, va el porqué.
Una regla marcada `[V2]` o `[V3]` no se implementa ahora, pero el modelo de datos
de V1 no puede quedar cerrado en contra de ella.

Áreas: `GEN` transversal · `CAT` catálogo · `VTA` venta · `PAG` cobro ·
`ANU` anulación · `CAJ` turno de caja · `STK` stock · `CMP` compras y costos ·
`PRE` precios · `CLI` clientes · `FIS` fiscal · `USR` usuarios · `SYN` sync ·
`ROB` robustez · `REP` reportes.

Al final, en §16, las decisiones que estas reglas dejan abiertas.

---

## 1. Transversales (GEN)

**R-GEN-01 [V1]** Todo importe es un entero en centavos. Ningún cálculo de plata
pasa por punto flotante en ningún punto del camino, incluido el parseo de lo que
tipea el cajero y el parseo del archivo de importación.

**R-GEN-02 [V1]** Toda cantidad es un entero en milésimas. `1000` = una unidad o
un kilo. Una cantidad de cero está prohibida en cualquier línea persistida.

**R-GEN-03 [V1]** El redondeo ocurre en un solo lugar de todo el sistema: al
calcular el importe de una línea. `importe = redondear(precio_unitario × cantidad_milésimas / 1000)`,
mitad hacia arriba en valor absoluto. Ningún otro cálculo redondea.

**R-GEN-04 [V1]** El total de una venta es la suma de los importes de línea **ya
redondeados**, nunca el redondeo de la suma. Si no, el total no coincide con la
suma de lo que el cliente ve impreso y no hay forma de explicarle la diferencia.

**R-GEN-05 [V1]** Toda fecha se persiste en UTC, ISO 8601. La conversión a hora
local es responsabilidad de la UI y nunca se persiste convertida.

**R-GEN-06 [V1]** El **día comercial** no es el día calendario. Un kiosco que
cierra a las 2 de la mañana necesita que las ventas de las 00:30 pertenezcan al
día anterior. El día comercial se define como el intervalo `[hora_corte del día D,
hora_corte del día D+1)`, con `hora_corte` configurable por comercio (default
06:00 local). Todos los reportes diarios usan este intervalo, no la medianoche.

**R-GEN-07 [V1]** El día comercial y el turno de caja son cosas distintas y no se
mezclan. Un día comercial puede tener varios turnos; un turno mal cerrado puede
cruzar dos días comerciales. Los reportes por día y los reportes por turno se
calculan por separado.

**R-GEN-08 [V1]** Toda entidad que en algún momento se va a sincronizar tiene un
UUID generado en el cliente en el momento de crearla, antes de persistirla.

**R-GEN-09 [V1]** Toda operación que escribe en más de una tabla es atómica: se
aplica entera o no se aplica. Un corte de energía a la mitad no puede dejar una
venta con la mitad de las líneas.

**R-GEN-10 [V1]** Toda operación de escritura es idempotente respecto de su UUID:
reintentar la misma operación con el mismo UUID no duplica nada y devuelve el
resultado de la primera.

**R-GEN-11 [V1]** Los datos que describen una operación pasada se congelan en el
momento de la operación (snapshot). Cambiar una configuración, un precio o el
nombre de un medio de pago no puede alterar el valor de nada ya registrado.

**R-GEN-12 [V1]** Nada se borra. Las entidades de catálogo se desactivan; las
operaciones se compensan con una operación inversa.

---

## 2. Catálogo (CAT)

**R-CAT-01 [V1]** La identidad de un producto es su UUID. Ni la descripción ni el
código de barras son identidad: dos productos pueden llamarse igual y un producto
puede cambiar de código.

**R-CAT-02 [V1]** Un producto tiene cero o más códigos de barras. Un código
pertenece a un solo producto activo a la vez.

**R-CAT-03 [V1]** Un código de barras liberado (porque su producto se desactivó)
puede reasignarse a otro producto. Es lo normal: cambia el proveedor y el mismo
EAN vuelve con otro artículo.

**R-CAT-04 [V1]** Un producto sin código de barras es válido y vendible: se carga
por búsqueda de descripción. La mayoría del catálogo de una despensa no tiene
código (fraccionados, panificados, sueltos).

**R-CAT-05 [V1]** Un código escaneado que empieza con prefijo `20`–`29` es una
etiqueta de balanza, no un EAN de producto. Lleva embebido el código interno del
artículo y el peso o el importe. Se parsea según el formato de la balanza; no se
busca literal en la tabla de códigos. Si el sistema lo trata como un EAN común,
cada pesada genera un código distinto y nunca encuentra el producto.

**R-CAT-06 [V1]** El precio de venta se carga **con IVA incluido**: es el número
que el comerciante escribe en el cartelito. El neto se deriva al facturar, nunca
al revés.

**R-CAT-07 [V1]** El precio de venta puede ser cero (producto de regalo, muestra),
pero nunca negativo.

**R-CAT-08 [V1]** Un producto se vende por unidad o por peso. Si es por peso, el
precio cargado es el precio por kilo, y la cantidad de la línea se expresa en
gramos convertidos a milésimas de kilo.

**R-CAT-09 [V1]** El costo es opcional y **nunca aparece en la pantalla de venta**.
El cajero puede no ser el dueño.

**R-CAT-10 [V1]** Desactivar un producto lo saca de la búsqueda de venta pero no
lo borra de ninguna venta histórica, que lo conserva por snapshot.

**R-CAT-11 [V1]** Cambiar el precio de un producto afecta únicamente a las ventas
futuras. Ninguna venta ya registrada cambia de valor.

**R-CAT-12 [V1]** La categoría es opcional. Desactivar una categoría no desactiva
sus productos: quedan sin categoría.

**R-CAT-13 [V1]** La búsqueda por descripción es insensible a mayúsculas, acentos
y orden de palabras. "coca 2 lt" tiene que encontrar "Coca-Cola 2,25 L". Un
comerciante no escribe el nombre exacto del producto.

**R-CAT-14 [V2]** Un producto puede tener una unidad de compra distinta de la
unidad de venta (se compra la caja de 24, se vende la unidad), con un factor de
conversión. Sin esto, el stock y el costo unitario no cierran nunca.

**R-CAT-15 [V2]** Un producto puede estar marcado como "no controla stock"
(servicios, recargas, fraccionados sin control). Los movimientos de stock no se
generan para esos productos.

---

## 3. Venta (VTA)

**R-VTA-01 [V1]** Una venta es inmutable. Una vez registrada no se edita ni se
borra, ni por el dueño, ni por soporte, ni por una migración.

**R-VTA-02 [V1]** Una venta pertenece a exactamente un turno de caja, el que
estaba abierto al momento de registrarla, y nunca cambia de turno.

**R-VTA-03 [V1]** No se registra una venta sin líneas.

**R-VTA-04 [V1]** Cada línea de venta guarda un snapshot completo: descripción,
precio unitario, costo unitario, alícuota de IVA y unidad. Ninguno de esos datos
se resuelve siguiendo la clave foránea al producto en el momento de mostrar o
reimprimir el ticket.

**R-VTA-05 [V1]** Una línea puede no tener producto asociado (venta genérica: un
monto suelto con descripción libre). En ese caso lleva la alícuota de IVA por
defecto del comercio.

**R-VTA-06 [V1]** El cajero puede editar la cantidad y el precio unitario de una
línea antes de cobrar. La línea guarda **además** el precio de lista vigente al
momento, para que después se pueda saber si hubo edición manual y de cuánto.
Sin ese dato no hay forma de auditar el descuento informal en el mostrador, que
es la principal fuga de plata en un comercio chico.

**R-VTA-07 [V1]** Escanear dos veces el mismo producto acumula cantidad en la
misma línea, siempre que el precio no haya sido editado a mano. Si fue editado,
la nueva lectura crea una línea nueva.

**R-VTA-08 [V1]** El número interno de ticket se asigna en el momento de
persistir, dentro de la misma transacción, y es secuencial y sin huecos por
instalación. Un ticket que falla al registrarse no consume número.

**R-VTA-09 [V1]** El número interno de ticket y el número de comprobante fiscal
son dos cosas distintas y nunca comparten campo. El interno existe siempre; el
fiscal puede no existir nunca.

**R-VTA-10 [V1]** La venta en curso vive en memoria y no se persiste hasta que el
cobro está completo. Un ticket a medio armar que se pierde por un cierre abrupto
no es un problema de datos.

**R-VTA-11 [V1]** `total = subtotal − descuento`, y `subtotal` es la suma exacta
de los importes de línea. La igualdad se verifica antes de persistir y la base la
rechaza si no se cumple.

**R-VTA-12 [V1]** El descuento nunca supera el subtotal. Una venta no puede tener
total negativo, salvo que sea una anulación.

**R-VTA-13 [V2]** Una venta puede ponerse en espera y retomarse después. Una venta
en espera **no es una venta**: es un borrador con su propia tabla, porque la venta
es inmutable y un borrador todavía no existe como hecho económico.

**R-VTA-14 [V2]** El descuento puede aplicarse a una línea o al total. Si es al
total, se prorratea sobre las líneas al calcular el IVA, no queda como concepto
suelto, porque el comprobante fiscal necesita el neto por alícuota.

---

## 4. Cobro (PAG)

**R-PAG-01 [V1]** La suma de los montos imputados de los pagos es exactamente
igual al total de la venta. No "mayor o igual": exacto. El excedente entregado en
efectivo se registra aparte como recibido y vuelto, y no se imputa.

**R-PAG-02 [V1]** Una venta puede tener varios pagos, incluso del mismo medio (dos
tarjetas distintas). El orden de los pagos se conserva.

**R-PAG-03 [V1]** Solo los medios marcados como que admiten vuelto (en la
práctica, efectivo) pueden recibir más de lo imputado. Nadie da vuelto de una
transferencia.

**R-PAG-04 [V1]** `vuelto = recibido − imputado`, calculado por línea de pago en
efectivo, no a nivel de la venta. A nivel de venta el número no significa nada
cuando el pago es mixto.

**R-PAG-05 [V1]** No se puede imputar a un medio de pago más de lo que resta por
cobrar.

**R-PAG-06 [V1]** Cada pago guarda snapshot del nombre del medio, su tipo y si
afecta al arqueo. Si mañana el dueño cambia la configuración de un medio, los
turnos ya cerrados no cambian de valor.

**R-PAG-07 [V1]** Solo los medios marcados como que afectan el arqueo entran al
cálculo del efectivo esperado en la caja. Una venta con tarjeta no pone plata en
el cajón.

**R-PAG-08 [V1]** Si se aplica redondeo por falta de monedas, es una **línea de
ajuste explícita** en la venta, con su propio importe, y no una modificación de
los importes de línea. El cliente tiene que poder ver de dónde salió la
diferencia, y el neto gravado del comprobante fiscal tiene que cerrar.

**R-PAG-09 [V2]** Un pago con tarjeta puede tener recargo por cuotas. El recargo
es una línea de la venta, no un ajuste del medio de pago, por el mismo motivo que
R-PAG-08.

**R-PAG-10 [V3]** Un pago puede ser "a cuenta corriente": no ingresa plata ahora,
genera un cargo en la cuenta del cliente. Requiere cliente identificado.

---

## 5. Anulación y devolución (ANU)

**R-ANU-01 [V1]** Una venta nunca se borra ni se marca como anulada con un campo
mutable. Anular es registrar una **venta nueva** de tipo anulación que referencia
a la original, con todos los importes en negativo, espejo exacto: mismas líneas,
mismas cantidades, mismos precios, mismos medios de pago.

**R-ANU-02 [V1]** El estado "anulada" de una venta se deriva de la existencia de
esa anulación. No existe como dato propio.

**R-ANU-03 [V1]** Una venta se anula una sola vez. Lo garantiza un índice único,
no una validación en el código.

**R-ANU-04 [V1]** Una anulación no se anula. Si el cajero se equivocó al anular,
vuelve a hacer la venta.

**R-ANU-05 [V1]** La anulación se imputa al turno **abierto en el momento de
anular**, no al turno de la venta original. La plata sale del cajón de hoy, así
que tiene que descontarse del arqueo de hoy. Un turno ya cerrado está congelado y
no puede cambiar de valor retroactivamente.

**R-ANU-06 [V1]** Al anular, la devolución del dinero se hace por los mismos
medios de pago de la venta original. No se anula una venta con tarjeta
devolviendo efectivo: descuadra la caja y el resumen por medio.

**R-ANU-07 [V1]** La anulación registra el motivo. Es el único dato que la
distingue de una venta normal a la hora de investigar un descuadre, y es gratis
pedirlo.

**R-ANU-08 [V2]** La devolución parcial (el cliente devuelve dos de cinco
artículos) no es una anulación: es una operación propia, con sus propias líneas,
que referencia la venta original y nunca supera lo vendido en ella.

**R-ANU-09 [V3]** Anular una venta que ya tiene comprobante fiscal autorizado
requiere emitir una nota de crédito ante ARCA. La anulación interna sola no
alcanza: el comprobante original ya existe para el fisco y no desaparece.

---

## 6. Turno de caja (CAJ)

**R-CAJ-01 [V1]** Hay a lo sumo un turno abierto por caja, garantizado por un
índice único parcial.

**R-CAJ-02 [V1]** No se puede vender sin turno abierto. Es la única forma de que
el arqueo cierre.

**R-CAJ-03 [V1]** El turno se abre declarando el fondo inicial en efectivo, que
puede ser cero pero no negativo.

**R-CAJ-04 [V1]** Los movimientos de caja son siempre efectivo y siempre tienen
concepto. El monto es positivo; el signo lo da el tipo (ingreso o egreso).

**R-CAJ-05 [V1]** El efectivo esperado al cierre es
`fondo_inicial + ventas_en_efectivo + ingresos − egresos`, donde
`ventas_en_efectivo` ya incluye las anulaciones en negativo. Tiene que ser
verificable con una calculadora, a mano, sin abrir el sistema.

**R-CAJ-06 [V1]** El cierre congela todos los totales calculados en el momento de
cerrar. Nunca se recalculan después, ni aunque se descubra un error. Un turno
cerrado es un hecho histórico.

**R-CAJ-07 [V1]** Un turno cerrado no se reabre. Si hace falta corregir, se hace
con un movimiento de caja en el turno siguiente, dejando el rastro.

**R-CAJ-08 [V1]** La diferencia de arqueo puede ser positiva o negativa y **nunca
bloquea el cierre**. Si el cajero contó de menos, el sistema no puede dejarlo
encerrado a las 10 de la noche. Se registra y se sigue.

**R-CAJ-09 [V1]** Si la diferencia no es cero, la observación es obligatoria.

**R-CAJ-10 [V1]** El cierre congela también el desglose por medio de pago, no
solo el efectivo. Es lo que se concilia después contra el resumen del posnet.

**R-CAJ-11 [V1]** Un turno puede quedar abierto más de un día (se olvidan de
cerrarlo). El sistema lo permite y lo avisa al abrir, pero los reportes por día
comercial no dependen del turno (R-GEN-07).

**R-CAJ-12 [V1]** El retiro de efectivo por seguridad ("sobre", "a la caja
fuerte") es un egreso con concepto, no un cierre de turno. Es la operación de
caja más frecuente después de la venta y no puede obligar a cerrar.

**R-CAJ-13 [V2]** El fondo inicial del turno siguiente puede arrastrarse del
contado del turno anterior menos el retiro, en vez de tipearse de nuevo. Reduce
el error de carga, que es la causa número uno de descuadres fantasma.

---

## 7. Stock (STK)

**R-STK-01 [V2]** El stock de un producto **no es un campo**. Es la suma de sus
movimientos: compra, venta, ajuste, merma, devolución, recuento.

**R-STK-02 [V2]** Si por performance se cachea un saldo, ese caché nunca es fuente
de verdad y se puede reconstruir enteramente desde los movimientos.

**R-STK-03 [V2]** Cada línea de venta con producto genera un movimiento negativo;
cada línea de una anulación, uno positivo. Ambos en la misma transacción que la
venta.

**R-STK-04 [V2]** **El stock nunca bloquea una venta.** Si el sistema dice cero y
el producto está en la góndola, el sistema está equivocado y el cliente está
esperando. Se avisa y se vende igual. El saldo negativo es información sobre la
calidad de los datos, no un error a impedir.

**R-STK-05 [V2]** Un recuento físico no reemplaza el saldo: genera un movimiento
de ajuste por la diferencia, con el saldo del sistema y el contado guardados. Si
se sobrescribiera el saldo se perdería la evidencia del faltante.

**R-STK-06 [V2]** La merma es un tipo de movimiento propio y no se mezcla con el
ajuste. Roto, vencido y robado son cosas distintas de "contamos mal".

**R-STK-07 [V2]** Un movimiento de stock, una vez registrado, es inmutable. Se
corrige con otro movimiento.

**R-STK-08 [V2]** El movimiento guarda el costo unitario del momento, para poder
valorizar el inventario histórico.

---

## 8. Compras y costos (CMP)

**R-CMP-01 [V2]** Una compra genera movimientos de stock positivos y actualiza el
costo del producto por **promedio ponderado**:
`costo_nuevo = (stock_actual × costo_actual + cantidad × costo_compra) / (stock_actual + cantidad)`.

**R-CMP-02 [V2]** Si el stock actual es cero o negativo, el costo nuevo es
directamente el costo de la compra. El promedio ponderado con denominador raro no
significa nada.

**R-CMP-03 [V2]** El costo se actualiza hacia adelante. Ninguna compra recalcula
el costo de ventas ya registradas, que conservan su snapshot.

**R-CMP-04 [V2]** El costo de compra se carga sin IVA si el comercio es
responsable inscripto (el IVA es crédito fiscal, no costo) y con IVA si es
monotributista (no lo puede computar). La condición del comercio determina cuál
de los dos se pide.

**R-CMP-05 [V2]** El margen se calcula sobre el neto, no sobre el precio con IVA.
`margen = (precio_neto − costo) / precio_neto`.

---

## 9. Precios (PRE)

**R-PRE-01 [V2]** Una actualización masiva de precios por porcentaje muestra vista
previa antes de aplicar y se puede deshacer entera. Un aumento mal tipeado sobre
todo el catálogo, sin deshacer, deja al comercio sin poder vender.

**R-PRE-02 [V2]** La actualización masiva guarda el precio anterior de cada
producto. Sin eso el "deshacer" es una promesa vacía.

**R-PRE-03 [V2]** El redondeo comercial (terminar en 00 o 50) se aplica después
del porcentaje y es opcional por operación.

**R-PRE-04 [V2]** Existe historial de precios por producto, con la fecha desde la
que rige cada uno.

**R-PRE-05 [V2]** Un producto puede tener precio promocional con vigencia por
fecha. Al vender se toma el vigente; la línea guarda cuál se aplicó.

---

## 10. Clientes y cuenta corriente (CLI)

**R-CLI-01 [V3]** El saldo de un cliente es la suma de sus movimientos de cuenta
corriente. Nunca un campo mutable, por el mismo motivo que el stock.

**R-CLI-02 [V3]** Una venta a cuenta corriente genera un cargo por el total; un
pago del cliente genera un crédito. Ninguno de los dos modifica la venta.

**R-CLI-03 [V3]** El límite de crédito **avisa, no bloquea** por defecto. El
comerciante conoce a su cliente mejor que el sistema. Que bloquee tiene que ser
una opción explícita, no el comportamiento base.

**R-CLI-04 [V3]** Un pago se imputa contra el saldo, no contra una venta
específica, salvo que el comerciante lo asigne a mano. En un fiado de barrio nadie
paga facturas puntuales.

**R-CLI-05 [V3]** Un cliente no se borra si tiene saldo distinto de cero o
movimientos.

---

## 11. Facturación ARCA (FIS)

Todo esto es **V3**. Está escrito ahora porque hay decisiones de V1 que, tomadas
sin ver esto, obligan a migrar ventas históricas.

Nivel desarrollo: qué tiene que hacer el sistema. La normativa concreta (montos,
plazos, resoluciones) se define con un contador cuando llegue el momento y va en
configuración, nunca en el código.

### Facturar es opcional

**R-FIS-01 [V1]** El registro de ventas y la facturación son dos sistemas
acoplados, no uno. La venta existe, se cobra, entra a la caja y se reporta,
exista o no un comprobante fiscal.

**R-FIS-02 [V1]** Toda venta se registra internamente, siempre. Esto no tiene
nada que ver con ARCA: sin registro completo no hay arqueo, ni stock, ni resumen.

**R-FIS-03** Facturar es un acto separado y explícito, por venta. Puede ocurrir en
el momento, más tarde, o nunca. El sistema no factura solo salvo que esté
configurado así.

**R-FIS-04** El modo por defecto es a pedido del cliente. En un kiosco la mayoría
de las operaciones no lleva factura, y un sistema que interrumpe cada cobro para
preguntar se desinstala.

**R-FIS-05** Una venta puede producir dos comprobantes distintos y nunca se
confunden: el **interno**, que el sistema numera siempre y no tiene validez
fiscal, y el **fiscal**, que lleva código de autorización de ARCA y es opcional.
El interno existe aunque no haya factura nunca.

**R-FIS-06** Al cliente que no pidió factura se le entrega el comprobante
interno, con la leyenda de que no es válido como factura. "Sin ARCA" no significa
"sin nada en la mano".

**R-FIS-07** En el cobro hay dos acciones y las dos son de una tecla: **cobrar**
y **cobrar y facturar**. La primera es el default. Elegir la segunda es lo único
que dispara el pedido de autorización.

**R-FIS-08** El módulo fiscal se habilita a nivel instalación. En el plan sin
nube no existe y la segunda acción directamente no aparece. Que facturar sea
opcional por venta es una capa distinta de que el módulo esté instalado o no.

### Cuándo se pide la autorización

**R-FIS-09** ARCA contesta en la misma llamada: se le manda el comprobante y
devuelve el código de autorización, típicamente en uno o dos segundos. No existe
un proceso que sincronice por su cuenta. Lo único que el sistema decide es
**cuándo** hace esa llamada, y son tres momentos sobre un mismo mecanismo:

| Momento | Se llama | Para qué |
|---|---|---|
| Al instante, en segundo plano | apenas se cierra la venta | el cliente pidió factura y la está esperando |
| Diferido | al cerrar el turno | consolidar lo del día en un comprobante |
| En lote, a mano | cuando el comerciante aprieta el botón | ponerse al día después de una caída |

**R-FIS-10** Los tres momentos son la misma cola procesada con distinta política,
no tres implementaciones. Toda venta a facturar entra a la cola; lo que cambia es
si se drena sola al instante o cuando alguien lo pide. Un solo camino de código,
y el de contingencia es el mismo que el normal.

### Venta y comprobante

**R-FIS-11** Una venta tiene cero o un comprobante. Un comprobante puede cubrir
**varias ventas**: es lo que habilita consolidar el día en uno solo.

**R-FIS-12** La relación va en una **tabla de vínculo**, no en un campo
`comprobante_id` dentro de `venta`. Un campo suelto no soporta el consolidado y
obliga a migrar después.

**R-FIS-13** Una venta ya incluida en un comprobante no puede entrar en otro.

**R-FIS-14** El total del comprobante es exactamente la suma de las ventas que
cubre.

**R-FIS-15** Las líneas del comprobante **no espejan** las de la venta. El
sistema soporta tres armados y el comerciante elige: detallado, consolidado por
alícuota, o una sola línea con concepto genérico configurable.

**R-FIS-16** El desglose por alícuota sí tiene que reflejar lo vendido. Si hubo
mercadería al 21% y al 10,5%, el consolidado necesita los dos grupos aunque la
descripción sea genérica. En Factura C no hay desglose, así que para un
monotributista una sola línea es siempre correcta.

### Cálculo

**R-FIS-20** El neto y el IVA se calculan **agrupando las líneas por alícuota**,
nunca línea por línea: `neto_grupo = redondear(bruto_grupo / (1 + alícuota))`,
`iva_grupo = bruto_grupo − neto_grupo`. Sumar netos calculados uno por uno
produce diferencias de centavos contra el total, y es el rechazo más común.

**R-FIS-21** En Factura C el neto es igual al total y el IVA es cero. No se manda
detalle de alícuotas.

**R-FIS-22** El tipo de comprobante lo deriva el sistema del cruce entre la
condición de IVA del comercio y la del cliente. No lo elige el cajero.

| Comercio | Cliente | Sale |
|---|---|---|
| Responsable inscripto | Responsable inscripto | Factura A |
| Responsable inscripto | Monotributista | Factura A |
| Responsable inscripto | Consumidor final, exento o no alcanzado | Factura B |
| Monotributista | Cualquiera | Factura C |
| Exento | Cualquiera | Factura C |

En un kiosco la abrumadora mayoría de las operaciones cae en la fila del
consumidor final. El caso A aparece cuando el que compra es otro comerciante.

**R-FIS-23** El cliente arranca siempre en consumidor final sin identificar. El
cajero no elige nada salvo que el cliente pida factura a nombre de alguien.

**R-FIS-24** Por debajo de un monto se puede emitir sin identificar al cliente;
por encima hay que pedir apellido, nombre y documento. Ese monto lo fija ARCA y
se actualiza varias veces al año: va en configuración, y la pantalla de cobro
tiene que poder pedir el documento cuando se supera, sin actualizar la
aplicación.

**R-FIS-25** El tipo de documento del cliente forma parte del comprobante: CUIT,
CUIL, DNI, o sin identificar para el consumidor final por debajo del monto.

### Numeración y autorización

**R-FIS-30** La numeración interna del ticket y la fiscal son campos distintos y
nunca se mezclan. La interna existe siempre; la fiscal solo si se autoriza.

**R-FIS-31** El número fiscal se asigna **al solicitar la autorización**, no al
registrar la venta. Asignarlo antes genera huecos cada vez que un pedido falla, y
la numeración fiscal no admite huecos.

**R-FIS-32** Después de cualquier caída hay que consultar a ARCA el último número
autorizado y continuar desde ahí. Es la única forma de recuperarse de una caída
entre el envío y la persistencia de la respuesta: el comprobante puede haber
quedado autorizado del otro lado y no del nuestro.

**R-FIS-33** Un comprobante autorizado es inmutable: código de autorización,
vencimiento, tipo, punto de venta y número se escriben una sola vez.

**R-FIS-34** Un comprobante rechazado no se reintenta en loop. Se marca, se
guarda el error tal cual vino, y se escala a intervención manual.

**R-FIS-35** Una autorización puede venir con observaciones. Se guardan junto con
el código; ignorarlas hace que el problema aparezca después.

### Nunca bloquear el mostrador

**R-FIS-40** **ARCA nunca bloquea una venta.** Se registra completa y cobrada en
la base local, y la autorización va a una cola. Esta regla manda sobre todas las
demás de esta sección.

**R-FIS-41** El cajero nunca espera la autorización. El único caso que interrumpe
el cobro es la Factura A, que necesita el CUIT antes de que el cliente se vaya.

**R-FIS-42** Si la autorización falla, se entera el comerciante en su pantalla de
pendientes, no el cajero en medio de una venta.

**R-FIS-43** El arqueo de caja no depende de la facturación: la plata es la misma
esté facturada o no. Se puede cerrar el turno con ventas pendientes de facturar.

**R-FIS-44** Existe un mecanismo de autorización anticipada para operar sin
conexión. El código se pide por adelantado y se usa offline. Consecuencia
arquitectónica: **ese código vive en la caja, no en el servidor**, porque la
contingencia es justamente que la caja no llega al servidor. La API lo empuja a
cada instalación por anticipado. Contradice la idea de que todo lo fiscal vive en
el servidor y hay que diseñarlo a propósito.

**R-FIS-45** Las credenciales de ARCA viven solo en el servidor. La caja habla con
la API y la API habla con ARCA, con la excepción de R-FIS-44.

**R-FIS-46** Hay dos ambientes, prueba y producción, con numeración
independiente. El ambiente es configuración, nunca una constante compilada.

### Anulación

**R-FIS-50** Venta sin comprobante: la anulación interna (R-ANU-01) alcanza y no
genera nada ante ARCA. Es el caso más común, porque el error se detecta en el
mostrador.

**R-FIS-51** Venta con comprobante autorizado: además hace falta una nota de
crédito, que consume su propia numeración. La anulación interna no espera a que
salga.

**R-FIS-52** Consecuencia: una venta puede estar anulada internamente con la nota
de crédito pendiente. Son dos estados independientes y el modelo tiene que poder
representarlos por separado.

**R-FIS-53** Anular una venta que quedó dentro de un consolidado obliga a tocar un
comprobante que cubre otras. Conviene consolidar al cierre del día y no antes:
cuanto más tarde, menos ventas quedan atrapadas.

### Reportes

**R-FIS-60** Hay tres números y los tres se muestran: vendido, facturado y
pendiente de facturar. Colapsarlos hace que el comerciante no entienda su
situación.

**R-FIS-61** Vendido se reporta por día comercial (R-GEN-06); facturado, por
período fiscal. Son dos relojes distintos y no se colapsan.

### Qué toca V1

**R-FIS-70 [V1]** La venta guarda los campos fiscales desde V1 —tipo de
comprobante, punto de venta, número, código de autorización, vencimiento y el
snapshot de condición de IVA del comercio y del cliente—, nullable y sin uso.
Agregarlos después obliga a migrar ventas históricas a las que ya no se les
pueden reconstruir los datos.

**R-FIS-71 [V1]** El precio se persiste con IVA incluido y con la alícuota por
línea. El neto no se persiste nunca: se deriva agrupando (R-FIS-20).

**R-FIS-72 [V1]** La importación de catálogo acepta una columna de alícuota
aunque la UI de alta no muestre el campo. Un catálogo cargado entero en 21%
cuando tenía productos al 10,5% no se corrige hacia atrás.

**R-FIS-73** El estado fiscal de una venta es independiente de su estado interno
(R-FIS-52) y se representa por separado.

## 12. Usuarios y autorización (USR)

**R-USR-01 [V1]** El PIN identifica, no autentica con fuerza. Cuatro dígitos es
débil a propósito: el modelo de amenaza es el compañero de turno, no un atacante
remoto. Aun así se guarda hasheado, porque la base es un archivo que se copia.

**R-USR-02 [V1]** El usuario del comercio y la instalación son dos identidades
distintas y no se mezclan. El usuario vive solo en la base local y no tiene cuenta
en ningún servidor.

**R-USR-03 [V2]** Hay dos roles: dueño y cajero. Las acciones sensibles las puede
hacer el cajero, pero requieren autorización con el PIN del dueño en el momento.
Bloquearlas por completo lleva a que el dueño le dé su PIN al cajero y se pierda
todo el control.

**R-USR-04 [V2]** Son acciones sensibles: anular una venta, editar el precio de
una línea por debajo del de lista, cerrar el turno con diferencia mayor a un
umbral, modificar precios del catálogo, ver costos y márgenes, ver reportes de
otros turnos.

**R-USR-05 [V2]** Toda autorización de una acción sensible queda registrada: qué
acción, sobre qué, quién la pidió, quién la autorizó, cuándo. Sin ese registro la
autorización no sirve de nada.

**R-USR-06 [V1]** Un usuario no se borra: se desactiva. Sus operaciones históricas
lo siguen referenciando.

---

## 13. Sincronización (SYN)

**R-SYN-01 [V3]** La UI nunca espera al sync. Toda operación se completa contra la
base local y devuelve al cajero antes de que exista cualquier intento de red.

**R-SYN-02 [V3]** La operación de negocio y su fila en la cola de salida se
insertan en la misma transacción. Si no, se pierden operaciones sin que nadie se
entere.

**R-SYN-03 [V3]** El servidor recibe el UUID generado por el cliente y descarta
duplicados devolviendo el resultado de la primera recepción.

**R-SYN-04 [V3]** Las ventas no tienen conflicto posible: son inmutables y su UUID
lo genera el cliente. El catálogo sí puede tener conflicto, y se resuelve por
fecha de actualización más reciente.

**R-SYN-05 [V3]** El sync nunca borra ni modifica una venta local. En el peor
caso, marca una discrepancia para revisar.

**R-SYN-06 [V3]** El reloj del cliente puede estar mal. El servidor registra su
propia fecha de recepción además de la fecha del cliente, y los reportes
consolidados usan la del servidor.

**R-SYN-07 [V3]** La cola de salida se procesa en orden y respeta dependencias:
un producto se sincroniza antes que la venta que lo referencia.

---

## 14. Robustez (ROB)

**R-ROB-01 [V1]** La aplicación arranca y opera sin conexión a internet, siempre,
en cualquier fase del producto.

**R-ROB-02 [V1]** Un error en una operación no tumba la aplicación. El cajero ve
un mensaje que dice qué hacer y sigue vendiendo.

**R-ROB-03 [V1]** Los mensajes de error dicen qué hacer, no qué falló
técnicamente. "No se pudo guardar la venta, volvé a cobrarla" sirve;
"SQLITE_CONSTRAINT: UNIQUE failed" no.

**R-ROB-04 [V1]** Los datos sobreviven a un corte de energía. Lo que estaba
confirmado sigue estando; lo que estaba a medio armar en pantalla se pierde y no
deja rastro inconsistente.

**R-ROB-05 [V1]** Las migraciones se aplican una sola vez, en orden, de forma
atómica, y una migración ya aplicada en una instalación real jamás se modifica.

**R-ROB-06 [V1]** Antes de aplicar una migración que cambia estructura, se hace
una copia de la base. Es la única red de contención de un producto instalado en
una PC a la que no se puede acceder.

**R-ROB-07 [V1]** Si la base está corrupta o no se puede abrir, la aplicación
igual arranca en un modo mínimo que permite restaurar un backup. Una app que no
abre deja al comercio sin poder vender y sin poder pedir ayuda.

**R-ROB-08 [V1]** El respaldo produce un archivo consistente sin cerrar la
aplicación. La restauración exige confirmación explícita y reinicio, y guarda la
base reemplazada antes de pisarla.

---

## 15. Reportes (REP)

**R-REP-01 [V1]** El total vendido es neto de anulaciones.

**R-REP-02 [V1]** La cantidad de tickets cuenta ventas efectivas: no cuenta las
anulaciones ni las ventas anuladas.

**R-REP-03 [V1]** `ticket_promedio = total_vendido / cantidad_de_tickets`, con
cero tickets devolviendo cero y no un error de división.

**R-REP-04 [V1]** Los reportes por día usan el día comercial (R-GEN-06), no la
medianoche.

**R-REP-05 [V1]** Todo reporte se calcula contra la base, nunca sobre datos que la
UI tenga en memoria.

**R-REP-06 [V1]** Un reporte de un período cerrado da siempre el mismo resultado.
Si cambia al volver a consultarlo, hay un bug de fondo.

---

## 16. Decisiones abiertas

Las que abren estas reglas. Las de construcción están en `PLAN.md` §7.

**D19 — Hora de corte del día comercial. (bloqueante: corte 6)**
R-GEN-06 define el día comercial con hora de corte configurable. ¿Cuál es el
default? Propongo 06:00 local. La pregunta que lo define: ¿el comercio piloto
cierra pasada la medianoche?

**D20 — Acumulación de líneas repetidas. (bloqueante: corte 2)**
Escanear dos veces el mismo producto: ¿suma cantidad en la línea existente
(R-VTA-07) o abre una línea nueva? Acumular deja el ticket más corto; líneas
separadas hacen más fácil borrar la última lectura equivocada. Propongo acumular,
y que `Supr` sobre una línea acumulada baje de a uno.

**D21 — Edición de precio de línea en V1. (bloqueante: corte 2)**
Está en el alcance de V1 y es la puerta de la fuga que describe R-VTA-06.
¿Se deja sin control guardando el precio de lista para auditar después, se
permite solo subir el precio, o se posterga a V2, donde ya existe la autorización
con PIN del dueño (R-USR-03)? Propongo dejarla, guardando el precio de lista: en
V1 el dueño es el único usuario y la va a necesitar todos los días.

**D22 — Devolución del dinero al anular. (bloqueante: corte 4)**
R-ANU-06 exige devolver por los mismos medios de la venta original. ¿Se acepta
esa rigidez, o el cajero puede devolver todo en efectivo? Lo segundo descuadra el
arqueo y el resumen por medio, pero es lo que pasa cuando la venta fue con
tarjeta y el cliente vuelve a los diez minutos. Si se permite, hay que definir
cómo se registra la diferencia.

**D23 — Arrastre del fondo inicial.**
R-CAJ-13: ¿el turno nuevo propone como fondo inicial el contado del cierre
anterior menos el retiro, o se tipea siempre a mano?

**D24 — Umbral de diferencia que exige autorización. (V2)**
R-USR-04 menciona "diferencia mayor a un umbral". ¿Qué umbral, y en pesos o en
porcentaje del total vendido del turno?

**D25 — Condición de IVA del comercio piloto.**
¿Monotributista o responsable inscripto? Es la pregunta más barata y la que más
define: cambia el tipo de comprobante (R-FIS-22), si el consolidado puede ir en
una sola línea (R-FIS-15) y cómo se carga el costo en las compras (R-CMP-04). No
bloquea V1.

**D26 — Forma de armar las líneas del comprobante. (V3)**
R-FIS-14: ¿detallado, consolidado por alícuota, o una sola línea? Si el piloto es
monotributista, una sola línea y listo.

**D27 — Qué se imprime mientras la autorización está pendiente. (V3)**
El cliente ya se fue con algo en la mano. ¿Un comprobante interno marcado como no
fiscal, o no se imprime nada hasta tener la autorización? Propongo lo primero.

**D28 — Alcance de la contingencia offline. (V3)**
R-FIS-44 es bastante más trabajo que solo pedir autorización en línea. ¿Entra en
el primer V3, o el primer V3 sale con contingencia manual? Salir sin eso es
defendible para un piloto, pero el día que se corta internet el comercio no puede
facturar.

**D29 — Anulación de una venta ya consolidada. (V3)**
R-FIS-53: ¿nota de crédito parcial, o se bloquea la anulación de ventas ya
consolidadas? La primera es correcta, la segunda es mucho más simple.
