# GrantFinder

Buscador de subvenciones públicas en España para PYMEs y autónomos.

> **Estado:** prototipo. Los datos que muestra son de ejemplo (ficticios), no convocatorias reales.

## Estructura del proyecto

```
GrantFinder/
├── index.html          → Página principal (solo estructura HTML)
├── css/
│   └── estilos.css     → Diseño y colores
├── js/
│   ├── datos.js        → Listado de subvenciones (ahora, de ejemplo)
│   └── app.js          → Lógica de filtros y búsqueda
├── archivo/
│   └── index-antiguo.html  → Versión anterior, pendiente de revisar o borrar
├── .gitignore          → Archivos que Git debe ignorar
└── README.md           → Este documento
```

## Cómo verlo en tu ordenador

1. Descarga el repositorio (botón verde **Code → Download ZIP**).
2. Descomprímelo y abre `index.html` con doble clic.

No necesita instalar nada: es HTML, CSS y JavaScript sin dependencias.

## Funcionalidad actual

- Filtros por tipo de solicitante, sector, región e importe mínimo.
- Resultados con importe y fecha de cierre.

## Próximos pasos

- [ ] Sustituir `js/datos.js` por datos reales (p. ej., BDNS).
- [ ] Decidir qué hacer con `archivo/index-antiguo.html`.
- [ ] Elegir hosting para publicar la web (el repo es privado).
