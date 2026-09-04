// Configuración de ESLint del frontend (React 18 + TypeScript + Vite).
// Formato clásico (.eslintrc) porque este app usa ESLint 8 y el script
// "lint" pasa --ext, que no existe en el formato plano del api-rest.
// Base: la plantilla oficial de Vite react-ts, que es de donde vienen
// las dependencias @typescript-eslint / react-hooks / react-refresh.
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'vite.config.d.ts'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // Igual que en api-rest: el `any` es deuda medida (inventario 25-08),
    // no se persigue con lint mientras no haya decisión de pagarla.
    '@typescript-eslint/no-explicit-any': 'off',
  },
};
