import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class BasicAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req: any = http.getRequest();
    const res: any = http.getResponse();

    const header = req?.headers?.authorization;

    const unauthorized = () => {
      // Obligatorio para que el navegador muestre el popup de Basic Auth
      res?.setHeader?.('WWW-Authenticate', 'Basic');
      throw new UnauthorizedException('Unauthorized');
    };

    if (typeof header !== 'string' || !header.startsWith('Basic ')) {
      unauthorized();
    }

    const base64 = header.slice('Basic '.length).trim();
    if (!base64) {
      unauthorized();
    }

    let decoded = '';
    try {
      decoded = Buffer.from(base64, 'base64').toString('utf8');
    } catch {
      unauthorized();
    }

    const idx = decoded.indexOf(':');
    if (idx <= 0) {
      unauthorized();
    }

    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);

    const validUser = process.env.METRICS_USER;
    const validPass = process.env.METRICS_PASSWORD;

    if (!validUser || !validPass) {
      unauthorized();
    }

    if (user !== validUser || pass !== validPass) {
      unauthorized();
    }

    return true;
  }
}
