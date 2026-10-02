import { Schema } from "effect";

export const EventLimit = Schema.Number.pipe(
    Schema.check(Schema.isInt()),
    Schema.check(Schema.isBetween({ minimum: 1, maximum: 300 })),
    Schema.brand("EventLimit"),
);

export type EventLimit = typeof EventLimit.Type;
