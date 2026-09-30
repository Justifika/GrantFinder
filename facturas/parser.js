// Extracción heurística de datos de facturas españolas a partir de texto OCR.
// Módulo puro (sin DOM) para poder probarlo en Node.

export const CAMPOS = [
  "numero", "fecha", "vencimiento", "emisor", "nif_emisor", "receptor", "nif_receptor",
  "base_imponible", "tipo_iva", "cuota_iva", "tipo_irpf", "retencion_irpf", "total",
  "moneda", "iban", "concepto",
];

const DNI_LETRAS = "TRWAGMYFPDXBNJZSQVHLCKE";

// Valida NIF (DNI), NIE y CIF con su dígito/letra de control.
export function validarNif(raw) {
  const v = String(raw || "").toUpperCase().replace(/[\s.-]/g, "");
  if (/^\d{8}[A-Z]$/.test(v)) return DNI_LETRAS[+v.slice(0, 8) % 23] === v[8];
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) {
    const n = "XYZ".indexOf(v[0]) + v.slice(1, 8);
    return DNI_LETRAS[+n % 23] === v[8];
  }
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) {
    const d = v.slice(1, 8).split("").map(Number);
    let suma = 0;
    d.forEach((x, i) => {
      if (i % 2 === 1) suma += x;
      else { const y = x * 2; suma += Math.floor(y / 10) + (y % 10); }
    });
    const control = (10 - (suma % 10)) % 10;
    return v[8] === String(control) || v[8] === "JABCDEFGHI"[control];
  }
  return false;
}

// Confusiones típicas del OCR en el carácter de control (letra leída como dígito)
const OCR_LETRAS = { 0: "DOQ", 1: "IJL", 2: "Z", 4: "A", 5: "S", 6: "G", 7: "ZT", 8: "B" };

function corregirNif(v) {
  if (validarNif(v)) return { nif: v, corregido: false };
  if (!/\d$/.test(v) || /^[ABCDEFGHJNPQRSUVW]/.test(v)) return null;
  for (const letra of OCR_LETRAS[v.at(-1)] || "") {
    const c = v.slice(0, -1) + letra;
    if (validarNif(c)) return { nif: c, corregido: true };
  }
  return null;
}

// "1.234,56" | "1,234.56" | "1234.56" | "1 234,56" -> 1234.56
export function parseImporte(s) {
  if (s == null) return null;
  let t = String(s).replace(/[€$£\s]|EUR/gi, "").replace(/[^\d.,-]/g, "");
  if (!/\d/.test(t)) return null;
  const lastComma = t.lastIndexOf(","), lastDot = t.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
  } else if (lastComma > -1) {
    t = /^-?\d{1,3}(?:,\d{3})+$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  } else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function isoFecha(d, m, y) {
  d = +d; m = +m; y = +y;
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const RE_FECHA_NUM = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})\b/;
const RE_FECHA_ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const RE_FECHA_TXT = new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${Object.keys(MESES).join("|")})\\s+(?:de\\s+|del\\s+)?(\\d{4})\\b`, "i");

export function buscarFecha(texto) {
  let m = texto.match(RE_FECHA_ISO);
  if (m) { const f = isoFecha(m[3], m[2], m[1]); if (f) return f; }
  m = texto.match(RE_FECHA_TXT);
  if (m) { const f = isoFecha(m[1], MESES[m[2].toLowerCase()], m[3]); if (f) return f; }
  m = texto.match(RE_FECHA_NUM);
  if (m) return isoFecha(m[1], m[2], m[3]);
  return null;
}

const RE_IMPORTE = /-?\d{1,3}(?:[.\s]\d{3})*,\d{2}\b|-?\d{1,3}(?:,\d{3})*\.\d{2}\b|-?\d+[.,]\d{2}\b/g;

function importesEn(linea) {
  // Se quitan porcentajes ("21,00 %") para no confundirlos con importes
  const limpia = linea.replace(/\d+(?:[.,]\d+)?\s*%/g, " ");
  return (limpia.match(RE_IMPORTE) || []).map(parseImporte).filter((n) => n != null);
}

function porcentajeEn(linea) {
  const m = linea.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
  return m ? parseImporte(m[1]) : null;
}

// Busca la línea que casa con `re` y devuelve el último importe de esa línea o de la siguiente.
function importeTrasEtiqueta(lineas, re, excluir) {
  for (let i = lineas.length - 1; i >= 0; i--) {
    const l = lineas[i];
    if (!re.test(l) || (excluir && excluir.test(l))) continue;
    let nums = importesEn(l);
    if (!nums.length && lineas[i + 1]) nums = importesEn(lineas[i + 1]);
    if (nums.length) return { valor: nums[nums.length - 1], linea: l };
  }
  return null;
}

export function extraerCampos(texto) {
  const lineas = texto.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const plano = lineas.join("\n");
  const r = Object.fromEntries(CAMPOS.map((c) => [c, null]));
  const avisos = [];

  // NIF/CIF: el primero válido suele ser el emisor y el segundo el receptor
  const candidatos = [];
  const reNif = /\b([ABCDEFGHJNPQRSUVW][\s.-]?\d{7}[0-9A-J]|\d{8}[\s-]?[A-Z0-9]|[XYZ][\s-]?\d{7}[\s-]?[A-Z0-9])\b/g;
  for (const linea of lineas) {
    // Solo se intenta corregir el OCR si la línea está etiquetada (evita confundir teléfonos con NIF)
    const etiquetada = /\b(?:n\.?i\.?f|c\.?i\.?f|dni|nie|vat)\b/i.test(linea);
    for (const m of linea.toUpperCase().matchAll(reNif)) {
      const limpio = m[1].replace(/[\s.-]/g, "");
      const v = etiquetada ? corregirNif(limpio) : validarNif(limpio) && { nif: limpio, corregido: false };
      if (v && !candidatos.includes(v.nif)) {
        candidatos.push(v.nif);
        if (v.corregido) avisos.push(`NIF ${v.nif} corregido desde "${m[1]}"`);
      }
    }
  }
  r.nif_emisor = candidatos[0] || null;
  r.nif_receptor = candidatos[1] || null;
  if (!candidatos.length) avisos.push("No se encontró NIF/CIF válido");

  // Número de factura (el OCR suele leer "Nº" como N", N°, No, N*...)
  const esImporte = (v) => /^\d{1,3}(?:\.\d{3})*(?:,\d{2})?$/.test(v);
  const reNum = /(?:n\s*["º°o*.]\.?\s*(?:de\s+)?factura|factura\s*(?:n\s*["º°o*.]\.?|n[uú]m(?:ero|\.)?)|n[uú]mero\s+de\s+factura|invoice\s*(?:no\.?|number|#))\s*[:#]?\s*([A-Z0-9][A-Z0-9\/\-_.]{1,24})/i;
  let m = plano.match(reNum);
  if (!m) m = plano.match(/(?<!total\s)\bfactura\s*[:#]\s*([A-Z0-9][A-Z0-9\/\-_.]{1,24})/i);
  if (m && !esImporte(m[1])) r.numero = m[1].replace(/[.:]$/, "");

  const cliente = plano.match(/(?:cliente|receptor|destinatario|facturar\s+a)\s*:\s*([^\n]{3,60})/i);
  if (cliente) r.receptor = cliente[1].trim();

  // Fechas: se prefiere la línea con la etiqueta
  const esEtiquetaFecha = (l) => /fecha(?!\s+(?:de\s+)?venc)/i.test(l);
  let lFecha = lineas.find((l) => esEtiquetaFecha(l) && buscarFecha(l));
  if (!lFecha) {
    const i = lineas.findIndex((l, j) => esEtiquetaFecha(l) && lineas[j + 1] && buscarFecha(lineas[j + 1]));
    if (i > -1) lFecha = lineas[i + 1];
  }
  r.fecha = (lFecha && buscarFecha(lFecha)) || buscarFecha(plano);
  const lVenc = lineas.find((l) => /venc/i.test(l) && buscarFecha(l));
  if (lVenc) r.vencimiento = buscarFecha(lVenc);

  // Importes
  const base = importeTrasEtiqueta(lineas, /base\s*imponible|subtotal|base\b/i);
  if (base) r.base_imponible = base.valor;

  const iva = importeTrasEtiqueta(lineas, /\b(?:i\.?\s?v\.?\s?a\.?|vat|igic)\b/i, /incluido|n[uú]m|nif|cif/i);
  if (iva) {
    r.tipo_iva = porcentajeEn(iva.linea);
    r.cuota_iva = iva.valor;
  }

  const irpf = importeTrasEtiqueta(lineas, /irpf|retenci[oó]n/i);
  if (irpf) {
    r.tipo_irpf = porcentajeEn(irpf.linea);
    r.retencion_irpf = Math.abs(irpf.valor);
  }

  const total = importeTrasEtiqueta(lineas, /total\s*(?:factura|a\s+pagar|importe)|importe\s+total|\btotal\b/i, /sub\s*total|total\s+(?:base|iva|bruto)/i);
  if (total) r.total = total.valor;

  // Si hay base y tipo pero no cuota (o viceversa), se completa
  if (r.base_imponible != null && r.tipo_iva != null && r.cuota_iva != null
      && r.cuota_iva === r.base_imponible) r.cuota_iva = null;
  if (r.base_imponible != null && r.tipo_iva != null && r.cuota_iva == null) {
    r.cuota_iva = Math.round(r.base_imponible * r.tipo_iva) / 100;
  }

  // Cuadre: base + IVA - IRPF = total
  if (r.base_imponible != null && r.total != null) {
    const calc = r.base_imponible + (r.cuota_iva || 0) - (r.retencion_irpf || 0);
    if (Math.abs(calc - r.total) > 0.05) avisos.push(`Totales no cuadran (base+IVA-IRPF = ${calc.toFixed(2)})`);
  } else {
    avisos.push("Faltan importes");
  }

  r.moneda = /\$|USD/.test(plano) && !/€|EUR/.test(plano) ? "USD" : "EUR";

  const iban = plano.toUpperCase().match(/\b([A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){4,7}(?:\s?[A-Z0-9]{1,4})?)\b/);
  if (iban && /^ES/.test(iban[1])) r.iban = iban[1].replace(/\s/g, "");

  // Emisor: primera línea "con aspecto de nombre" del encabezado
  const cabecera = lineas.slice(0, 8);
  const nombre = cabecera.find((l) => /[a-záéíóúñ]{3,}/i.test(l)
    && !/factura|invoice|fecha|n[º°]|tel|@|www|http|c\/|calle|avda|cif|nif/i.test(l) && l.length <= 60);
  if (nombre) r.emisor = nombre;

  return { campos: r, avisos };
}
