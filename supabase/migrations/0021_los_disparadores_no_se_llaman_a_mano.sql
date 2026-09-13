-- Los disparadores no se llaman a mano
--
-- Sale del linter de seguridad de Supabase, pasado después de cerrar el
-- seguimiento: siete funciones de disparador estaban concedidas a `anon` y a
-- `authenticated`, que es el rol con el que entra cualquiera desde las dos
-- webs, y una guardaba las tasas sin `search_path` fijo.
--
-- Ninguna de las dos cosas era explotable hoy: llamar a mano una función que
-- devuelve `trigger` acaba en error, y la de las tasas no lee ninguna tabla,
-- solo `current_setting`, que vive en pg_catalog y no se puede suplantar.
-- Se arreglan igual. Postgres comprueba el permiso al CREAR el disparador, no
-- cada vez que salta, así que el permiso sobra; y sobrando deja dos avisos
-- permanentes en el informe. Un informe con ruido aceptado es un informe que
-- nadie mira, y aquí se mueve dinero de terceros: cuando salte un aviso de
-- verdad tiene que verse solo.
--
-- Comprobado antes y después, en transacciones que se deshicieron enteras:
-- un pedido con código de referido inventado sigue saliendo con el código en
-- NULL, el alta de un cliente sigue creando su perfil, y un pedido de tienda
-- sigue naciendo con su primer salto en el flujo «tienda».

revoke execute on function cuadre.espejar_metodos_en_la_web()        from anon, authenticated, public;
revoke execute on function cuadre.marcar_pedido_recibido()           from anon, authenticated, public;
revoke execute on function cuadre.touch_updated_at()                 from anon, authenticated, public;
revoke execute on function public.crear_perfil_de_cliente()          from anon, authenticated, public;
revoke execute on function public.referido_que_no_existe_se_ignora() from anon, authenticated, public;
revoke execute on function public.solo_admin_mueve_el_nivel()        from anon, authenticated, public;
revoke execute on function public.solo_cuadre_cambia_las_tasas()     from anon, authenticated, public;

-- La que impide que la web y Cuadre tengan tasas distintas. De esa no se deja
-- nada al aire aunque hoy no se pueda torcer.
alter function public.solo_cuadre_cambia_las_tasas() set search_path = public, pg_temp;
