import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { EventLimit } from "./limit.js";

const decodeEventLimit = Schema.decodeUnknown(EventLimit);

describe("EventLimit", () => {
    it.effect("accepts integers in the valid range", () =>
        Effect.gen(function* () {
            const lowerBound = yield* decodeEventLimit(1);
            const withinRange = yield* decodeEventLimit(10);
            const upperBound = yield* decodeEventLimit(300);

            expect(lowerBound).toBe(1);
            expect(withinRange).toBe(10);
            expect(upperBound).toBe(300);
        }),
    );

    it.effect.each([0, -1, 301, 1.5, Number.NaN, "10"])("rejects %j", (input) =>
        decodeEventLimit(input).pipe(
            Effect.flip,
            Effect.tap((error) =>
                Effect.sync(() => {
                    expect(error._tag).toBe("ParseError");
                }),
            ),
        ),
    );
});
