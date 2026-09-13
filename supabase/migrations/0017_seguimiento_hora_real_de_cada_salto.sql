-- `now()` devuelve la hora en que EMPEZÓ la transacción, no la del momento. En
-- una bitácora eso significa que dos saltos guardados en la misma petición
-- quedarían a la misma hora exacta, y ahí se pierde el orden real de lo que
-- pasó. `clock_timestamp()` da la hora de verdad de cada uno.
--
-- Aplicada al proyecto real (dkiiknsfbefpkrnmbzid) vía MCP como
-- `20260913020437_seguimiento_hora_real_de_cada_salto`.
alter table cuadre.envio_estados
  alter column cuando set default clock_timestamp();

comment on column cuadre.envio_estados.cuando is
  'Hora real del salto (clock_timestamp), no la del inicio de la transacción: dos saltos seguidos tienen que poder distinguirse.';
