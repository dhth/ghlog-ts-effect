import { FetchHttpClient } from "@effect/platform";
import { Console, Effect, pipe } from "effect";
import { decodeEvents, type Event } from "./domain/event.js";
import { formatError } from "./errors.js";
import { getResponseFromGitHubGen } from "./services/github/index.js";

function main() {
    const run = pipe(
        getResponseFromGitHubGen("dhth", 1, "<token>"),
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

    const program = run.pipe(Effect.provide(FetchHttpClient.layer));

    Effect.runPromise(program);
}

function formatEvent(event: Event): string {
    return `${event.payload.kind.padEnd(20)} in ${event.repo.name}`;
}

main();
