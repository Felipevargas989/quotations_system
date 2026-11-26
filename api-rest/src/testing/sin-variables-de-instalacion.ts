// LAS PRUEBAS NO DEPENDEN DE LA INSTALACIÓN DE QUIEN LAS CORRE (Licita,
// 25-11). Jest corre esto antes de cada archivo de prueba (`setupFiles`):
// borra las variables que eligen la instalación, así las pruebas de siempre
// ven Eventia con el rubro de eventos aunque la terminal tenga puesto
// INSTALACION=licita u OPORTUNIDADES_RUBRO=general. Las pruebas de esos
// modos ponen la variable ellas mismas.
delete process.env.INSTALACION;
delete process.env.OPORTUNIDADES_RUBRO;
