import { HttpClient, HttpClientResponse } from "@effect/platform";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Redacted } from "effect";
import { EventLimit } from "../../domain/limit.js";
import { GitHubEvents } from "./events.js";

const FAKE_PAGE_SIZE = 10;

describe("GitHubEvents", () => {
    const token = Redacted.make("test-token");
    const username = "dhth";

    describe("successes", () => {
        function makeClient(numEvents: number): HttpClient.HttpClient {
            const events = Array.from({ length: numEvents }, (_, index) => ({
                id: String(index + 1),
                type: "DeleteEvent",
                actor: {
                    id: 13575379,
                    login: "dhth",
                    display_login: "dhth",
                    gravatar_id: "",
                    url: "https://api.github.com/users/dhth",
                    avatar_url:
                        "https://avatars.githubusercontent.com/u/13575379?",
                },
                repo: {
                    id: 1285436258,
                    name: "dhth/ghlog-ts-effect",
                    url: "https://api.github.com/repos/dhth/ghlog-ts-effect",
                },
                payload: {
                    ref: "rename-gh-service",
                    ref_type: "branch",
                    full_ref: "refs/heads/rename-gh-service",
                    pusher_type: "user",
                },
                public: true,
                created_at: "2026-07-12T08:58:52Z",
            }));

            return HttpClient.make((request, url) => {
                const page = Number(url.searchParams.get("page"));
                if (!Number.isInteger(page) || page < 1) {
                    return Effect.dieMessage(
                        `expected a positive page number, got '${page}'`,
                    );
                }

                const pageStart = (page - 1) * FAKE_PAGE_SIZE;
                const pageEvents = events.slice(
                    pageStart,
                    pageStart + FAKE_PAGE_SIZE,
                );
                const hasNextPage = pageStart + FAKE_PAGE_SIZE < events.length;
                const nextPageUrl = new URL(url);
                nextPageUrl.searchParams.set("page", String(page + 1));

                return Effect.succeed(
                    HttpClientResponse.fromWeb(
                        request,
                        new Response(JSON.stringify(pageEvents), {
                            status: 200,
                            headers: {
                                "Content-Type":
                                    "application/json; charset=utf-8",
                                ...(hasNextPage
                                    ? {
                                          Link: `<${nextPageUrl}>; rel="next"`,
                                      }
                                    : {}),
                            },
                        }),
                    ),
                );
            });
        }

        function expectEvents({
            eventLimit,
            eventsAvailable,
            expectedCount,
        }: {
            eventLimit: number;
            eventsAvailable: number;
            expectedCount: number;
        }) {
            // GIVEN
            const fakeSuccessfulClient = makeClient(eventsAvailable);
            const httpClient = Layer.succeed(
                HttpClient.HttpClient,
                fakeSuccessfulClient,
            );
            const ghEvents = GitHubEvents.Default({ token }).pipe(
                Layer.provide(httpClient),
            );

            // WHEN
            const program = GitHubEvents.getEventsForUser(
                username,
                EventLimit.make(eventLimit),
            ).pipe(Effect.provide(ghEvents));

            // THEN
            return program.pipe(
                Effect.tap((events) =>
                    Effect.sync(() => {
                        const expectedIds = Array.from(
                            { length: expectedCount },
                            (_, index) => String(index + 1),
                        );
                        expect(events.map((event) => event.id)).toEqual(
                            expectedIds,
                        );
                    }),
                ),
            );
        }

        it.effect("works when there are no events available", () =>
            expectEvents({
                eventLimit: FAKE_PAGE_SIZE,
                eventsAvailable: 0,
                expectedCount: 0,
            }),
        );

        it.effect(
            "works correctly when event limit is less than the page size",
            () =>
                expectEvents({
                    eventLimit: FAKE_PAGE_SIZE - 1,
                    eventsAvailable: FAKE_PAGE_SIZE * 2,
                    expectedCount: FAKE_PAGE_SIZE - 1,
                }),
        );

        it.effect(
            "works correctly when event limit is equal to the page size",
            () =>
                expectEvents({
                    eventLimit: FAKE_PAGE_SIZE,
                    eventsAvailable: FAKE_PAGE_SIZE * 2,
                    expectedCount: FAKE_PAGE_SIZE,
                }),
        );

        it.effect(
            "works correctly when event limit is equal to number of events available",
            () => {
                const eventLimit = FAKE_PAGE_SIZE * 2 + 3;

                return expectEvents({
                    eventLimit,
                    eventsAvailable: eventLimit,
                    expectedCount: eventLimit,
                });
            },
        );

        it.effect(
            "works correctly when event limit is greater than the page size",
            () =>
                expectEvents({
                    eventLimit: FAKE_PAGE_SIZE + 1,
                    eventsAvailable: FAKE_PAGE_SIZE * 2 + 1,
                    expectedCount: FAKE_PAGE_SIZE + 1,
                }),
        );

        it.effect(
            "works correctly when event limit is greater than number of events available",
            () =>
                expectEvents({
                    eventLimit: FAKE_PAGE_SIZE * 2 + 3,
                    eventsAvailable: FAKE_PAGE_SIZE * 2 + 2,
                    expectedCount: FAKE_PAGE_SIZE * 2 + 2,
                }),
        );
    });
});
