import { Config, Data, Effect, Redacted } from "effect";
import { type AuthTokenError, GhCli } from "./services/github/cli.js";

const ENV_VAR_TOKEN = "GHLOG_TOKEN";

export class GetTokenError extends Data.TaggedError("GetTokenError")<{
    cause: AuthTokenError;
}> {
    override get message(): string {
        return `couldn't get a GitHub authentication token

ghlog-ts-effect tries to get this token in the following order:
- Read the environment variable '${ENV_VAR_TOKEN}' (no usable token found)
- Running "gh auth token" (this failed)

Make sure ghlog-ts-effect can get a token from either one of these approaches.`;
    }
}

export function getToken(): Effect.Effect<
    Redacted.Redacted<string>,
    GetTokenError,
    GhCli
> {
    const getFromConfig = Config.string(ENV_VAR_TOKEN).pipe(
        Effect.map((value) => value.trim()),
        Effect.filterOrFail(
            (value) => value.length > 0,
            () => new Error("empty value"),
        ),
        Effect.map(Redacted.make),
    );

    const getFromGh = GhCli.authToken().pipe(
        Effect.mapError((cause) => new GetTokenError({ cause })),
    );

    return getFromConfig.pipe(Effect.orElse(() => getFromGh));
}
