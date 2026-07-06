import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, Redacted } from "effect";
import { getToken } from "./auth.js";
import { GhCli, GhTimedOutError } from "./services/github/cli.js";

describe("getToken", () => {
    const emptyConfigProvider = ConfigProvider.fromMap(new Map());

    describe("successes", () => {
        const configProviderForToken = (token: string) =>
            ConfigProvider.fromMap(new Map([["GHLOG_TOKEN", token]]));

        const ghCliShouldNotRun = Layer.succeed(
            GhCli,
            new GhCli({
                authToken: () =>
                    Effect.dieMessage("gh cli should not have been invoked"),
            }),
        );

        const successfulGhCli = (token: string) =>
            Layer.succeed(
                GhCli,
                new GhCli({
                    authToken: () => Effect.succeed(Redacted.make(token)),
                }),
            );

        it.effect("gets the token from GHLOG_TOKEN", () => {
            // GIVEN
            const testToken = "token-from-env-var";
            const configProvider = configProviderForToken(testToken);
            const ghCli = ghCliShouldNotRun;

            // WHEN
            const result = getToken().pipe(
                Effect.withConfigProvider(configProvider),
                Effect.provide(ghCli),
            );

            // THEN
            return result.pipe(
                Effect.tap((token) =>
                    Effect.sync(() => {
                        const redacted = Redacted.value(token);
                        expect(redacted).toBe(testToken);
                    }),
                ),
            );
        });

        it.effect("trims the token from GHLOG_TOKEN", () => {
            // GIVEN
            const testToken = "token-from-env-var";
            const configProvider = configProviderForToken(`  ${testToken}  `);
            const ghCli = ghCliShouldNotRun;

            // WHEN
            const result = getToken().pipe(
                Effect.withConfigProvider(configProvider),
                Effect.provide(ghCli),
            );

            // THEN
            return result.pipe(
                Effect.tap((token) =>
                    Effect.sync(() => {
                        const redacted = Redacted.value(token);
                        expect(redacted).toBe(testToken);
                    }),
                ),
            );
        });

        it.effect("invokes gh cli if GHLOG_TOKEN is not set", () => {
            // GIVEN
            const testToken = "token-from-cli";
            const configProvider = emptyConfigProvider;
            const ghCli = successfulGhCli(testToken);

            // WHEN
            const result = getToken().pipe(
                Effect.withConfigProvider(configProvider),
                Effect.provide(ghCli),
            );

            // THEN
            return result.pipe(
                Effect.tap((token) =>
                    Effect.sync(() => {
                        const redacted = Redacted.value(token);
                        expect(redacted).toBe(testToken);
                    }),
                ),
            );
        });

        it.effect("invokes gh cli if GHLOG_TOKEN is empty", () => {
            // GIVEN
            const testToken = "token-from-cli";
            const configProvider = configProviderForToken("");
            const ghCli = successfulGhCli(testToken);

            // WHEN
            const result = getToken().pipe(
                Effect.withConfigProvider(configProvider),
                Effect.provide(ghCli),
            );

            // THEN
            return result.pipe(
                Effect.tap((token) =>
                    Effect.sync(() => {
                        const redacted = Redacted.value(token);
                        expect(redacted).toBe(testToken);
                    }),
                ),
            );
        });

        it.effect("invokes gh cli if GHLOG_TOKEN is whitespace only", () => {
            // GIVEN
            const testToken = "token-from-cli";
            const configProvider = configProviderForToken("  ");
            const ghCli = successfulGhCli(testToken);

            // WHEN
            const result = getToken().pipe(
                Effect.withConfigProvider(configProvider),
                Effect.provide(ghCli),
            );

            // THEN
            return result.pipe(
                Effect.tap((token) =>
                    Effect.sync(() => {
                        const redacted = Redacted.value(token);
                        expect(redacted).toBe(testToken);
                    }),
                ),
            );
        });
    });

    describe("failures", () => {
        const timingOutGhCli = Layer.succeed(
            GhCli,
            new GhCli({
                authToken: () => Effect.fail(new GhTimedOutError()),
            }),
        );

        it.effect("fails if GHLOG_TOKEN is not set and gh fails", () => {
            // GIVEN
            const configProvider = emptyConfigProvider;
            const ghCli = timingOutGhCli;

            // WHEN
            const result = getToken().pipe(
                Effect.withConfigProvider(configProvider),
                Effect.provide(ghCli),
            );

            // THEN
            return result.pipe(
                Effect.flip,
                Effect.tap((error) =>
                    Effect.sync(() => {
                        expect(error._tag).toBe("GetTokenError");
                        expect(error.cause._tag).toBe("GhTimedOutError");
                    }),
                ),
            );
        });
    });
});
