import { extraerCampos } from "./parser.js";

// Versiones fijadas de las librerías (se cargan desde jsDelivr solo cuando hacen falta)
const CDN = {
  anthropic: "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm",
  tesseract: "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js",
  pdfjs: "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/pdf.min.mjs",
  pdfjsWorker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/pdf.worker.min.mjs",
};

const COLUMNAS = [
  ["archivo", "Archivo", "texto"],
  ["numero", "Nº factura", "texto"],
  ["fecha", "Fecha", "fecha"],
  ["vencimiento", "Vencimiento", "fecha"],
  ["emisor", "Emisor", "texto"],
  ["nif_emisor", "NIF emisor", "texto"],
  ["receptor", "Receptor", "texto"],
  ["nif_receptor", "NIF receptor", "texto"],
  ["concepto", "Concepto", "texto"],
  ["base_imponible", "Base imponible", "importe"],
  ["tipo_iva", "% IVA", "pct"],
  ["cuota_iva", "Cuota IVA", "importe"],
  ["tipo_irpf", "% IRPF", "pct"],
  ["retencion_irpf", "Retención IRPF", "importe"],
  ["total", "Total", "importe"],
  ["moneda", "Moneda", "texto"],
  ["iban", "IBAN", "texto"],
  ["avisos", "Avisos", "texto"],
];

const COLUMNAS_LINEAS = [
  ["archivo", "Archivo", "texto"],
  ["numero", "Nº factura", "texto"],
  ["descripcion", "Descripción", "texto"],
  ["cantidad", "Cantidad", "num"],
  ["precio_unitario", "Precio unitario", "importe"],
  ["descuento", "Descuento %", "pct"],
  ["tipo_iva", "% IVA", "pct"],
  ["importe", "Importe", "importe"],
];

const NULO = (tipo) => ({ anyOf: [{ type: tipo }, { type: "null" }] });

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["facturas"],
  properties: {
    facturas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "numero", "fecha", "vencimiento", "emisor", "nif_emisor", "receptor", "nif_receptor",
          "concepto", "base_imponible", "tipo_iva", "cuota_iva", "tipo_irpf", "retencion_irpf",
          "total", "moneda", "iban", "lineas", "avisos",
        ],
        properties: {
          numero: NULO("string"),
          fecha: { ...NULO("string"), description: "Fecha de emisión en formato YYYY-MM-DD" },
          vencimiento: { ...NULO("string"), description: "YYYY-MM-DD" },
          emisor: NULO("string"),
          nif_emisor: NULO("string"),
          receptor: NULO("string"),
          nif_receptor: NULO("string"),
          concepto: { ...NULO("string"), description: "Resumen breve del objeto de la factura" },
          base_imponible: NULO("number"),
          tipo_iva: { ...NULO("number"), description: "Porcentaje, p. ej. 21. Si hay varios tipos, el principal" },
          cuota_iva: NULO("number"),
          tipo_irpf: NULO("number"),
          retencion_irpf: { ...NULO("number"), description: "Importe retenido en positivo" },
          total: NULO("number"),
          moneda: { ...NULO("string"), description: "Código ISO 4217, p. ej. EUR" },
          iban: NULO("string"),
          lineas: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["descripcion", "cantidad", "precio_unitario", "descuento", "tipo_iva", "importe"],
              properties: {
                descripcion: { type: "string" },
                cantidad: NULO("number"),
                precio_unitario: NULO("number"),
                descuento: NULO("number"),
                tipo_iva: NULO("number"),
                importe: NULO("number"),
              },
            },
          },
          avisos: {
            type: "string",
            description: "Dudas de lectura o incoherencias (vacío si todo cuadra)",
          },
        },
      },
    },
  },
};

const SISTEMA = `Eres un sistema de extracción de datos de facturas (principalmente españolas).
Lee el documento y devuelve los datos de cada factura que contenga, siguiendo el esquema.
- Usa null cuando un dato no aparezca; nunca lo inventes.
- Importes como números con punto decimal (1.234,56 € -> 1234.56).
- Fechas en formato YYYY-MM-DD.
- NIF/CIF sin espacios ni guiones.
- El emisor es quien expide la factura; el receptor, el cliente.
- Comprueba que base imponible + IVA - retención = total y anota en "avisos" cualquier descuadre o dato ilegible.
- Si el documento no es una factura, devuelve "facturas" vacío.`;

// ---------- Estado ----------
const estado = { archivos: [], facturas: [], lineas: [] };
const $ = (sel) => document.querySelector(sel);

const guardar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

// ---------- Utilidades de archivos ----------
const esPdf = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
const TIPOS_IMG = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function aBase64(blob) {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1]);
    r.onerror = () => ko(r.error);
    r.readAsDataURL(blob);
  });
}

async function cargarImagen(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Reduce imágenes grandes para no superar los límites de la API (5 MB por imagen)
async function prepararImagen(file) {
  const img = await cargarImagen(file);
  const lado = Math.max(img.naturalWidth, img.naturalHeight);
  if (TIPOS_IMG.includes(file.type) && file.size < 3.5e6 && lado <= 2400) {
    return { media_type: file.type, data: await aBase64(file) };
  }
  const escala = Math.min(1, 2000 / lado);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * escala);
  canvas.height = Math.round(img.naturalHeight * escala);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.9));
  return { media_type: "image/jpeg", data: await aBase64(blob) };
}

let pdfjsPromesa;
function pdfjs() {
  pdfjsPromesa ??= import(CDN.pdfjs).then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = CDN.pdfjsWorker;
    return lib;
  }).catch((e) => { pdfjsPromesa = null; throw e; });
  return pdfjsPromesa;
}

async function abrirPdf(file) {
  const lib = await pdfjs();
  return lib.getDocument({ data: await file.arrayBuffer() }).promise;
}

// Los PDF digitales ya llevan el texto: se lee directamente, sin OCR
async function textoPdf(doc, maxPaginas = 10) {
  let texto = "";
  for (let i = 1; i <= Math.min(doc.numPages, maxPaginas); i++) {
    const { items } = await (await doc.getPage(i)).getTextContent();
    texto += items.map((it) => it.str + (it.hasEOL ? "\n" : " ")).join("") + "\n";
  }
  return texto;
}

async function paginasPdfComoCanvas(doc, maxPaginas = 10) {
  const canvases = [];
  for (let i = 1; i <= Math.min(doc.numPages, maxPaginas); i++) {
    const pagina = await doc.getPage(i);
    const vp = pagina.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width;
    canvas.height = vp.height;
    await pagina.render({ canvas, canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    canvases.push(canvas);
  }
  return canvases;
}

// ---------- Motor local: Tesseract ----------
let workerPromesa;
let progresoOcr = null; // callback del archivo que se está leyendo
function tesseractWorker() {
  workerPromesa ??= import(CDN.tesseract).then(({ default: Tesseract }) =>
    conTiempoLimite(Tesseract.createWorker("spa", 1, {
      logger: (m) => m.status === "recognizing text" && progresoOcr?.(m.progress),
      errorHandler: (e) => console.error(e),
    }), 120000, "No se pudo cargar el motor OCR (revisa tu conexión)")).catch((e) => { workerPromesa = null; throw e; });
  return workerPromesa;
}

// Si una descarga falla dentro del worker, Tesseract no siempre rechaza la promesa
function conTiempoLimite(promesa, ms, mensaje) {
  let t;
  return Promise.race([
    promesa,
    new Promise((_, ko) => { t = setTimeout(() => ko(new Error(mensaje)), ms); }),
  ]).finally(() => clearTimeout(t));
}

async function extraerLocal(file, progreso) {
  let fuentes = [file];
  if (esPdf(file)) {
    progreso("Leyendo PDF…");
    const doc = await abrirPdf(file);
    const texto = await textoPdf(doc);
    if (texto.replace(/\s/g, "").length > 80) return resultadoLocal(texto);
    fuentes = await paginasPdfComoCanvas(doc); // PDF escaneado: se pasa por OCR
  }
  progreso("Cargando OCR…");
  progresoOcr = (p) => progreso(`Leyendo texto… ${Math.round(p * 100)}%`);
  const worker = await tesseractWorker();
  let texto = "";
  for (const [i, fuente] of fuentes.entries()) {
    if (fuentes.length > 1) progreso(`OCR página ${i + 1}/${fuentes.length}…`);
    const { data } = await conTiempoLimite(worker.recognize(fuente), 180000, "El OCR tardó demasiado");
    texto += data.text + "\n";
  }
  return resultadoLocal(texto);
}

function resultadoLocal(texto) {
  const { campos, avisos } = extraerCampos(texto);
  return { facturas: [{ ...campos, avisos: avisos.join("; "), lineas: [] }] };
}

// ---------- Motor Claude ----------
let clientePromesa;
function clienteClaude(apiKey) {
  clientePromesa ??= import(CDN.anthropic).then(({ default: Anthropic }) =>
    new Anthropic({ apiKey, dangerouslyAllowBrowser: true }))
    .catch((e) => { clientePromesa = null; throw e; });
  return clientePromesa;
}

async function extraerClaude(file, progreso) {
  const apiKey = $("#apiKey").value.trim();
  if (!apiKey) throw new Error("Introduce tu API key de Anthropic (o usa el modo local).");
  const modelo = $("#modelo").value;
  progreso("Preparando documento…");
  const bloque = esPdf(file)
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: await aBase64(file) } }
    : { type: "image", source: { type: "base64", ...(await prepararImagen(file)) } };

  progreso("Analizando con Claude…");
  const client = await clienteClaude(apiKey);
  const params = {
    model: modelo,
    max_tokens: 16000,
    system: SISTEMA,
    output_config: { format: { type: "json_schema", schema: ESQUEMA } },
    messages: [{
      role: "user",
      content: [bloque, { type: "text", text: `Extrae los datos de la factura del archivo "${file.name}".` }],
    }],
  };
  // En Opus 5 se activa el reintento automático en otro modelo si la petición se rechaza
  const resp = modelo === "claude-opus-5"
    ? await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
    : await client.messages.create(params);

  if (resp.stop_reason === "refusal") throw new Error("El modelo rechazó procesar este documento.");
  if (resp.stop_reason === "max_tokens") throw new Error("Respuesta truncada: el documento es demasiado largo.");
  const texto = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const { facturas } = JSON.parse(texto);
  if (!facturas.length) throw new Error("No se ha detectado ninguna factura en el documento.");
  return { facturas };
}

// ---------- Procesamiento ----------
async function procesar() {
  const pendientes = estado.archivos.filter((a) => a.estado === "pendiente" || a.estado === "error");
  if (!pendientes.length) return;
  const motor = document.querySelector("input[name=motor]:checked").value;
  if (motor === "claude" && !$("#apiKey").value.trim()) {
    $("#apiKey").focus();
    avisar("Introduce tu API key de Anthropic o elige el modo local.");
    return;
  }
  $("#procesar").disabled = true;
  for (const item of pendientes) {
    const progreso = (msg) => { item.estado = "procesando"; item.msg = msg; pintarArchivos(); };
    try {
      const { facturas } = motor === "claude"
        ? await extraerClaude(item.file, progreso)
        : await extraerLocal(item.file, progreso);
      for (const f of facturas) {
        const { lineas, ...cab } = f;
        estado.facturas.push({ archivo: item.file.name, ...cab });
        for (const l of lineas || []) estado.lineas.push({ archivo: item.file.name, numero: cab.numero, ...l });
      }
      item.estado = "ok";
      item.msg = facturas.length > 1 ? `${facturas.length} facturas` : "Extraída";
    } catch (e) {
      console.error(e);
      item.estado = "error";
      item.msg = mensajeError(e);
    }
    pintarArchivos();
    pintarTablas();
  }
  $("#procesar").disabled = false;
}

function mensajeError(e) {
  const s = e?.status;
  if (s === 401) return "API key no válida";
  if (s === 429) return "Límite de peticiones alcanzado; reintenta en un momento";
  if (s === 413) return "Archivo demasiado grande";
  if (s >= 500) return "Error del servicio; reintenta";
  if (e instanceof TypeError && /import|fetch/i.test(e.message)) return "No se pudo descargar una librería (¿sin conexión?)";
  return e?.message || String(e);
}

// ---------- Render ----------
function avisar(msg) {
  const el = $("#aviso");
  el.textContent = msg;
  el.hidden = !msg;
}

function pintarArchivos() {
  const ul = $("#listaArchivos");
  ul.replaceChildren(...estado.archivos.map((a, i) => {
    const li = document.createElement("li");
    li.className = `archivo ${a.estado}`;
    const nombre = document.createElement("span");
    nombre.className = "nombre";
    nombre.textContent = a.file.name;
    const msg = document.createElement("span");
    msg.className = "msg";
    msg.textContent = a.msg || "Pendiente";
    const quitar = document.createElement("button");
    quitar.className = "quitar";
    quitar.title = "Quitar";
    quitar.textContent = "×";
    quitar.disabled = a.estado === "procesando";
    quitar.onclick = () => { estado.archivos.splice(i, 1); pintarArchivos(); };
    li.append(nombre, msg, quitar);
    return li;
  }));
  const hayPendientes = estado.archivos.some((a) => a.estado === "pendiente" || a.estado === "error");
  $("#procesar").disabled = !hayPendientes || estado.archivos.some((a) => a.estado === "procesando");
}

function formatear(v, tipo) {
  if (v == null || v === "") return "";
  if ((tipo === "importe" || tipo === "pct" || tipo === "num") && typeof v === "number") {
    return v.toLocaleString("es-ES", tipo === "importe" ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {});
  }
  return String(v);
}

function interpretar(texto, tipo) {
  const t = texto.trim();
  if (!t) return null;
  if (tipo === "importe" || tipo === "pct" || tipo === "num") {
    const n = parseFloat(t.replace(/[€%\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : t;
  }
  return t;
}

function pintarTabla(tabla, columnas, filas, conBorrar) {
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  for (const [, titulo, tipo] of columnas) {
    const th = document.createElement("th");
    th.textContent = titulo;
    if (tipo !== "texto" && tipo !== "fecha") th.className = "num";
    trh.append(th);
  }
  if (conBorrar) trh.append(document.createElement("th"));
  thead.append(trh);

  const tbody = document.createElement("tbody");
  filas.forEach((fila, i) => {
    const tr = document.createElement("tr");
    if (fila.avisos) tr.className = "con-aviso";
    for (const [clave, , tipo] of columnas) {
      const td = document.createElement("td");
      td.textContent = formatear(fila[clave], tipo);
      if (tipo !== "texto" && tipo !== "fecha") td.className = "num";
      if (clave !== "archivo") {
        try { td.contentEditable = "plaintext-only"; } catch { td.contentEditable = "true"; }
        td.spellcheck = false;
        td.onblur = () => { fila[clave] = interpretar(td.textContent, tipo); td.textContent = formatear(fila[clave], tipo); };
        td.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); td.blur(); } };
      }
      tr.append(td);
    }
    if (conBorrar) {
      const td = document.createElement("td");
      const b = document.createElement("button");
      b.className = "quitar";
      b.title = "Eliminar fila";
      b.textContent = "×";
      b.onclick = () => { filas.splice(i, 1); pintarTablas(); };
      td.append(b);
      tr.append(td);
    }
    tbody.append(tr);
  });
  tabla.replaceChildren(thead, tbody);
}

function pintarTablas() {
  const hay = estado.facturas.length > 0;
  $("#resultados").hidden = !hay;
  $("#exportar").disabled = !hay;
  pintarTabla($("#tablaFacturas"), COLUMNAS, estado.facturas, true);
  $("#bloqueLineas").hidden = !estado.lineas.length;
  pintarTabla($("#tablaLineas"), COLUMNAS_LINEAS, estado.lineas, true);
  const total = estado.facturas.reduce((s, f) => s + (typeof f.total === "number" ? f.total : 0), 0);
  $("#resumen").textContent = `${estado.facturas.length} factura(s) · Total ${formatear(total, "importe")} €`;
}

// ---------- Excel ----------
let xlsxPromesa;
const cargarXlsx = () => (xlsxPromesa ??= new Promise((ok, ko) => {
  if (window.XLSX) return ok(window.XLSX);
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
  s.onload = () => ok(window.XLSX);
  s.onerror = () => { xlsxPromesa = null; ko(new Error("No se pudo cargar la librería de Excel")); };
  document.head.append(s);
}));

function hoja(XLSX, columnas, filas, conTotales) {
  const datos = filas.map((f) => columnas.map(([clave, , tipo]) => {
    const v = f[clave];
    if (tipo === "fecha" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [y, m, d] = v.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    }
    return v ?? "";
  }));
  const ws = XLSX.utils.aoa_to_sheet([columnas.map((c) => c[1]), ...datos], { cellDates: true });
  const n = filas.length;
  columnas.forEach(([, , tipo], c) => {
    for (let r = 1; r <= n + (conTotales ? 1 : 0); r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      if (tipo === "importe") cell.z = "#,##0.00";
      if (tipo === "fecha" && cell.t === "d") cell.z = "dd/mm/yyyy";
    }
  });
  if (conTotales && n) {
    columnas.forEach(([clave, , tipo], c) => {
      if (c === 0) { ws[XLSX.utils.encode_cell({ r: n + 1, c })] = { t: "s", v: "TOTAL" }; return; }
      if (tipo !== "importe") return;
      const col = XLSX.utils.encode_col(c);
      ws[`${col}${n + 2}`] = { t: "n", f: `SUM(${col}2:${col}${n + 1})`, z: "#,##0.00" };
    });
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: n + 1, c: columnas.length - 1 } });
  }
  ws["!cols"] = columnas.map(([clave, titulo]) => ({
    wch: Math.min(50, Math.max(titulo.length + 2, ...filas.map((f) => String(f[clave] ?? "").length + 2))),
  }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: n, c: columnas.length - 1 } }) };
  return ws;
}

async function exportar() {
  document.activeElement?.blur?.(); // guarda la celda que se esté editando
  try {
    const XLSX = await cargarXlsx();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, hoja(XLSX, COLUMNAS, estado.facturas, true), "Facturas");
    if (estado.lineas.length) XLSX.utils.book_append_sheet(wb, hoja(XLSX, COLUMNAS_LINEAS, estado.lineas, false), "Líneas");
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `facturas_${fecha}.xlsx`, { compression: true });
  } catch (e) {
    avisar(mensajeError(e));
  }
}

// ---------- Eventos ----------
function anadirArchivos(lista) {
  avisar("");
  const rechazados = [];
  for (const file of lista) {
    if (esPdf(file) || file.type.startsWith("image/")) {
      if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) { rechazados.push(file.name); continue; }
      estado.archivos.push({ file, estado: "pendiente" });
    } else {
      rechazados.push(file.name);
    }
  }
  if (rechazados.length) avisar(`Formato no admitido (usa PDF, JPG, PNG o WEBP): ${rechazados.join(", ")}`);
  pintarArchivos();
}

function init() {
  const zona = $("#zona");
  const input = $("#input");
  zona.onclick = () => input.click();
  zona.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } };
  input.onchange = () => { anadirArchivos(input.files); input.value = ""; };
  zona.ondragover = (e) => { e.preventDefault(); zona.classList.add("encima"); };
  zona.ondragleave = () => zona.classList.remove("encima");
  zona.ondrop = (e) => { e.preventDefault(); zona.classList.remove("encima"); anadirArchivos(e.dataTransfer.files); };

  const motorGuardado = leer("facturas.motor");
  if (motorGuardado) document.querySelector(`input[name=motor][value=${motorGuardado}]`)?.click();
  const actualizarMotor = () => {
    const motor = document.querySelector("input[name=motor]:checked").value;
    $("#opcionesClaude").hidden = motor !== "claude";
    guardar("facturas.motor", motor);
  };
  document.querySelectorAll("input[name=motor]").forEach((r) => (r.onchange = actualizarMotor));
  actualizarMotor();

  const clave = leer("facturas.apiKey");
  if (clave) { $("#apiKey").value = clave; $("#recordar").checked = true; }
  const recordar = () => guardar("facturas.apiKey", $("#recordar").checked ? $("#apiKey").value.trim() : null);
  $("#recordar").onchange = recordar;
  $("#apiKey").onchange = () => { clientePromesa = null; recordar(); };
  const modelo = leer("facturas.modelo");
  if (modelo && [...$("#modelo").options].some((o) => o.value === modelo)) $("#modelo").value = modelo;
  $("#modelo").onchange = () => guardar("facturas.modelo", $("#modelo").value);

  $("#procesar").onclick = procesar;
  $("#exportar").onclick = exportar;
  $("#limpiar").onclick = () => {
    estado.facturas.length = 0;
    estado.lineas.length = 0;
    estado.archivos = estado.archivos.filter((a) => a.estado === "procesando");
    pintarArchivos();
    pintarTablas();
  };
  pintarArchivos();
  pintarTablas();
}

init();
