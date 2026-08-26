import { createRemoteJWKSet, jwtVerify } from 'jose';
import { upsertUser } from '@/app/lib/db';
import { HttpError } from '@/app/lib/http';
import { envValue } from '@/app/lib/runtime-env';

export type AuthUser = { id: string; email: string; isDevelopment: boolean };

const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function normalizedTeamDomain() {
  return envValue('CF_ACCESS_TEAM_DOMAIN').replace(/\/$/, '');
}

export async function requireUser(request: Request): Promise<AuthUser> {
  const teamDomain = normalizedTeamDomain();
  const audience = envValue('CF_ACCESS_AUD');
  const token = request.headers.get('Cf-Access-Jwt-Assertion')?.trim();

  if (!teamDomain || !audience) {
    const localDevelopment =
      envValue('ALLOW_DEV_AUTH') === 'true' && !request.headers.get('cf-ray');
    if (!localDevelopment) {
      throw new HttpError(
        503,
        'Cloudflare Access 설정이 완료되지 않았습니다.',
        'AUTH_NOT_CONFIGURED',
      );
    }
    const user = {
      id: 'local-development',
      email: 'local@patentexamtools.dev',
      isDevelopment: true,
    };
    await upsertUser(user.id, user.email);
    return user;
  }

  if (!token) {
    throw new HttpError(401, '로그인이 필요합니다.', 'AUTH_REQUIRED');
  }

  try {
    let jwks = jwksByTeam.get(teamDomain);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
      jwksByTeam.set(teamDomain, jwks);
    }
    const { payload } = await jwtVerify(token, jwks, {
      issuer: teamDomain,
      audience,
    });
    const id = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email : '';
    if (!id || !email) throw new Error('필수 사용자 클레임이 없습니다.');
    await upsertUser(id, email);
    return { id, email, isDevelopment: false };
  } catch {
    throw new HttpError(401, '로그인 세션을 확인할 수 없습니다.', 'AUTH_INVALID');
  }
}

export function accessLogoutUrl() {
  const teamDomain = normalizedTeamDomain();
  return teamDomain ? `${teamDomain}/cdn-cgi/access/logout` : '';
}
