import { extraerCampos, validarNif, parseImporte } from "./parser.js";
import assert from "node:assert";
// Ejecutar con: node facturas/parser.test.mjs
assert(validarNif("12345678Z")); assert(!validarNif("12345678A"));
assert(validarNif("X1234567L")); assert(validarNif("A28015865")); assert(!validarNif("A28015866"));
for (const [s,n] of [["1.234,56",1234.56],["1,234.56",1234.56],["12,34",12.34],["1.234",1234],["1 234,56 €",1234.56],["250.00",250]]) assert.equal(parseImporte(s), n, s);
const t1 = `Talleres Martínez S.L.
C/ Mayor 12, 28001 Madrid
CIF: A28015865
FACTURA Nº: F-2024/0153
Fecha: 15/03/2024
Fecha vencimiento: 14/04/2024
Cliente: Justifika Consulting
NIF: 12345678Z
Concepto Cantidad Precio Importe
Reparación equipo 2 400,00 800,00
Mantenimiento 1 200,00 200,00
Base imponible 1.000,00 €
IVA 21% 210,00 €
Retención IRPF 15% -150,00 €
TOTAL FACTURA 1.060,00 €
IBAN: ES91 2100 0418 4502 0005 1332`;
const r = extraerCampos(t1);
assert.equal(r.campos.numero,"F-2024/0153"); assert.equal(r.campos.fecha,"2024-03-15"); assert.equal(r.campos.vencimiento,"2024-04-14");
assert.equal(r.campos.nif_emisor,"A28015865"); assert.equal(r.campos.nif_receptor,"12345678Z");
assert.equal(r.campos.base_imponible,1000); assert.equal(r.campos.tipo_iva,21); assert.equal(r.campos.cuota_iva,210);
assert.equal(r.campos.retencion_irpf,150); assert.equal(r.campos.total,1060); assert.equal(r.avisos.length,0);
assert.equal(r.campos.emisor,"Talleres Martínez S.L.");
const r2 = extraerCampos(`ACME SUMINISTROS SA\nInvoice No. 99812\n3 de enero de 2025\nSubtotal 50,00\nI.V.A. (21 %)\n10,50\nTotal 60,50`);
// Errores típicos de OCR: "Nº" leído como N" y la letra Z del NIF leída como 7
const r3 = extraerCampos(`Empresa SL\nFACTURA N": F-1/22\nNIF: 123456787\nTel. 912345678\nTOTAL FACTURA: 1.210,00 €`);
assert.equal(r3.campos.numero, "F-1/22"); assert.equal(r3.campos.nif_emisor, "12345678Z"); assert.equal(r3.campos.nif_receptor, null);
assert.equal(extraerCampos("TOTAL FACTURA: 1.210,00").campos.numero, null);
console.log("OK");
