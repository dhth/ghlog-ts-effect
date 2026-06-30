import { Console, Effect } from "effect";

const program = Console.log("ghlog-ts-effect");

Effect.runSync(program);
