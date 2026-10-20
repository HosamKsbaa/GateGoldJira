// Draft for proposed frontend_service surface: actual typed Angular service + Go
// responses in a Playwright Node integration; no browser interaction/UI claim.
import '@angular/compiler';
import { Injector, type DestroyableInjector } from '@angular/core';
import { expect } from '@playwright/test';
import { z } from 'zod';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, account } from './support/session';
import { memberId } from './support/coverage-access';
import { AuthService } from '../src/app/core/auth/auth.service';
import { ConfigService, type PublicConfig } from '../src/app/core/config/config.service';
import { LocalSignIn, SIGN_IN } from '../src/app/core/auth/sign-in.provider';
import { zFailureBody, zMe } from '../src/app/api/generated/zod.gen';
test.skip(!localFixturesAvailable, 'Requires actual local accounts and the isolated Go/PostgreSQL service.');
test.use({ trace: 'off' });
for (const [id, olderSucceeds] of [['UC-ACC-0020', true], ['UC-ACC-0021', false]] as const) {
    test(id + ' real frontend service discards a superseded network result', async () => {
        if (!apiOrigin)
            throw new Error('The isolated real API origin is required.');
        const directFetch = globalThis.fetch;
        const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
        if (windowDescriptor)
            throw new Error('This story requires an isolated Node worker, not a browser window.');
        // The actual ConfigService URL getter needs a host base URL. This minimal Node
        // host adapter supplies only that base, never an identity or network response.
        const config: PublicConfig = { mode: 'development', apiBaseUrl: apiOrigin + '/api/v1', issuer: z.url().parse(process.env['AUTH_ISSUER']), clientId: 'local-development', audience: z.url().parse(process.env['REST_AUDIENCE']), scope: 'openid profile email gategoldjira:access' };
        let release: () => void = () => {
        };
        const gate = new Promise<void>(resolve => {
            release = resolve;
        });
        let heldStatus: number | undefined, realFailure: z.infer<typeof zFailureBody> | undefined;
        let held = false;
        let injector: DestroyableInjector | undefined;
        let earlier: Promise<unknown> | undefined;
        const owner = await account('owner'), member = await account('member');
        Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: process.env['GATEGOLD_WEB_URL'] } } });
        globalThis.fetch = async (input, init) => {
            const outgoing = input instanceof Request ? input : new Request(input, init);
            const isLogin = new URL(outgoing.url).pathname === '/api/v1/auth/local-sign-in';
            const ownerRequest = isLogin && z.object({ username: z.string() }).parse(await outgoing.clone().json()).username === owner.username;
            // Every byte is produced by the real Go endpoint. Only returning that real
            // Response to the older service call is delayed until a newer login wins.
            const response = await directFetch(input, init);
            if (ownerRequest) {
                heldStatus = response.status;
                if (!olderSucceeds)
                    realFailure = zFailureBody.parse(await response.clone().json());
                held = true;
                await gate;
            }
            return response;
        };
        try {
            const provider = new LocalSignIn();
            injector = Injector.create({ providers: [{ provide: ConfigService, useValue: new ConfigService(config) }, { provide: SIGN_IN, useValue: provider }, { provide: AuthService, useFactory: () => new AuthService() }] });
            const auth = injector.get(AuthService);
            await useCase(id, async () => {
                const initialEpoch = auth.sessionEpoch();
                const first = auth.signInLocalCredentials(owner.username, olderSucceeds ? owner.password : 'incorrect-older-password');
                earlier = first;
                await expect.poll(() => held).toBe(true);
                expect(heldStatus).toBe(olderSucceeds ? 200 : 401);
                if (!olderSucceeds)
                    expect(realFailure?.error.code).toBe('authentication_required');
                expect(auth.me()).toBeNull();
                expect(await provider.accessToken()).toBeUndefined();
                expect(await auth.signInLocalCredentials(member.username, member.password)).toBe('signed-in');
                const newerEpoch = auth.sessionEpoch(), newerIdentity = auth.me(), newerToken = await provider.accessToken();
                expect(newerEpoch).toBe(initialEpoch + 2);
                expect(newerIdentity?.userId).toBe(memberId);
                expect(Boolean(newerToken)).toBe(true);
                release();
                expect(await first).toBe('superseded');
                expect(auth.sessionEpoch()).toBe(newerEpoch);
                expect(auth.me()).toEqual(newerIdentity);
                expect((await provider.accessToken()) === newerToken).toBe(true);
                // Real company access still resolves to the newer principal after release.
                const actual = await directFetch(apiOrigin + '/api/v1/me', { headers: { Authorization: 'Bearer ' + newerToken } });
                expect(actual.status).toBe(200);
                expect(zMe.parse(await actual.json()).userId).toBe(memberId);
            }, 'frontend_service');
        }
        finally {
            release();
            try {
                if (earlier)
                    await earlier;
            }
            finally {
                globalThis.fetch = directFetch;
                injector?.destroy();
                Reflect.deleteProperty(globalThis, 'window');
            }
        }
    });
}
