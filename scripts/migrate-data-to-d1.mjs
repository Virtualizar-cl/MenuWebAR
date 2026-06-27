#!/usr/bin/env node
// =============================================================================
// scripts/migrate-data-to-d1.mjs  —  MIGRA DATOS  Neon (Postgres)  ->  D1 (SQLite)
// =============================================================================
// Lee TODAS las tablas desde Postgres (Neon o Supabase, via DATABASE_URL),
// preservando IDs y FKs, y genera un archivo .sql con los INSERT para D1.
// Luego ese .sql se aplica con wrangler.
//
// CONVERSIONES (Postgres -> SQLite):
//   - ingredientes text[]   -> TEXT JSON ("["pan","queso"]")
//   - timestamptz           -> TEXT ISO 8601
//   - boolean               -> 0/1
//   - NULL                  -> NULL
//
// USO:
//   1) Generar el SQL (requiere DATABASE_URL apuntando a Neon):
//        DATABASE_URL="postgres://..." node scripts/migrate-data-to-d1.mjs > d1-data.sql
//   2) Aplicarlo a D1:
//        Local:      wrangler d1 execute menuwebar-db --local  --file=d1-data.sql
//        Produccion: wrangler d1 execute menuwebar-db --remote --file=d1-data.sql
//
// NOTA: el .sql arranca con DELETE de todas las tablas (orden FK-safe) para que
// la migracion sea idempotente: podes correrla varias veces sin duplicar datos.
// =============================================================================

import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: falta DATABASE_URL (connection string de Neon/Postgres).");
  process.exit(1);
}

const sql = postgres(connectionString, {
  ssl: "require",
  prepare: !/6543|pgbouncer=true/.test(connectionString),
  onnotice: () => {},
});

// Escapa un valor para SQL literal de SQLite.
function lit(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  // string: escapar comillas simples
  return `'${String(v).replace(/'/g, "''")}'`;
}

function isoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function main() {
  const [cats, imgs, mods, platos, hist, usuarios] = await Promise.all([
    sql`select * from categorias order by id_categ`,
    sql`select * from imagenes order by id_image`,
    sql`select * from modelos order by id_model`,
    sql`select * from platos order by id`,
    sql`select * from historial_colores order by used_at`,
    sql`select * from usuarios order by id_usuario`,
  ]);

  const out = [];

  // Limpieza idempotente (orden hijo -> padre).
  // NOTA: D1 NO permite BEGIN TRANSACTION/COMMIT ni PRAGMA en archivos --file
  // (los maneja internamente). El borrado en orden FK-safe basta.
  out.push("DELETE FROM platos;");
  out.push("DELETE FROM historial_colores;");
  out.push("DELETE FROM usuarios;");
  out.push("DELETE FROM imagenes;");
  out.push("DELETE FROM modelos;");
  out.push("DELETE FROM categorias;");

  // categorias
  for (const r of cats) {
    out.push(
      `INSERT INTO categorias (id_categ, nombre_categ) VALUES (${lit(r.id_categ)}, ${lit(r.nombre_categ)});`,
    );
  }
  // imagenes
  for (const r of imgs) {
    out.push(
      `INSERT INTO imagenes (id_image, nombre_image, url_image) VALUES (${lit(r.id_image)}, ${lit(r.nombre_image)}, ${lit(r.url_image)});`,
    );
  }
  // modelos
  for (const r of mods) {
    out.push(
      `INSERT INTO modelos (id_model, nombre_model, url_model) VALUES (${lit(r.id_model)}, ${lit(r.nombre_model)}, ${lit(r.url_model)});`,
    );
  }
  // platos
  for (const r of platos) {
    const ingredientes = JSON.stringify(Array.isArray(r.ingredientes) ? r.ingredientes : []);
    out.push(
      `INSERT INTO platos (id, nombre, descripcion, precio, categoria, imagen, modelo, ingredientes, cardColor, cardMessage, descuento, descuento_inicio, descuento_fin) VALUES (` +
        [
          lit(r.id),
          lit(r.nombre),
          lit(r.descripcion || ""),
          lit(r.precio),
          lit(r.categoria),
          lit(r.imagen),
          lit(r.modelo),
          lit(ingredientes),
          lit(r.cardColor || "#152238"),
          lit(r.cardMessage),
          lit(Number.isInteger(r.descuento) ? r.descuento : 0),
          lit(isoOrNull(r.descuento_inicio)),
          lit(isoOrNull(r.descuento_fin)),
        ].join(", ") +
        ");",
    );
  }
  // historial_colores
  for (const r of hist) {
    out.push(
      `INSERT INTO historial_colores (color, used_at) VALUES (${lit(r.color)}, ${lit(isoOrNull(r.used_at) || new Date().toISOString())});`,
    );
  }
  // usuarios
  const PK = [
    "puede_crear_platos",
    "puede_editar_platos",
    "puede_eliminar_platos",
    "puede_gestionar_categorias",
    "puede_subir_archivos",
    "puede_eliminar_archivos",
    "puede_gestionar_usuarios",
  ];
  for (const r of usuarios) {
    const perms = PK.map((k) => lit(Boolean(r[k]))).join(", ");
    out.push(
      `INSERT INTO usuarios (id_usuario, email, password_hash, ${PK.join(", ")}, creado_en) VALUES (` +
        [
          lit(r.id_usuario),
          lit(r.email),
          lit(r.password_hash),
          perms,
          lit(isoOrNull(r.creado_en) || new Date().toISOString()),
        ].join(", ") +
        ");",
    );
  }

  process.stdout.write(out.join("\n") + "\n");

  console.error(
    `OK -> categorias:${cats.length} imagenes:${imgs.length} modelos:${mods.length} platos:${platos.length} historial:${hist.length} usuarios:${usuarios.length}`,
  );
  await sql.end();
}

main().catch(async (e) => {
  console.error("ERROR migracion:", e.message);
  await sql.end().catch(() => {});
  process.exit(1);
});
