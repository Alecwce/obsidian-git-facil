# Git Fácil - Obsidian Plugin

Plugin para Obsidian que simplifica la integración y gestión de comandos Git de manera rápida y directa.

## Características

- Integración nativa para la gestión de Git en escritorio.
- Comandos sencillos para consultar el estado del repositorio.
- Configuración liviana y optimizada.

## Desarrollo

- **Instalar dependencias:** `pnpm install`
- **Modo desarrollo:** `pnpm run dev`
- **Compilar para producción:** `pnpm run build`
- **Verificar formateo y linter:** `pnpm run lint`
- **Ejecutar pruebas:** `pnpm run test`
- **Desplegar plugin en la bóveda:** `pnpm run deploy`

## Despliegue

El comando `pnpm run deploy` compila los archivos principales y los copia automáticamente a la carpeta de plugins de Obsidian:
```bash
pnpm run build && pnpm run deploy
```
Esto copiará `main.js`, `manifest.json` y `styles.css` a la ruta configurada en `scripts/deploy.mjs`.

## Licencia

MIT

