# GrantFinder

## 🎯 Descripción

GrantFinder es una aplicación web moderna que te ayuda a encontrar subvenciones públicas en España adaptadas a tu perfil. Con filtros intuitivos y una interfaz visual atractiva, puedes buscar oportunidades de financiación de forma rápida y eficiente.

## ✨ Características

- **Filtros avanzados**: Busca por tipo de solicitante, sector, región e importe mínimo
- **Interfaz moderna**: Diseño responsivo con gradientes y efectos visuales
- **Base de datos de subvenciones**: Acceso a múltiples oportunidades de financiación
- **Búsqueda instantánea**: Resultados en tiempo real según tus criterios
- **100% funcional**: Completamente desarrollado en HTML, CSS y JavaScript vanilla

## 🚀 Cómo usar

1. Ve a [GrantFinder en tu navegador](https://justifika.github.io/GrantFinder/)
2. Utiliza los filtros en el panel izquierdo para especificar tus criterios
3. Haz clic en "🔍 Buscar subvenciones" o presiona Enter
4. Explora los resultados y revisa los detalles de cada subvención

## 🔍 Filtros disponibles

- **Tipo de solicitante**: PYME, Startup, Autónomo, Empresa, ONG
- **Sector**: Tecnología, Energía, Agricultura, Turismo, Cultura
- **Región**: Madrid, Barcelona, Valencia, Bilbao, Sevilla
- **Importe mínimo**: Filtra por cantidad mínima en euros

## 📊 Ejemplo de uso

```
Buscas: Startup + Tecnología + Barcelona + 80,000€
Resultado: Encontrará todas las subvenciones que cumplan con estos criterios
```

## 🛠️ Tecnología

- **HTML5**: Estructura semántica moderna
- **CSS3**: Diseño responsivo con gradientes y animaciones
- **JavaScript**: Lógica de filtrado sin dependencias externas

## 🧾 OCR de facturas → Excel

Herramienta incluida en [`facturas/`](facturas/) y publicada en `https://justifika.github.io/GrantFinder/facturas/`.

1. Elige el motor de extracción:
   - **Local (Tesseract OCR)**: gratis y privado, todo se procesa en el navegador. Los PDF con texto se leen directamente; los escaneados y las imágenes pasan por OCR. Extrae cabecera y totales con reglas (NIF/CIF validados, fechas, base, IVA, IRPF, total, IBAN).
   - **Claude (IA)**: más preciso y con líneas de detalle. Requiere una API key de Anthropic (se usa desde el navegador contra `api.anthropic.com`).
2. Arrastra las facturas (PDF, JPG, PNG o WEBP; varias a la vez) y pulsa **Extraer datos**.
3. Revisa y corrige cualquier celda en la tabla (las filas con avisos, p. ej. totales que no cuadran, merecen revisión).
4. Pulsa **Descargar Excel**: genera un `.xlsx` con la hoja *Facturas* (con fila de totales) y, en modo Claude, la hoja *Líneas*.

Pruebas del extractor: `node facturas/parser.test.mjs`

## 🌐 Publicación en GitHub Pages

El sitio está publicado automáticamente en: `https://justifika.github.io/GrantFinder/`

## 📝 Notas

- Los datos mostrados son de ejemplo para demostración
- La aplicación es completamente funcional y responsiva
- Compatible con navegadores modernos (Chrome, Firefox, Safari, Edge)

---

**Desarrollado con ❤️ por Justifika**