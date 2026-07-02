import { readFile } from "node:fs/promises";
import { Console, Effect, pipe } from "effect";
import { decodeEvents, type Event } from "./domain/event.js";
import { formatError } from "./errors.js";

function main() {
    const program = pipe(
        readSampleEvents(),
        Effect.flatMap(parseJson),
        Effect.flatMap(decodeEvents),
        Effect.map((events) => events.map(formatEvent).join("\n")),
        Effect.matchEffect({
            onSuccess: (result) => Console.log(`${result}`),
            onFailure: (error) =>
                Effect.zipRight(
                    Console.error(formatError(error)),
                    Effect.sync(() => {
                        process.exitCode = 1;
                    }),
                ),
        }),
    );

    Effect.runPromise(program);
}

function readSampleEvents(): Effect.Effect<string, Error> {
    return Effect.tryPromise({
        try: () =>
            readFile(
                new URL("./assets/sample-events.json", import.meta.url),
                "utf-8",
            ),
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

function formatEvent(event: Event): string {
    return `${event.payload.kind.padEnd(20)} in ${event.repo.name}`;
}

main();
