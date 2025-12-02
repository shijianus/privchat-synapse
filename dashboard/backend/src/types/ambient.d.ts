/// <reference types="express" />

// Ambient module declarations for packages without type definitions
declare module "compression";

declare global {
  namespace Express {
    /**
     * 扩展请求对象以便携带管理员身份
     */
    interface Request {
      user?: {
        id: string;
        roles: string[];
        permissions: string[];
      };
      bot?: {
        id: string;
        name?: string;
        scopes?: string[];
      };
    }
  }
}

export {};

