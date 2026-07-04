import { Router, Request, Response } from "express";
import { UserService } from "../services/user.service";
import { InviteService } from "../services/invite.service";
import { AuthService } from "../services/auth.service";
import { AdminService } from "../services/admin.service";
import { authGuard } from "../middleware/auth.middleware";

const authRouter = Router();

/**
 * POST /auth/register
 * Register a new user with a valid invite code.
 */
authRouter.post("/register", async (req: Request, res: Response) => {
  try {
    const { inviteCode, displayName, password } = req.body;

    if (!inviteCode || !displayName || !password) {
      res
        .status(400)
        .json({ error: "inviteCode, displayName, and password are required" });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    if (displayName.length < 2 || displayName.length > 64) {
      res.status(400).json({ error: "Display name must be 2-64 characters" });
      return;
    }

    // Validate invite code
    const validation = await InviteService.validateInvite(inviteCode);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Check user cap
    const userCount = await UserService.getUserCount();
    const withinCap = await AdminService.isWithinUserCap(userCount);
    if (!withinCap) {
      res.status(403).json({ error: "User cap reached. Registration closed." });
      return;
    }

    // Create user
    const user = await UserService.createUser({ displayName, password });

    // Mark invite as used
    await InviteService.markUsed(inviteCode, user.id);

    // Generate tokens
    const tokens = AuthService.generateTokens({
      userId: user.id,
      role: user.role,
      uniqueId: user.unique_id_number,
    });

    // Store refresh token
    await AuthService.storeRefreshToken(user.id, tokens.refreshToken);

    res.status(201).json({
      user: {
        id: user.id,
        uniqueId: user.unique_id_number,
        displayName: user.display_name,
        role: user.role,
      },
      ...tokens,
    });
  } catch (err) {
    console.error("[Auth] Registration error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /auth/login
 * Authenticate with unique ID + password.
 */
authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const { uniqueId, password } = req.body;

    if (!uniqueId || !password) {
      res.status(400).json({ error: "uniqueId and password are required" });
      return;
    }

    const user = await UserService.findByUniqueId(uniqueId);
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    if (user.status !== "active") {
      res.status(403).json({ error: `Account is ${user.status}` });
      return;
    }

    const validPassword = await UserService.verifyPassword(
      password,
      user.password_hash,
    );
    if (!validPassword) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const tokens = AuthService.generateTokens({
      userId: user.id,
      role: user.role,
      uniqueId: user.unique_id_number,
    });

    await AuthService.storeRefreshToken(user.id, tokens.refreshToken);

    res.json({
      user: {
        id: user.id,
        uniqueId: user.unique_id_number,
        displayName: user.display_name,
        role: user.role,
      },
      ...tokens,
    });
  } catch (err) {
    console.error("[Auth] Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /auth/refresh
 * Get a new access token using a refresh token.
 */
authRouter.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: "refreshToken is required" });
      return;
    }

    const decoded = AuthService.verifyRefreshToken(refreshToken);
    if (!decoded || !decoded.userId) {
      res.status(401).json({ error: "Invalid refresh token" });
      return;
    }

    // Validate against stored token
    const isValid = await AuthService.validateStoredRefreshToken(
      decoded.userId,
      refreshToken,
    );
    if (!isValid) {
      res.status(401).json({ error: "Refresh token revoked or expired" });
      return;
    }

    // Fetch user to get current role/status
    const user = await UserService.findById(decoded.userId);
    if (!user || user.status !== "active") {
      res.status(403).json({ error: "Account is not active" });
      return;
    }

    // Generate new tokens
    const tokens = AuthService.generateTokens({
      userId: user.id,
      role: user.role,
      uniqueId: user.unique_id_number,
    });

    await AuthService.storeRefreshToken(user.id, tokens.refreshToken);

    res.json(tokens);
  } catch (err) {
    console.error("[Auth] Refresh error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /auth/logout
 * Revoke the user's refresh token.
 */
authRouter.post("/logout", authGuard, async (req: Request, res: Response) => {
  try {
    if (req.user) {
      await AuthService.revokeRefreshToken(req.user.userId);
    }
    res.json({ message: "Logged out" });
  } catch (err) {
    console.error("[Auth] Logout error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /auth/device
 * Auto-register/login a device. No invite code needed.
 * Used by the mobile app for seamless authentication.
 * If device ID already exists, logs in. Otherwise creates new user.
 */
authRouter.post("/device", async (req: Request, res: Response) => {
  try {
    const { deviceId, displayName } = req.body;

    if (!deviceId) {
      res.status(400).json({ error: "deviceId is required" });
      return;
    }

    const name = displayName || "Phoenix User";

    // Check if device already registered (use deviceId as password)
    let user = await UserService.findByUniqueId(deviceId);

    if (!user) {
      // Auto-register new device
      user = await UserService.createUser({
        displayName: name,
        password: deviceId, // Device ID is the "password" for auto-auth
      });
      // Override the generated unique ID with the device ID for consistency
      // Actually keep the generated one — the device just uses it to auth
    }

    // Verify password (deviceId)
    const valid = await UserService.verifyPassword(
      deviceId,
      user.password_hash,
    );
    if (!valid) {
      // Existing user with different password — edge case
      res.status(401).json({ error: "Device mismatch" });
      return;
    }

    if (user.status !== "active") {
      res.status(403).json({ error: `Account is ${user.status}` });
      return;
    }

    const tokens = AuthService.generateTokens({
      userId: user.id,
      role: user.role,
      uniqueId: user.unique_id_number,
    });

    await AuthService.storeRefreshToken(user.id, tokens.refreshToken);

    res.json({
      user: {
        id: user.id,
        uniqueId: user.unique_id_number,
        displayName: user.display_name,
        role: user.role,
      },
      ...tokens,
    });
  } catch (err) {
    console.error("[Auth] Device auth error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { authRouter };
