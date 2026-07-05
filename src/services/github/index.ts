import { HttpClient, type HttpClientError } from "@effect/platform";
import { Data, Effect, Redacted } from "effect";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const GITHUB_API_MAX_PER_PAGE = 100;

export class RequestFailedError extends Data.TaggedError("RequestFailedError")<{
    cause: HttpClientError.HttpClientError;
}> {
    override get message(): string {
        return "couldn't make HTTP request to GitHub";
    }
}

export class CouldntReadResponseBodyError extends Data.TaggedError(
    "CouldntReadResponseBodyError",
)<{
    cause: HttpClientError.ResponseError;
}> {
    override get message(): string {
        return "couldn't read response body";
    }
}

export class NonSuccessStatusCodeError extends Data.TaggedError(
    "NonSuccessStatusCodeError",
)<{
    code: number;
    body: string;
}> {
    override get message(): string {
        return `GitHub returned '${this.code}': ${this.body}`;
    }
}

export class ResponseNotJsonError extends Data.TaggedError(
    "ResponseNotJsonError",
)<{
    body: string;
}> {
    override get message(): string {
        return "GitHub's response wasn't valid JSON";
    }
}

type GitHubFetchError =
    | RequestFailedError
    | CouldntReadResponseBodyError
    | NonSuccessStatusCodeError
    | ResponseNotJsonError;

export function getResponseFromGitHub(
    username: string,
    page: number,
    token: string,
): Effect.Effect<unknown, GitHubFetchError, HttpClient.HttpClient> {
    const url = new URL(`${GITHUB_API_BASE}/users/${username}/events/public`);
    url.searchParams.set("per_page", String(GITHUB_API_MAX_PER_PAGE));
    url.searchParams.set("page", String(page));

    return HttpClient.get(url, {
        headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
            Authorization: `Bearer ${token}`,
        },
    }).pipe(
        Effect.mapError((error) => new RequestFailedError({ cause: error })),
        Effect.flatMap((response) =>
            response.text.pipe(
                Effect.mapError(
                    (error) =>
                        new CouldntReadResponseBodyError({ cause: error }),
                ),
                Effect.map((body) => ({ statusCode: response.status, body })),
                Effect.flatMap(
                    ({
                        statusCode,
                        body,
                    }): Effect.Effect<
                        { body: string },
                        NonSuccessStatusCodeError
                    > => {
                        if (statusCode !== 200) {
                            return Effect.fail(
                                new NonSuccessStatusCodeError({
                                    code: statusCode,
                                    body,
                                }),
                            );
                        }

                        return Effect.succeed({ body });
                    },
                ),
            ),
        ),
        Effect.flatMap(({ body }) =>
            parseJson(body).pipe(
                Effect.mapError((_) => new ResponseNotJsonError({ body })),
            ),
        ),
    );
}

export function getResponseFromGitHubGen(
    username: string,
    page: number,
    token: Redacted.Redacted<string>,
): Effect.Effect<unknown, GitHubFetchError, HttpClient.HttpClient> {
    const url = new URL(`${GITHUB_API_BASE}/users/${username}/events/public`);
    url.searchParams.set("per_page", String(GITHUB_API_MAX_PER_PAGE));
    url.searchParams.set("page", String(page));
    const headers = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        Authorization: `Bearer ${Redacted.value(token)}`,
    };

    return Effect.gen(function* () {
        const response = yield* HttpClient.get(url, { headers }).pipe(
            Effect.mapError((cause) => new RequestFailedError({ cause })),
        );

        const body = yield* response.text.pipe(
            Effect.mapError(
                (cause) => new CouldntReadResponseBodyError({ cause }),
            ),
        );

        if (response.status !== 200) {
            return yield* new NonSuccessStatusCodeError({
                code: response.status,
                body,
            });
        }

        return yield* parseJson(body).pipe(
            Effect.mapError(() => new ResponseNotJsonError({ body })),
        );
    });
}

function parseJson(input: string): Effect.Effect<unknown, Error> {
    return Effect.try({
        try: () => JSON.parse(input) as unknown,
        catch: (error) =>
            error instanceof Error
                ? new Error("couldn't parse as JSON", { cause: error })
                : new Error("couldn't parse as JSON"),
    });
}
