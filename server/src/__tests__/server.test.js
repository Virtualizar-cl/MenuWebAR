const request = require("supertest");
const bcrypt = require("bcryptjs");

// Override env BEFORE the server module loads (dotenv won't override existing
// values). El super admin se valida con ADMIN_EMAIL + ADMIN_PASSWORD_HASH
// (hash bcrypt), no con la pass en texto plano.
const ADMIN_PASSWORD = "TestPassword123";
process.env.JWT_SECRET = "test-secret-for-testing-only";
process.env.ADMIN_EMAIL = "test@test.com";
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);
// Set test Supabase URL so isManagedStorageUrl can validate Storage URLs; the
// service role key is a dummy (never used for real calls because the DB stays
// unconfigured, so requests cut off at 503 before touching Supabase).
process.env.SUPABASE_URL = "https://test-project.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-not-used-for-real-calls";

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
        .send({ username: "test@test.com", password: ADMIN_PASSWORD });
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
        .send({ username: "test@test.com", password: ADMIN_PASSWORD });
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

      it("rejects item with invalid image URL", async () => {
        const res = await request(app)
          .post("/api/admin/items")
          .set("Authorization", `Bearer ${token}`)
          .send({
            id: "test-item-image",
            category: "entradas",
            name: "Test",
            price: "$1000",
            image: "https://evil.com/phish.jpg",
          });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Imagen no permitida/i);
      });

      it("accepts item with Supabase Storage image URL", async () => {
        const res = await request(app)
          .post("/api/admin/items")
          .set("Authorization", `Bearer ${token}`)
          .send({
            id: "test-item-supabase-img",
            category: "entradas",
            name: "Test",
            price: "$1000",
            image:
              "https://test-project.supabase.co/storage/v1/object/public/menu-assets/images/test.jpg",
          });
        expect(res.status).toBe(503);
        expect(res.body.error).toMatch(/Supabase no esta configurado/i);
      });

      it("rejects image upload without file", async () => {
        const res = await request(app)
          .post("/api/admin/imagenes")
          .set("Authorization", `Bearer ${token}`);
        expect(res.status).toBe(400);
      });

      it("rejects model upload without file", async () => {
        const res = await request(app)
          .post("/api/admin/modelos")
          .set("Authorization", `Bearer ${token}`);
        expect(res.status).toBe(400);
      });
    });
  });
});
