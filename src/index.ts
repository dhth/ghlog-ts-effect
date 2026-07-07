import { FetchHttpClient } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { Console, Effect, Layer, pipe } from "effect";
import { getToken } from "./auth.js";
import { decodeEvents, type Event } from "./domain/event.js";
import { formatError } from "./errors.js";
import { GhCli } from "./services/github/cli.js";
import { getResponseFromGitHub } from "./services/github/index.js";

function main() {
    const run = pipe(
        getToken(),
        Effect.flatMap((token) => getResponseFromGitHub("dhth", 1, token)),
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

    const ghCliLayer = GhCli.Default.pipe(Layer.provide(NodeContext.layer));

    const appLayer = Layer.mergeAll(FetchHttpClient.layer, ghCliLayer);
    const program = run.pipe(Effect.provide(appLayer));

    Effect.runPromise(program);
}

function formatEvent(event: Event): string {
    return `${event.payload.kind.padEnd(20)} in ${event.repo.name}`;
}

main();
