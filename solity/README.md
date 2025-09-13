# Eventia - Sistema de Cotizaciones Valle del Sol Quillón

Una aplicación completa para gestionar cotizaciones y pagos de Valle del Sol Quillón, construida con React, TypeScript y Supabase.

## 🚀 Características

- **Sistema de Autenticación** - Registro e inicio de sesión seguro
- **Gestión de Cotizaciones** - Crear, editar y seguir cotizaciones
- **Estados de Seguimiento** - Solicitada, Enviada, En Negociación, Aceptada, Rechazada
- **Plan de Pagos Automático** - 12 cuotas mensuales cuando se acepta una cotización
- **Catálogo de Servicios** - 40+ servicios precargados en 4 categorías
- **Dashboard Completo** - Métricas y resúmenes visuales
- **Responsive Design** - Funciona en desktop y móvil

## 📋 Configuración Inicial

### 1. Configurar Supabase

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta gratuita
2. Crea un nuevo proyecto
3. **IMPORTANTE**: Deshabilita la confirmación de email:
   - Ve a **Authentication → Settings**
   - En la sección **User Signups**, cambia **Enable email confirmations** a **OFF**
   - Guarda los cambios
4. Ve a **Settings → API**
5. Copia tu **Project URL** y **anon public key**
6. Actualiza el archivo `.env`:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. Configurar Base de Datos

1. Una vez configurado Supabase, ve a `/setup` en la aplicación
2. Haz click en "¡Empezar Configuración!"
3. Espera a que se complete la configuración automática

### 3. Crear tu Primera Cuenta

1. Ve a `/login`
2. Haz click en "¿No tienes cuenta? Regístrate"
3. Usa cualquier email y contraseña (no necesita ser real)
4. ¡Listo para usar!

## 🛠️ Tecnologías

- **Frontend**: React 18 + TypeScript
- **Estilos**: Tailwind CSS
- **Base de Datos**: Supabase (PostgreSQL)
- **Autenticación**: Supabase Auth
- **Iconos**: Lucide React
- **Fechas**: date-fns
- **Build**: Vite

## 📊 Estructura de Datos

### Categorías de Servicios
- **Almuerzo** - Servicios principales de comida
- **Almuerzo Niño** - Servicios especiales para niños
- **Coffee&Coctel** - Bebidas y aperitivos
- **Servicios Adicionales** - Salones, decoración, etc.

### Estados de Cotización
- 📋 **Solicitada** - Estado inicial
- 📤 **Enviada** - Enviada al cliente
- 💬 **En Negociación** - En proceso de negociación
- ✅ **Aceptada** - Aprobada (genera plan de pagos)
- ❌ **Rechazada** - No aprobada

## 🔧 Comandos de Desarrollo

```bash
# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev

# Construir para producción
npm run build

# Vista previa de producción
npm run preview
```

## 📱 Uso de la Aplicación

### Crear una Cotización
1. Ve a **Cotizaciones → Crear Cotización**
2. Ingresa el nombre del cliente
3. Selecciona categorías y servicios
4. Ajusta cantidades según necesites
5. Revisa el total y guarda

### Gestionar Pagos
1. Cuando una cotización es **Aceptada**, se crea automáticamente un plan de 12 pagos
2. Ve a **Pagos** para ver todas las cuotas
3. Marca pagos como "Pagado" cuando se reciban
4. Filtra por estado: Pendientes, Pagados, Vencidos

### Dashboard
- Métricas generales del negocio
- Resumen de cotizaciones y ventas
- Estados de seguimiento

## 🔒 Seguridad

- **Row Level Security (RLS)** habilitado en todas las tablas
- **Políticas de acceso** por usuario
- **Autenticación segura** con Supabase
- **Validación de datos** en frontend y backend

## 🆘 Solución de Problemas

### Error: "Invalid API key"
- Verifica que hayas copiado correctamente las credenciales de Supabase
- Asegúrate de que el archivo `.env` esté en la raíz del proyecto

### Error: "Supabase request failed"
- Revisa que tu proyecto de Supabase esté activo
- Verifica la URL del proyecto

### Error: "Email not confirmed"
- Ve a **Authentication → Settings** en tu proyecto de Supabase
- Cambia **Enable email confirmations** a **OFF**
- Guarda los cambios y vuelve a intentar

### La aplicación no carga
- Ejecuta `npm install` para instalar dependencias
- Verifica que el puerto 5173 esté disponible

## 📞 Soporte

Si tienes problemas:
1. Revisa que Supabase esté configurado correctamente
2. Verifica que las migraciones se hayan ejecutado
3. Revisa la consola del navegador para errores específicos

---

¡Listo para crear cotizaciones profesionales! 🎉
