# Contributing / Cómo contribuir

1. Usa `mise` (node 24 + pnpm 11): `mise trust && mise install`.
2. Instala: `pnpm install --frozen-lockfile`.
3. Antes de cada PR: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
4. Tags de release sin prefijo `v`: `1.x.y`.
5. Commits estilo convencional (`feat:`, `fix:`, `chore:`).
