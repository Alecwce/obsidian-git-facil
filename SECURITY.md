# Security / Seguridad

GitFacil runs `git` locally on your vault. It performs no telemetry and
sends nothing to its own services: there is no GitFacil server.

When you press commit & push (manually or via auto-sync), Git sends the
tracked content of your vault — notes, attachments, images — to the Git
remote **you** configured (e.g. your GitHub repository). Use a **private**
repository if your notes are not meant to be public, and review what is
tracked with `git status` before the first push.

## Reporting a vulnerability / Reportar una vulnerabilidad

Please **do not** open a public issue for security problems. Use
[private vulnerability reporting](../../security/advisories/new)
(Security tab → Report a vulnerability) so details stay hidden until a
fix is released. Please do not publish exploits before a fix exists.

---

GitFacil ejecuta `git` localmente sobre tu bóveda. No realiza telemetría
ni envía nada a servicios propios: no existe ningún servidor de GitFacil.

Cuando haces commit & push (manual o auto-sync), Git envía el contenido
rastreado de tu bóveda — notas, adjuntos, imágenes — al remoto Git que
**tú** configuraste (ej. tu repositorio de GitHub). Usa un repositorio
**privado** si tus notas no deben ser públicas, y revisa con
`git status` qué se rastrea antes del primer push.

Para vulnerabilidades usa el **reporte privado** (pestaña Security →
Report a vulnerability), nunca un issue público.
