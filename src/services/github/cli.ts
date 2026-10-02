import {
    Cause,
    Context,
    Data,
    Duration,
    Effect,
    Layer,
    Redacted,
} from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import { runCommand } from "../../utils/command.js";

export class CouldntRunGhError extends Data.TaggedError("CouldntRunGhError")<{
    cause: PlatformError;
}> {
    override get message(): string {
        return "couldn't run the 'gh' binary";
    }
}

export class GhExitedWithNonSuccessCodeError extends Data.TaggedError(
    "GhExitedWithNonSuccessCodeError",
)<{
    exitCode: number;
    stderr: string;
}> {
    override get message(): string {
        if (this.stderr.length === 0) {
            return `'gh' exited with code ${this.exitCode}`;
        }

        return `'gh' exited with code '${this.exitCode}' and the following stderr:

---
${this.stderr}---`;
    }
}

export class GhTimedOutError extends Data.TaggedError("GhTimedOutError") {
    override get message(): string {
        return "'gh' timed out";
    }
}

export class GhReturnedEmptyTokenError extends Data.TaggedError(
    "GhReturnedEmptyTokenError",
) {
    override get message(): string {
        return "'gh' returned an empty token";
    }
}

export type AuthTokenError =
    | CouldntRunGhError
    | GhExitedWithNonSuccessCodeError
    | GhTimedOutError
    | GhReturnedEmptyTokenError;

export class GhCli extends Context.Service<GhCli>()("GhCli", {
    make: Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner;

        return {
            authToken: (): Effect.Effect<
                Redacted.Redacted<string>,
                AuthTokenError,
                never
            > => {
                const result = runCommand("gh", "auth", "token").pipe(
                    Effect.provideService(ChildProcessSpawner, spawner),
                    Effect.timeout(Duration.seconds(10)),
                );

                return result.pipe(
                    Effect.mapError((cause) => {
                        if (Cause.isTimeoutError(cause)) {
                            return new GhTimedOutError();
                        }

                        return new CouldntRunGhError({ cause });
                    }),
                    Effect.flatMap(
                        (
                            result,
                        ): Effect.Effect<
                            Redacted.Redacted<string>,
                            | GhExitedWithNonSuccessCodeError
                            | GhReturnedEmptyTokenError
                        > => {
                            if (result.exitCode !== 0) {
                                return Effect.fail(
                                    new GhExitedWithNonSuccessCodeError({
                                        exitCode: result.exitCode,
                                        stderr: result.stderr,
                                    }),
                                );
                            }

                            const token = result.stdout.trim();

                            if (token.length === 0) {
                                return Effect.fail(
                                    new GhReturnedEmptyTokenError(),
                                );
                            }

                            return Effect.succeed(Redacted.make(token));
                        },
                    ),
                );
            },
        } as const;
    }),
}) {
    static readonly layer = Layer.effect(this, this.make);
}
