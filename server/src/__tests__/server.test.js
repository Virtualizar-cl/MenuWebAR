const request = require("supertest");
const fs = require("fs");
const path = require("path");

// Establecer variables de entorno de prueba antes de importar la app
process.env.JWT_SECRET = "test-secret-for-testing-only";
process.env.ADMIN_DEFAULT_EMAIL = "test@test.com";
process.env.ADMIN_DEFAULT_PASSWORD = "TestPassword123";

const ADMIN_FILE = path.join(__dirname, "..", "data", "admin.json");

// Guardar y restaurar datos originales
let originalAdminData;

if (fs.existsSync(ADMIN_FILE)) {
  originalAdminData = fs.readFileSync(ADMIN_FILE, "utf-8");
}

afterAll(() => {
  // Restaurar datos originales
  if (originalAdminData) {
    fs.writeFileSync(ADMIN_FILE, originalAdminData);
  }
});

// Eliminar archivo admin para que initAdmin() lo recree con credenciales de prueba
if (fs.existsSync(ADMIN_FILE)) {
  fs.unlinkSync(ADMIN_FILE);
}

const app = require("../server");

describe("API Endpoints", () => {
  describe("GET /api/health", () => {
    it("returns ok status", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe("GET /api/menu", () => {
    it("returns 503 when Supabase is not configured", async () => {
      const res = await request(app).get("/api/menu");
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/Supabase no esta configurado/i);
    });
  });

  describe("GET /api/categories", () => {
    it("returns 503 when Supabase is not configured", async () => {
      const res = await request(app).get("/api/categories");
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/Supabase no esta configurado/i);
    });
  });

  describe("GET /api/modelos", () => {
    it("returns 503 when Supabase is not configured", async () => {
      const res = await request(app).get("/api/modelos");
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/Supabase no esta configurado/i);
    });
  });

  describe("GET /api/imagenes", () => {
    it("returns 503 when Supabase is not configured", async () => {
      const res = await request(app).get("/api/imagenes");
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/Supabase no esta configurado/i);
    });
  });

  describe("POST /api/auth/login", () => {
    it("returns 400 if username or password missing", async () => {
      const res = await request(app).post("/api/auth/login").send({ username: "test@test.com" });
      expect(res.status).toBe(400);
    });

    it("returns 401 for invalid credentials", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "wrong@email.com", password: "wrongpass" });
      expect(res.status).toBe(401);
    });

    it("returns token for valid credentials", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "test@test.com", password: "TestPassword123" });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.username).toBe("test@test.com");
    });
  });

  describe("Protected routes", () => {
    let token;

    beforeAll(async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ username: "test@test.com", password: "TestPassword123" });
      token = res.body.token;
    });

    it("rejects requests without token", async () => {
      const res = await request(app).get("/api/admin/categories");
      expect(res.status).toBe(401);
    });

    it("returns 503 for data routes when Supabase is not configured", async () => {
      const res = await request(app)
        .get("/api/admin/categories")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/Supabase no esta configurado/i);
    });

    describe("Input validation", () => {
      it("rejects category with invalid ID characters", async () => {
        const res = await request(app)
          .post("/api/admin/categories")
          .set("Authorization", `Bearer ${token}`)
          .send({ id: "bad id with spaces", label: "Test" });
        expect(res.status).toBe(400);
      });

      it("rejects item with invalid modelAR id", async () => {
        const res = await request(app)
          .post("/api/admin/items")
          .set("Authorization", `Bearer ${token}`)
          .send({
            id: "test-item-traversal",
            category: "entradas",
            name: "Test",
            price: "$1000",
            modelAR: "../../etc/passwd",
          });
        expect(res.status).toBe(400);
      });

      it("accepts item with valid modelAR id", async () => {
        const res = await request(app)
          .post("/api/admin/items")
          .set("Authorization", `Bearer ${token}`)
          .send({
            id: "test-valid-item",
            category: "entradas",
            name: "Test Item",
            price: "$1000",
            modelAR: "Plato1",
          });
        expect(res.status).toBe(503);
        expect(res.body.error).toMatch(/Supabase no esta configurado/i);
      });

      it("registers a Cloudinary model in /api/admin/modelos", async () => {
        const res = await request(app)
          .post("/api/admin/modelos")
          .set("Authorization", `Bearer ${token}`)
          .send({
            id: "test_model_cloudinary",
            label: "Modelo Test Cloudinary",
            url: "https://res.cloudinary.com/dxpam0kqa/raw/upload/v1/menu/models/test-model.glb",
          });

        expect(res.status).toBe(503);
        expect(res.body.error).toMatch(/Supabase no esta configurado/i);
      });

      it("registers a Cloudinary image in /api/admin/imagenes", async () => {
        const res = await request(app)
          .post("/api/admin/imagenes")
          .set("Authorization", `Bearer ${token}`)
          .send({
            id: "test_image_cloudinary",
            label: "Imagen Test Cloudinary",
            url: "https://res.cloudinary.com/dxpam0kqa/image/upload/v1/menu/images/test-image.jpg",
          });

        expect(res.status).toBe(503);
        expect(res.body.error).toMatch(/Supabase no esta configurado/i);
      });
    });
  });
});
