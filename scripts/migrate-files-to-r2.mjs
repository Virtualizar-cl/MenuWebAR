#!/usr/bin/env node
// =============================================================================
// scripts/migrate-files-to-r2.mjs  —  MIGRA ARCHIVOS  Vercel Blob  ->  R2
// =============================================================================
// Recorre las URLs de archivos guardadas en D1 (tablas imagenes y modelos),
// descarga cada binario desde su URL actual (Vercel Blob), lo sube a R2 con
// wrangler, y genera un .sql que reescribe las URLs en D1 para que apunten a R2.
//
// PRE-REQUISITOS:
//   - wrangler instalado y autenticado (ya hecho: v4.105.0, sistemas@virtualizar.cl)
//   - el bucket menuwebar-assets ya creado y con acceso publico habilitado
//   - los DATOS ya migrados a D1 (correr antes migrate-data-to-d1.mjs)
//   - R2_PUBLIC_URL: dominio publico del bucket, sin barra final
//
// USO:
//   R2_PUBLIC_URL="https://pub-xxxx.r2.dev" \
//   D1_TARGET="--remote" \
//   node scripts/migrate-files-to-r2.mjs
//
//   D1_TARGET por defecto es "--local"; usa "--remote" para produccion.
//
// EFECTOS:
//   1) Sube cada archivo a R2 bajo "images/<key>" o "models/<key>".
//   2) Imprime y aplica un UPDATE por cada fila con la nueva URL.
//
// IDEMPOTENCIA: si una URL ya pertenece a R2_PUBLIC_URL se omite (ya migrada).
// =============================================================================

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";

const DB_NAME = "menuwebar-db";
const R2_BUCKET = "menuwebar-assets";
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
const D1_TARGET = process.env.D1_TARGET || "--local"; // o "--remote"

if (!R2_PUBLIC_URL) {
  console.error("ERROR: falta R2_PUBLIC_URL (dominio publico del bucket R2).");
  process.exit(1);
}

function wrangler(args) {
  // execFileSync con shell:true re-parsea los argumentos por el shell, lo que
  // rompe valores con espacios (ej. --command "SELECT ... FROM x") o con & ? en
  // Windows. Para evitarlo NO usamos shell:true. En Windows el binario es
  // npx.cmd y se invoca via "cmd /c" con los args como array (cmd no re-splitea
  // los elementos del array). En POSIX se llama npx directo.
  if (process.platform === "win32") {
    return execFileSync("cmd", ["/c", "npx", "wrangler", ...args], { encoding: "utf8" });
  }
  return execFileSync("npx", ["wrangler", ...args], { encoding: "utf8" });
}

// Ejecuta SQL de lectura en D1 y devuelve las filas (wrangler --json).
function d1Query(query) {
  const raw = wrangler(["d1", "execute", DB_NAME, D1_TARGET, "--json", "--command", query]);
  const parsed = JSON.parse(raw);
  // wrangler --json devuelve un array de resultados; tomamos results del primero.
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  return (first && first.results) || [];
}

function r2Put(key, filePath, contentType) {
  const args = ["r2", "object", "put", `${R2_BUCKET}/${key}`, "--file", filePath];
  if (contentType) args.push("--content-type", contentType);
  if (D1_TARGET === "--remote") args.push("--remote");
  wrangler(args);
}

function guessContentType(ext) {
  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".glb": "model/gltf-binary",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}

function buildKey(folder, url) {
  let ext = extname(new URL(url).pathname) || "";
  if (folder === "models" && !ext) ext = ".glb";
  return `${folder}/${Date.now()}-${randomUUID().replace(/-/g, "")}${ext}`;
}

async function migrateRow({ folder, url }) {
  if (!url || url.startsWith(R2_PUBLIC_URL + "/")) {
    return null; // vacio o ya en R2
  }
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  SKIP (descarga fallo ${res.status}): ${url}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const key = buildKey(folder, url);
  const ext = extname(key);

  const tmp = mkdtempSync(join(tmpdir(), "r2mig-"));
  const tmpFile = join(tmp, `f${ext}`);
  try {
    writeFileSync(tmpFile, buf);
    r2Put(key, tmpFile, guessContentType(ext));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const newUrl = `${R2_PUBLIC_URL}/${key}`;
  console.error(`  OK ${folder}: ${url} -> ${newUrl}`);
  return newUrl;
}

function esc(s) {
  return String(s).replace(/'/g, "''");
}

async function main() {
  const updates = [];

  console.error("== Imagenes ==");
  const imagenes = d1Query("SELECT id_image, url_image FROM imagenes");
  for (const row of imagenes) {
    const newUrl = await migrateRow({ folder: "images", url: row.url_image });
    if (newUrl) {
      updates.push(
        `UPDATE imagenes SET url_image='${esc(newUrl)}' WHERE id_image=${row.id_image};`,
      );
    }
  }

  console.error("== Modelos ==");
  const modelos = d1Query("SELECT id_model, url_model FROM modelos");
  for (const row of modelos) {
    const newUrl = await migrateRow({ folder: "models", url: row.url_model });
    if (newUrl) {
      updates.push(
        `UPDATE modelos SET url_model='${esc(newUrl)}' WHERE id_model=${row.id_model};`,
      );
    }
  }

  if (updates.length === 0) {
    console.error("Nada que actualizar (todo ya migrado o sin archivos).");
    return;
  }

  // Aplicar los UPDATE de URLs en D1. (D1 no permite BEGIN/COMMIT en --file.)
  const sqlText = updates.join("\n");
  const tmp = mkdtempSync(join(tmpdir(), "r2sql-"));
  const sqlFile = join(tmp, "url-updates.sql");
  try {
    writeFileSync(sqlFile, sqlText + "\n");
    wrangler(["d1", "execute", DB_NAME, D1_TARGET, "--file", sqlFile]);
    console.error(`OK -> ${updates.length} URLs actualizadas en D1.`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("ERROR migracion archivos:", e.message);
  process.exit(1);
});
