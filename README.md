# GitFacil - Plugin para Obsidian

**GitFacil** es un plugin ultraliviano y sencillo para Obsidian que te permite respaldar y sincronizar tus notas con Git en un solo clic, sin complicaciones ni configuraciones complejas.

---

## 📋 Requisitos Previos

Para utilizar este plugin en tu equipo de escritorio (Windows, macOS o Linux), asegúrate de cumplir con los siguientes requisitos:

1. **Tener Git instalado:** Si aún no lo tienes, descárgalo e instálalo desde [git-scm.com](https://git-scm.com).
2. **Inicializar tu bóveda como repositorio Git:** Abre la terminal en la carpeta raíz de tu bóveda y ejecuta:
   ```bash
   git init
   ```
3. **Configurar un repositorio remoto (remote):** Vincula tu repositorio local a GitHub (o GitLab/Bitbucket):
   ```bash
   git remote add origin https://github.com/TU_USUARIO/TU_REPOSITTORIO.git
   ```

---

## 🚀 Instalación

### Método 1: Con BRAT (Recomendado)

1. Instala el plugin **Obsidian BRAT** desde la comunidad de plugins.
2. Abre los ajustes de BRAT y selecciona **"Add Beta plugin"**.
3. Ingresa la URL del repositorio:
   `https://github.com/Alecwce/obsidian-git-facil`
4. Haz clic en **Add Plugin** y activa **GitFacil** en la lista de plugins instalados.

### Método 2: Instalación Manual

1. Ve a la sección de [Releases](https://github.com/Alecwce/obsidian-git-facil/releases) y descarga `main.js`, `manifest.json` y `styles.css`.
2. Crea la carpeta del plugin en tu bóveda:
   `TU_BOVEDA/.obsidian/plugins/git-facil/`
3. Coloca los tres archivos descargados dentro de esa carpeta.
4. Reinicia Obsidian o recarga los plugins y activa **GitFacil**.

---

## 💡 Modo de Uso

- **Icono en la barra lateral:** Haz clic en el icono 🚀 situado en la barra lateral izquierda para ejecutar la sincronización.
- **Paleta de comandos:** Presiona `Ctrl + P` (o `Cmd + P` en macOS) y busca el comando:
  `GitFacil: Commit y Push`
- **Sincronización Automática (Auto-sync):** Activa el Auto-sync desde los ajustes del plugin para que tus notas se respalden automáticamente cada N minutos.

---

## ⚙️ Ajustes

Accede a `Ajustes` -> `GitFacil`:

- **Plantilla del mensaje de commit:** Personaliza el mensaje de commit. Utiliza la etiqueta `{fecha}` para insertar automáticamente la fecha y hora actual (Ejemplo: `📝 notas {fecha}`).
- **Auto-sync:** Activa o desactiva la sincronización periódica automática.
- **Intervalo de Auto-sync:** Define cada cuántos minutos se ejecutará el respaldo automático.

---

## 🛠️ Solución de Problemas

| Mensaje de Error | Causa | Solución |
| :--- | :--- | :--- |
| `❌ No se encontró Git. Descárgalo de https://git-scm.com` | Git no está instalado o no se encuentra en el PATH. | Instala Git desde [git-scm.com](https://git-scm.com) y reinicia Obsidian. |
| `❌ Tu bóveda no es un repositorio Git.` | La carpeta de la bóveda no tiene un repositorio inicializado. | Abre la terminal en tu bóveda y ejecuta `git init`. |
| `❌ No hay remote. Ejecuta: git remote add origin <URL>` | No se ha agregado un servidor remoto para subir los cambios. | Ejecuta `git remote add origin <URL>` en tu terminal. |

---

## 📜 Licencia

[MIT License](LICENSE) - Creado por Alex Lazo.
