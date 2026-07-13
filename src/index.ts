import { FetchHttpClient } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Console, Effect, Layer, pipe } from "effect";
import { getToken } from "./auth.js";
import type { Event } from "./domain/event.js";
import { EventLimit } from "./domain/limit.js";
import { formatError } from "./errors.js";
import { GhCli } from "./services/github/cli.js";
import { GitHubEvents } from "./services/github/events.js";

function main() {
    const run = pipe(
        GitHubEvents.getEventsForUser("dhth", EventLimit.make(10)),
        Effect.map((events) => events.map(formatEvent).join("\n")),
    );

    const ghCliLayer = GhCli.Default.pipe(Layer.provide(NodeContext.layer));
    const ghEventsLayer = getToken().pipe(
        Effect.provide(ghCliLayer),
        Effect.map((token) => GitHubEvents.Default({ token })),
        Layer.unwrapEffect,
    );

    const program = run.pipe(
        Effect.provide(ghEventsLayer),
        Effect.provide(FetchHttpClient.layer),
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

function formatEvent(event: Event): string {
    return `${event.payload.kind.padEnd(20)} in ${event.repo.name}`;
}

main();
