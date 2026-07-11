import { Schema } from "effect";

export const EventLimit = Schema.Number.pipe(
    Schema.int(),
    Schema.between(1, 300),
    Schema.brand("EventLimit"),
);

export type EventLimit = typeof EventLimit.Type;
