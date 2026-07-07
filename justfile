set dotenv-load := true

alias a := all
alias b := build
alias c := check
alias f := fmt
alias fl := fmt-lint-fix
alias l := lint
alias lf := lint-fix
alias r := run
alias t := test
alias ta := test-all
alias te := test-e2e
alias us := update-snapshots

@default:
    just --choose

all:
    just check
    just lint
    just test

build:
    npm run build

check:
    npm run check

fmt:
    npm run format

fmt-lint-fix:
    just fmt
    just lint-fix

lint:
    npm run lint

lint-fix:
    npm run lint:fix

run *ARGS:
    npm run dev -- {{ ARGS }}

test *ARGS:
    npm run test -- {{ ARGS }}

test-e2e *ARGS:
    npm run test:e2e -- {{ ARGS }}

test-all:
    just test
    just test-e2e

update-snapshots:
    npm run test -- -u
