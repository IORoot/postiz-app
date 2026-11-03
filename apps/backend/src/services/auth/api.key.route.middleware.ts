import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { PublicAuthMiddleware } from '@gitroom/backend/services/auth/public.auth.middleware';

// Session routes. An API key is accepted only here so the uploader can call
// them; every other route on these controllers still requires a logged-in session.
const apiKeyRoutes: Array<{ method: string; pattern: RegExp }> = [
  { method: 'POST', pattern: /\/media\/move$/ },
  { method: 'GET', pattern: /\/media\/folders$/ },
  { method: 'POST', pattern: /\/media\/folders$/ },
  { method: 'POST', pattern: /\/media\/folders\/[^/]+$/ },
  { method: 'DELETE', pattern: /\/media\/folders\/[^/]+$/ },
  { method: 'POST', pattern: /\/pipelines\/enqueue$/ },
];

@Injectable()
export class ApiKeyRouteMiddleware implements NestMiddleware {
  constructor(private _publicAuthMiddleware: PublicAuthMiddleware) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const authorization = (req.headers.authorization ||
      req.headers.Authorization) as string | undefined;
    const path = (req.originalUrl || req.url || '').split('?')[0].replace(/\/+$/, '');
    const allowed = apiKeyRoutes.some(
      (route) => route.method === req.method && route.pattern.test(path)
    );

    if (!authorization || !allowed) {
      next();
      return;
    }

    await this._publicAuthMiddleware.use(req, res, () => {
      // AuthMiddleware skips the session cookie when this is set.
      // @ts-ignore
      req.apiKeyAuthenticated = true;
      next();
    });
  }
}
