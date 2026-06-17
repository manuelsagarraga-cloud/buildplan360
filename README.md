# BuildPlan360

**Gestión de proyectos de construcción** — SPA con Gantt, libro de obra, dashboards y multi-tenancy.

🔗 **Producción**: [manuelsagarraga-cloud.github.io/buildplan360](https://manuelsagarraga-cloud.github.io/buildplan360/)

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React (Vite) — bundle pre-compilado |
| Backend | Supabase (PostgreSQL + Auth + Storage + RLS) |
| Deploy | GitHub Pages (automático via GitHub Actions) |
| Reportes | Power BI via conexión directa a PostgreSQL |

## Deploy

Cada push a `main` despliega automáticamente a GitHub Pages via el workflow `.github/workflows/deploy.yml`.

### Setup inicial (ya hecho)

1. Settings → Pages → Source: **GitHub Actions**
2. Pushear a `main` → el workflow se activa solo

## Estructura

```
index.html                  ← Entry point
404.html                    ← SPA fallback (copia de index.html)
.nojekyll                   ← Evita procesamiento Jekyll
.github/workflows/deploy.yml ← Deploy automático
assets/
  index-DjIPflYO.js         ← Bundle principal (React + Supabase)
  index-C7rficSu.css        ← Estilos principales
  patch-v488167.js          ← Edición inline, duración, UX Gantt
  patch-v488167.css         ← Estilos del patch
  dashboard-v488167.js      ← Dashboard por proyecto
  resumen-v511494.js        ← Resumen del proyecto
  tools-v511809.js          ← Importar/exportar XML, Gantt tools
  admin-v511042.js          ← Panel admin (super_admin)
  papelera-v1.js            ← Papelera de proyectos + restauración
  calendario-v1.js          ← Calendario feriados + editores inline
  fotos-v1.js               ← Compresión de imágenes
  tableros-v1.js            ← Tablero global de empresa
fonts/
  Gilroy-*.ttf              ← Tipografía Gilroy
```

## Arquitectura de patches

El bundle principal es una compilación de Vite sin acceso al código fuente. Los cambios se hacen via:

1. **Edición directa del bundle** — reemplazos exactos de strings en el JS minificado
2. **Scripts de patch** — archivos JS independientes que extienden funcionalidad

### Convención

- Nombre: `feature-vN.js`
- Supabase client: `window._p360sb` (cache compartido)
- UI injection: `MutationObserver` sobre `document.body`
- Agregar `<script>` en `index.html` **y** en `404.html`

## Base de datos (Supabase)

**Proyecto**: `qpqoqrroplkyyelkqnxo`

| Tabla | Descripción |
|-------|-------------|
| `companies` | Empresas / tenants |
| `members` | Usuarios por empresa |
| `projects` | Proyectos de obra |
| `tasks` | Tareas (`duration_mode`: hábiles / corridos) |
| `task_dependencies` | Predecesoras / sucesoras |
| `project_log_entries` | Libro de obra |
| `project_baselines` | Líneas base |
| `company_holidays` | Feriados por empresa |
| `deleted_projects` | Papelera con snapshot completo |

## Funcionalidades

- ✅ Gantt con edición inline (doble click)
- ✅ Importación XML de MS Project
- ✅ Líneas base (manuales + importadas)
- ✅ Días hábiles vs corridos + calendario de feriados
- ✅ Papelera con restauración completa
- ✅ Libro de obra con compresión de fotos
- ✅ Tablero global (KPIs, avance, vencidas, hitos, carga)
- ✅ Multi-tenancy con RLS

---

*Desarrollado para Bauvek · 2026*
