name: Bug report / Reporte de error
description: Report a problem with GitFacil
body:
  - type: textarea
    id: what
    attributes:
      label: What happened? / ¿Qué pasó?
      placeholder: Commit & push fails with...
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: Plugin version / Versión del plugin
      placeholder: 1.3.1
    validations:
      required: true
  - type: input
    id: obsidian
    attributes:
      label: Obsidian version + OS
      placeholder: 1.13.x + Linux Mint
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Error notice / Aviso de error
      placeholder: Paste the ❌ notice text here
