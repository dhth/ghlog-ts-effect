import { Effect, String as EffectString, Stream } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess, type ChildProcessSpawner } from "effect/process";
import type { ExitCode } from "effect/process/ChildProcessSpawner";

export type CommandResult = {
    exitCode: ExitCode;
    stdout: string;
    stderr: string;
};

// inspired by https://effect.website/docs/platform/command/#fetching-process-details
export function runCommand(
    command: string,
    ...args: Array<string>
): Effect.Effect<
    CommandResult,
    PlatformError,
    ChildProcessSpawner.ChildProcessSpawner
> {
    const result = Effect.gen(function* () {
        const process = yield* ChildProcess.make(command, args);

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
        Stream.runFold(() => EffectString.empty, EffectString.concat),
    );
}
