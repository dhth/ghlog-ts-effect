import { readFile } from "node:fs/promises";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { decodeEvents } from "./event.js";

describe("decodeEvents", () => {
    describe("successes", () => {
        it.effect("decodes events correctly", () => {
            const input = readJsonFromFile("./assets/sample-events.json");

            return input.pipe(
                Effect.flatMap(decodeEvents),
                Effect.tap((result) =>
                    Effect.sync(() => {
                        const snapshot = result.map((event) => {
                            return {
                                repo: event.repo.name,
                                kind: event.payload.kind,
                            };
                        });

                        expect(snapshot).toMatchInlineSnapshot(`
                      [
                        {
                          "kind": "push",
                          "repo": "dhth/dhth",
                        },
                        {
                          "kind": "create",
                          "repo": "dhth/ghlog-ts-effect",
                        },
                        {
                          "kind": "delete",
                          "repo": "dhth/ghlog-ts",
                        },
                        {
                          "kind": "push",
                          "repo": "dhth/ghlog-ts",
                        },
                        {
                          "kind": "pull_request",
                          "repo": "dhth/ghlog-ts",
                        },
                      ]
                    `);
                    }),
                ),
            );
        });

        it.effect("ignores unsupported events", () => {
            const input = readJsonFromFile(
                "./assets/events-including-unsupported.json",
            );

            return input.pipe(
                Effect.flatMap(decodeEvents),
                Effect.tap((result) =>
                    Effect.sync(() => {
                        const eventKinds = result.map(
                            (event) => event.payload.kind,
                        );
                        expect(eventKinds).toEqual(["push", "create"]);
                    }),
                ),
            );
        });

        it.effect("decodes an empty event list", () => {
            const input: unknown = [];
            return decodeEvents(input).pipe(
                Effect.tap((result) =>
                    Effect.sync(() => {
                        expect(result).toEqual([]);
                    }),
                ),
            );
        });
    });

    describe("failures", () => {
        it.effect("fails to decode invalid event envelope", () => {
            const input = readJsonFromFile("./assets/invalid-envelope.json");

            return input.pipe(
                Effect.flatMap(decodeEvents),
                Effect.flip,
                Effect.tap((error) =>
                    Effect.sync(() => {
                        expect(error._tag).toBe("DecodeEnvelopeError");
                    }),
                ),
            );
        });

        it.effect("fails to decode invalid event payload", () => {
            const input = readJsonFromFile("./assets/invalid-payload.json");

            return input.pipe(
                Effect.flatMap(decodeEvents),
                Effect.flip,
                Effect.tap((error) =>
                    Effect.sync(() => {
                        expect(error._tag).toBe("DecodePayloadError");
                    }),
                ),
            );
        });
    });
});

function readJsonFromFile(path: string): Effect.Effect<unknown, never> {
    return readFileContents(path).pipe(Effect.flatMap(parseJson), Effect.orDie);
}

function readFileContents(path: string): Effect.Effect<string, Error> {
    return Effect.tryPromise({
        try: () => readFile(new URL(path, import.meta.url), "utf-8"),
        catch: (error) =>
            error instanceof Error
                ? new Error("couldn't read sample events file", {
                      cause: error,
                  })
                : new Error("could't read sample events file"),
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
