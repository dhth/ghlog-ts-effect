import {
    Data,
    Effect,
    Array as EffectArray,
    Option,
    pipe,
    Schema,
} from "effect";
import type { ParseError } from "effect/ParseResult";

export type Event = {
    id: string;
    repo: Repo;
    payload: EventPayload;
    created_at: Date;
};

export type CreateEventPayload = {
    kind: "create";
    ref: string;
    ref_type: string;
};

export type DeleteEventPayload = {
    kind: "delete";
    ref: string;
    ref_type: string;
};

export type IssueCommentEventPayload = {
    kind: "issue_comment";
    action: string;
    issue: Issue;
    comment: IssueComment;
};

export type IssuesEventPayload = {
    kind: "issues";
    action: string;
    issue: Issue;
};

export type PullRequestEventPayload = {
    kind: "pull_request";
    action: string;
    pull_request: PullRequest;
};

export type PullRequestReviewEventPayload = {
    kind: "pull_request_review";
    action: string;
    review: PullRequestReview;
    pull_request: PullRequest;
};

export type PushEventPayload = {
    kind: "push";
    ref: string;
    head: string;
    before: string;
};

export type ReleaseEventPayload = {
    kind: "release";
    action: string;
    release: Release;
};

export type EventPayload =
    | CreateEventPayload
    | DeleteEventPayload
    | IssueCommentEventPayload
    | IssuesEventPayload
    | PullRequestEventPayload
    | PullRequestReviewEventPayload
    | PushEventPayload
    | ReleaseEventPayload;

const supportedEventTypes = [
    "CreateEvent",
    "DeleteEvent",
    "IssueCommentEvent",
    "IssuesEvent",
    "PullRequestEvent",
    "PullRequestReviewEvent",
    "PushEvent",
    "ReleaseEvent",
] as const;

type EventType = (typeof supportedEventTypes)[number];

const Repo = Schema.Struct({
    name: Schema.String,
    url: Schema.String,
});

export type Repo = typeof Repo.Type;

const Issue = Schema.Struct({
    number: Schema.Number,
    title: Schema.String,
    html_url: Schema.String,
    pull_request: Schema.optional(Schema.Unknown),
});

export type Issue = typeof Issue.Type;

const IssueComment = Schema.Struct({
    html_url: Schema.String,
});

export type IssueComment = typeof IssueComment.Type;

const PullRequestRepo = Schema.Struct({
    name: Schema.String,
});

export type PullRequestRepo = typeof PullRequestRepo.Type;

const PullRequestBranch = Schema.Struct({
    ref: Schema.String,
    repo: PullRequestRepo,
});

export const PullRequest = Schema.Struct({
    number: Schema.Number,
    base: PullRequestBranch,
    head: PullRequestBranch,
});

export type PullRequest = typeof PullRequest.Type;

const PullRequestReview = Schema.Struct({
    state: Schema.String,
    html_url: Schema.String,
});

export type PullRequestReview = typeof PullRequestReview.Type;

const Release = Schema.Struct({
    html_url: Schema.String,
    tag_name: Schema.String,
    prerelease: Schema.Boolean,
    draft: Schema.Boolean,
});

export type Release = typeof Release.Type;

export const RawEvent = Schema.Struct({
    id: Schema.String,
    type: Schema.NullOr(Schema.String),
    repo: Repo,
    payload: Schema.Unknown,
    created_at: Schema.Date,
});

export type RawEvent = typeof RawEvent.Type;

const RawEvents = Schema.Array(RawEvent);

export const RawCreateEventPayload = Schema.Struct({
    ref: Schema.String,
    ref_type: Schema.String,
});

const RawDeleteEventPayload = Schema.Struct({
    ref: Schema.String,
    ref_type: Schema.String,
});

const RawIssueCommentEventPayload = Schema.Struct({
    action: Schema.String,
    issue: Issue,
    comment: IssueComment,
});

const RawIssuesEventPayload = Schema.Struct({
    action: Schema.String,
    issue: Issue,
});

const RawPullRequestEventPayload = Schema.Struct({
    action: Schema.String,
    pull_request: PullRequest,
});

const RawPullRequestReviewEventPayload = Schema.Struct({
    action: Schema.String,
    review: PullRequestReview,
    pull_request: PullRequest,
});

const RawPushEventPayload = Schema.Struct({
    ref: Schema.String,
    head: Schema.String,
    before: Schema.String,
});

const RawReleaseEventPayload = Schema.Struct({
    action: Schema.String,
    release: Release,
});

export class DecodeEnvelopeError extends Data.TaggedError(
    "DecodeEnvelopeError",
)<{
    cause: ParseError;
}> {
    override get message(): string {
        return "couldn't decode event envelope";
    }
}

export class DecodePayloadError extends Data.TaggedError("DecodePayloadError")<{
    eventId: string;
    eventType: EventType;
    cause: ParseError;
}> {
    override get message(): string {
        return `couldn't decode event payload (id=${this.eventId}, type=${this.eventType})`;
    }
}

export type DecodeError = DecodeEnvelopeError | DecodePayloadError;

export function decodeEvents(
    input: unknown,
): Effect.Effect<Event[], DecodeError> {
    return pipe(
        Schema.decodeUnknown(RawEvents)(input).pipe(
            Effect.mapError((cause) => new DecodeEnvelopeError({ cause })),
        ),
        Effect.flatMap((rawEvents) =>
            Effect.forEach(rawEvents, decodeRawEvent),
        ),
        Effect.map(EffectArray.getSomes),
    );
}

function decodeRawEvent(
    raw: RawEvent,
): Effect.Effect<Option.Option<Event>, DecodePayloadError> {
    if (raw.type === null) {
        return Effect.succeed(Option.none());
    }

    if (!isSupportedEventType(raw.type)) {
        return Effect.succeed(Option.none());
    }

    return parseAndDecodePayload(raw.type, raw.payload, raw.id).pipe(
        Effect.map((payload) => {
            return Option.some({
                id: raw.id,
                repo: raw.repo,
                payload,
                created_at: raw.created_at,
            });
        }),
    );
}

function isSupportedEventType(value: string): value is EventType {
    return supportedEventTypes.some((eventType) => eventType === value);
}

function parseAndDecodePayload(
    eventType: EventType,
    input: unknown,
    eventId: string,
): Effect.Effect<EventPayload, DecodePayloadError> {
    const decodeInto = <A, I>(schema: Schema.Schema<A, I>) =>
        Schema.decodeUnknown(schema)(input).pipe(
            Effect.mapError(
                (cause) =>
                    new DecodePayloadError({ eventId, eventType, cause }),
            ),
        );

    switch (eventType) {
        case "CreateEvent":
            return pipe(
                decodeInto(RawCreateEventPayload),
                Effect.map((payload) => {
                    return {
                        kind: "create",
                        ref: payload.ref,
                        ref_type: payload.ref_type,
                    };
                }),
            );
        case "DeleteEvent":
            return pipe(
                decodeInto(RawDeleteEventPayload),
                Effect.map((payload) => {
                    return {
                        kind: "delete",
                        ref: payload.ref,
                        ref_type: payload.ref_type,
                    };
                }),
            );
        case "IssueCommentEvent":
            return pipe(
                decodeInto(RawIssueCommentEventPayload),
                Effect.map((payload) => {
                    return {
                        kind: "issue_comment",
                        action: payload.action,
                        issue: payload.issue,
                        comment: payload.comment,
                    };
                }),
            );
        case "IssuesEvent":
            return pipe(
                decodeInto(RawIssuesEventPayload),
                Effect.map((payload) => {
                    return {
                        kind: "issues",
                        action: payload.action,
                        issue: payload.issue,
                    };
                }),
            );
        case "PullRequestEvent":
            return pipe(
                decodeInto(RawPullRequestEventPayload),
                Effect.map((payload) => {
                    return {
                        kind: "pull_request",
                        action: payload.action,
                        pull_request: payload.pull_request,
                    };
                }),
            );
        case "PullRequestReviewEvent":
            return pipe(
                decodeInto(RawPullRequestReviewEventPayload),
                Effect.map((payload) => {
                    return {
                        kind: "pull_request_review",
                        action: payload.action,
                        review: payload.review,
                        pull_request: payload.pull_request,
                    };
                }),
            );
        case "PushEvent":
            return pipe(
                decodeInto(RawPushEventPayload),
                Effect.map((payload) => {
                    return {
                        kind: "push",
                        ref: payload.ref,
                        head: payload.head,
                        before: payload.before,
                    };
                }),
            );
        case "ReleaseEvent":
            return pipe(
                decodeInto(RawReleaseEventPayload),
                Effect.map((payload) => {
                    return {
                        kind: "release",
                        action: payload.action,
                        release: payload.release,
                    };
                }),
            );
    }
}
