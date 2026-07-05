import type { CommandExecutor } from "@effect/platform/CommandExecutor";
import type { PlatformError } from "@effect/platform/Error";
import { Cause, Data, Duration, Effect, Redacted } from "effect";
import { runCommand } from "./utils/command.js";

const ENV_VAR_TOKEN = "GHLOG_TOKEN";

export class GetTokenError extends Data.TaggedError("GetTokenError")<{
    cause: GetTokenFromGhError;
}> {
    override get message(): string {
        return `couldn't get a GitHub authentication token

ghlog-ts-effect tries to get this token in the following order:
- Read the environment variable '${ENV_VAR_TOKEN}' (this was not set)
- Running "gh auth token" (this failed)

Make sure ghlog-ts-effect can get a token from either one of these approaches.`;
    }
}

export function getToken(): Effect.Effect<
    Redacted.Redacted<string>,
    GetTokenError,
    CommandExecutor
> {
    return Effect.sync(() => process.env[ENV_VAR_TOKEN]).pipe(
        Effect.flatMap((value) => {
            if (value !== undefined) {
                return Effect.succeed(Redacted.make(value));
            }

            return getTokenFromGh().pipe(
                Effect.mapError((cause) => new GetTokenError({ cause })),
            );
        }),
    );
}

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
        return "running `gh` timed out";
    }
}

export type GetTokenFromGhError =
    | CouldntRunGhError
    | GhExitedWithNonSuccessCodeError
    | GhTimedOutError;

function getTokenFromGh(): Effect.Effect<
    Redacted.Redacted<string>,
    GetTokenFromGhError,
    CommandExecutor
> {
    const result = runCommand("gh", "auth", "token").pipe(
        Effect.timeout(Duration.seconds(10)),
    );

    return result.pipe(
        Effect.mapError((cause) => {
            if (Cause.isTimeoutException(cause)) {
                return new GhTimedOutError();
            }

            return new CouldntRunGhError({ cause });
        }),
        Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
                return Effect.fail(
                    new GhExitedWithNonSuccessCodeError({
                        exitCode: result.exitCode,
                        stderr: result.stderr,
                    }),
                );
            }

            return Effect.succeed(Redacted.make(result.stdout.trim()));
        }),
    );
}
