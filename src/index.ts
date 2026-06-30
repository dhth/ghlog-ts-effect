import { Console, Effect, pipe, Schema } from "effect";

const Repo = Schema.Struct({
    name: Schema.String,
    url: Schema.URL,
});

type Repo = Schema.Schema.Type<typeof Repo>;

function formatRepo(repo: Repo): string {
    return `repo=${repo.name}, url=${repo.url.pathname}`;
}

function demo(input: unknown): Effect.Effect<void, never, never> {
    return pipe(
        Schema.decodeUnknown(Repo)(input),
        Effect.map(formatRepo),
        Effect.matchEffect({
            onSuccess: (repo) => Console.log(`success: ${repo}`),
            onFailure: (error) => Console.log(`error: ${error}`),
        }),
    );
}

const input: unknown = {
    name: "ghlog-ts-effect",
    url: "https://github.com/dhth/ghlog-ts-effect",
};
const program = demo(input);

Effect.runSync(program);
