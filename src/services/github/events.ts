import {
    type Headers,
    HttpClient,
    type HttpClientError,
} from "@effect/platform";
import { Data, Effect, Redacted } from "effect";
import {
    type DecodeError,
    decodeEvents,
    type Event,
} from "../../domain/event.js";
import type { EventLimit } from "../../domain/limit.js";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const GITHUB_API_MAX_PER_PAGE = 100;

export class GitHubEvents extends Effect.Service<GitHubEvents>()(
    "GitHubEvents",
    {
        accessors: true,
        effect: Effect.gen(function* () {
            const httpClient = yield* HttpClient.HttpClient;

            return {
                getEventsForUser: (
                    username: string,
                    limit: EventLimit,
                    token: Redacted.Redacted<string>,
                ): Effect.Effect<Event[], FetchEventsError, never> => {
                    return collectEvents(username, limit, token).pipe(
                        Effect.provideService(
                            HttpClient.HttpClient,
                            httpClient,
                        ),
                    );
                },
            } as const;
        }),
    },
) {}

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

export type GitHubFetchError =
    | RequestFailedError
    | CouldntReadResponseBodyError
    | NonSuccessStatusCodeError
    | ResponseNotJsonError;

type GitHubPage = {
    events: Event[];
    hasNextPage: boolean;
};

export type FetchEventsError = GitHubFetchError | DecodeError;

function collectEvents(
    username: string,
    limit: EventLimit,
    token: Redacted.Redacted<string>,
): Effect.Effect<Event[], FetchEventsError, HttpClient.HttpClient> {
    return Effect.gen(function* () {
        const collectedEvents: Event[] = [];
        let page = 1;

        while (true) {
            const responsePage = yield* fetchEvents(username, page, token);
            for (const event of responsePage.events) {
                collectedEvents.push(event);

                if (collectedEvents.length >= limit) {
                    return collectedEvents;
                }
            }

            if (!responsePage.hasNextPage) {
                break;
            }
            page += 1;
        }

        return collectedEvents;
    });
}

function fetchEvents(
    username: string,
    page: number,
    token: Redacted.Redacted<string>,
): Effect.Effect<GitHubPage, FetchEventsError, HttpClient.HttpClient> {
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

        const hasNextPage = nextPageExists(response.headers);

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

        const parsedBody = yield* parseJson(body).pipe(
            Effect.mapError(() => new ResponseNotJsonError({ body })),
        );

        const events = yield* decodeEvents(parsedBody);

        return {
            events,
            hasNextPage,
        };
    });
}

function nextPageExists(headers: Headers.Headers): boolean {
    const link = headers.link;
    if (link === undefined) {
        return false;
    }

    return link.split(",").some((entry) =>
        entry
            .trim()
            .split(";")
            .some((part) => part.trim() === 'rel="next"'),
    );
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
