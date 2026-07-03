import request from "supertest";
import { app } from "../index";
import { AuthService } from "../services/auth.service";

// Mock database and Redis
jest.mock("../db/connection", () => {
  const mockDb = jest.fn((tableName: string) => {
    const createQb = (): any => {
      const qb: any = {};
      qb.insert = jest.fn().mockReturnValue(qb);
      qb.returning = jest.fn().mockImplementation(() => {
        if (tableName === "invites") {
          return [
            {
              id: "inv-1",
              code: "ABCD1234",
              created_by: "admin-id",
              used_by: null,
              is_used: false,
              expires_at: null,
              created_at: new Date(),
            },
          ];
        }
        return [{}];
      });
      qb.where = jest.fn().mockReturnValue(qb);
      qb.update = jest.fn().mockReturnValue(qb);
      qb.first = jest.fn().mockResolvedValue(null);
      qb.count = jest.fn().mockReturnValue(qb);
      qb.select = jest.fn().mockReturnValue(qb);
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.limit = jest.fn().mockReturnValue(qb);
      qb.offset = jest.fn().mockResolvedValue([]);
      qb.onConflict = jest.fn().mockReturnValue(qb);
      qb.merge = jest.fn().mockResolvedValue(undefined);
      return qb;
    };
    return createQb();
  });
  return { __esModule: true, default: mockDb };
});

jest.mock("../db/redis", () => ({
  getRedis: jest.fn(() => ({
    set: jest.fn().mockResolvedValue("OK"),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
  })),
  closeRedis: jest.fn(),
}));

function getAdminToken(): string {
  const tokens = AuthService.generateTokens({
    userId: "admin-001",
    role: "admin",
    uniqueId: "00000001",
  });
  return tokens.accessToken;
}

function getUserToken(): string {
  const tokens = AuthService.generateTokens({
    userId: "user-001",
    role: "user",
    uniqueId: "12345678",
  });
  return tokens.accessToken;
}

describe("Admin Endpoints", () => {
  describe("POST /api/admin/invites", () => {
    it("should require admin auth", async () => {
      const res = await request(app)
        .post("/api/admin/invites")
        .set("Authorization", `Bearer ${getUserToken()}`)
        .send({});

      expect(res.status).toBe(403);
    });

    it("should allow admin to create invite", async () => {
      const res = await request(app)
        .post("/api/admin/invites")
        .set("Authorization", `Bearer ${getAdminToken()}`)
        .send({ expiresInHours: 24 });

      // 201 or 500 (depending on DB mock) but NOT 401/403
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  describe("GET /api/admin/users", () => {
    it("should reject regular users", async () => {
      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${getUserToken()}`);

      expect(res.status).toBe(403);
    });

    it("should allow admin access", async () => {
      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${getAdminToken()}`);

      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  describe("PATCH /api/admin/users/:id", () => {
    it("should reject invalid status", async () => {
      const res = await request(app)
        .patch("/api/admin/users/user-123")
        .set("Authorization", `Bearer ${getAdminToken()}`)
        .send({ status: "invalid_status" });

      expect(res.status).toBe(400);
    });

    it("should accept valid status values", async () => {
      const res = await request(app)
        .patch("/api/admin/users/user-123")
        .set("Authorization", `Bearer ${getAdminToken()}`)
        .send({ status: "banned" });

      // Won't be 400 (validation passes) — may be 404/500 from mock
      expect(res.status).not.toBe(400);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  describe("PATCH /api/admin/settings", () => {
    it("should reject non-object body", async () => {
      const res = await request(app)
        .patch("/api/admin/settings")
        .set("Authorization", `Bearer ${getAdminToken()}`)
        .type("json")
        .send('"invalid"');

      // A raw JSON string is not an object, so validation rejects it
      expect(res.status).toBe(400);
    });

    it("should allow updating settings", async () => {
      const res = await request(app)
        .patch("/api/admin/settings")
        .set("Authorization", `Bearer ${getAdminToken()}`)
        .send({ user_cap: "200" });

      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });
});
