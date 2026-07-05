import { Command } from "@effect/platform";
import type {
    CommandExecutor,
    ExitCode,
} from "@effect/platform/CommandExecutor";
import type { PlatformError } from "@effect/platform/Error";
import { Effect, String as EffectString, Stream } from "effect";

export type CommandResult = {
    exitCode: ExitCode;
    stdout: string;
    stderr: string;
};

// inspired by https://effect.website/docs/platform/command/#fetching-process-details
export function runCommand(
    command: string,
    ...args: Array<string>
): Effect.Effect<CommandResult, PlatformError, CommandExecutor> {
    const result = Effect.gen(function* () {
        const cmd = Command.make(command, ...args);

        const process = yield* Command.start(cmd);

        const [exitCode, stdout, stderr] = yield* Effect.all(
            [
                process.exitCode,
                streamToString(process.stdout),
                streamToString(process.stderr),
            ],
            { concurrency: 3 },
        );

        return {
            exitCode,
            stdout,
            stderr,
        };
    });

    return Effect.scoped(result);
}

function streamToString<E, R>(
    stream: Stream.Stream<Uint8Array, E, R>,
): Effect.Effect<string, E, R> {
    return stream.pipe(
        Stream.decodeText(),
        Stream.runFold(EffectString.empty, EffectString.concat),
    );
}
